import { db, auth } from "./firebase-config.js";
import { buildTopicPath } from "./topic-url.js";
import { TopicService } from "./topic-service.js";
import { CacheManager } from "./cache-manager.js";
import { pickTopicIcon } from "./topic-icon-map.js";
import { initLayout } from "./ui-loader.js";
import { collection, getDocs, query, orderBy, where, documentId, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let allTopics = [];
let userStats = {};
let questionCounts = new Map();
let konularPageInitialized = false;
let authBound = false;
const subscriptions = [];

function addSubscription(unsubscribe) {
    if (typeof unsubscribe === "function") subscriptions.push(unsubscribe);
}

function clearSubscriptions() {
    while (subscriptions.length) {
        const unsubscribe = subscriptions.pop();
        try { unsubscribe(); } catch { /* noop */ }
    }
}

function bindAuthAndLoad() {
    if (authBound) return;
    authBound = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadUserStats(user.uid);
        }
        await loadTopics();
        document.body.style.visibility = "visible";
    });
    addSubscription(unsubscribe);
}

function bindUiEvents() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    window.filterTopics = (category, event) => {
        document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
        if (event?.target) event.target.classList.add("active");

        const search = searchInput.value.toLowerCase();
        renderTopics(allTopics, { category, search });
    };

    searchInput.addEventListener("input", (event) => {
        const activeTab = document.querySelector(".tab-btn.active");
        const category = activeTab?.dataset?.category || "all";
        const search = event.target.value.toLowerCase();
        renderTopics(allTopics, { category, search });
    });
}

async function loadUserStats(uid) {
    try {
        const progressSnap = await getDocs(
            query(collection(db, `users/${uid}/topic_progress`), orderBy(documentId()), limit(500))
        );

        const stats = {};
        progressSnap.forEach((progressDoc) => {
            const data = progressDoc.data() || {};
            const solved = Array.isArray(data.solvedIds)
                ? data.solvedIds.length
                : Object.keys(data.answers || {}).length;
            const correct = Number(data.correctCount || 0);
            stats[progressDoc.id] = { solved, correct };
        });
        userStats = stats;
    } catch (error) {
        console.error(error);
    }
}

async function loadTopics() {
    const container = document.getElementById("topicsContainer");
    if (!container) return;

    try {
        const cachedTopics = await CacheManager.getData("all_topics_catalog");
        const cachedCounts = await CacheManager.getData("all_topics_counts");

        if (cachedTopics?.cached && cachedTopics.data && cachedCounts?.cached && cachedCounts.data) {
            allTopics = cachedTopics.data;
            questionCounts = new Map(Object.entries(cachedCounts.data));
            renderTopics(allTopics);
            return;
        }

        const topicsQuery = query(collection(db, "topics"), orderBy("order", "asc"), limit(500));
        const snapshot = await getDocs(topicsQuery);

        const freshTopics = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.isActive && data.status !== "deleted" && !data.isDeleted) {
                freshTopics.push({ id: docSnap.id, ...data });
            }
        });

        const freshCountsMap = await loadQuestionCounts(freshTopics);
        const freshCountsObj = Object.fromEntries(freshCountsMap);

        await CacheManager.saveData("all_topics_catalog", freshTopics, 24 * 60 * 60 * 1000);
        await CacheManager.saveData("all_topics_counts", freshCountsObj, 24 * 60 * 60 * 1000);

        allTopics = freshTopics;
        questionCounts = freshCountsMap;
        renderTopics(allTopics);
    } catch (error) {
        console.error("Konu listesi yüklenemedi:", error);
        container.innerHTML = `<div class=\"text-danger p-4\">Veriler yüklenemedi: ${error.message}</div>`;
    }
}

async function loadQuestionCounts(topics) {
    const topicIds = topics.map((topic) => topic.id);
    const counts = new Map();

    if (!topicIds.length) return counts;

    const chunkSize = 30;
    const idChunks = [];
    for (let i = 0; i < topicIds.length; i += chunkSize) {
        idChunks.push(topicIds.slice(i, i + chunkSize));
    }

    try {
        await Promise.all(idChunks.map(async (chunk) => {
            const metaQuery = query(
                collection(db, "topic_packs_meta"),
                where(documentId(), "in", chunk)
            );
            const metaSnapshot = await getDocs(metaQuery);
            metaSnapshot.forEach((metaDoc) => {
                const data = metaDoc.data() || {};
                counts.set(metaDoc.id, Number(data.questionCount || 0));
            });
        }));
    } catch (error) {
        console.warn("topic_packs_meta verileri okunamadı:", error);
    }

    await Promise.all(topics.map(async (topic) => {
        if (!counts.has(topic.id) || counts.get(topic.id) === 0) {
            try {
                const questionIds = await TopicService.getTopicQuestionIdsById(topic.id);
                counts.set(topic.id, questionIds.length);
            } catch {
                counts.set(topic.id, 0);
            }
        }
    }));

    topics.forEach((topic) => {
        if (!counts.has(topic.id)) counts.set(topic.id, 0);
    });

    return counts;
}

function renderTopics(topics, options = {}) {
    const { category = "all", search = "" } = options;
    const container = document.getElementById("topicsContainer");
    if (!container) return;

    const searchTerm = search.trim().toLowerCase();
    const childrenByParent = new Map();

    topics.forEach((topic) => {
        if (!topic.parentId) return;
        const list = childrenByParent.get(topic.parentId) || [];
        list.push(topic);
        childrenByParent.set(topic.parentId, list);
    });

    const parents = topics.filter((topic) => !topic.parentId);
    const visibleParents = parents.filter((parent) => {
        if (category !== "all" && parent.category !== category) return false;

        const children = (childrenByParent.get(parent.id) || []).filter((child) => (
            category === "all" || child.category === category
        ));
        const parentMatches = !searchTerm || parent.title.toLowerCase().includes(searchTerm);
        const matchingChildren = searchTerm
            ? children.filter((child) => child.title.toLowerCase().includes(searchTerm))
            : children;

        if (searchTerm && !parentMatches && matchingChildren.length === 0) return false;
        return true;
    });

    if (visibleParents.length === 0) {
        container.innerHTML = `
          <div class="text-center p-5 text-muted" style="grid-column: 1/-1;">
            <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
            Aradığınız kriterde konu bulunamadı.
          </div>
        `;
        return;
    }

    container.innerHTML = "";
    const getQuestionCount = (id) => Number(questionCounts.get(id) || 0);

    const decoratedTopics = visibleParents.map((topic) => {
        const allChildren = (childrenByParent.get(topic.id) || []).filter((child) => (
            category === "all" || child.category === category
        ));
        const allChildrenForTotals = childrenByParent.get(topic.id) || [];

        const parentMatches = !searchTerm || topic.title.toLowerCase().includes(searchTerm);
        const matchingChildren = searchTerm
            ? allChildren.filter((child) => child.title.toLowerCase().includes(searchTerm))
            : allChildren;
        const childrenToShow = searchTerm && !parentMatches ? matchingChildren : allChildren;

        const ownStats = userStats[topic.id] || { solved: 0, correct: 0 };
        const childStats = allChildrenForTotals.reduce((acc, child) => {
            const childProgress = userStats[child.id] || { solved: 0, correct: 0 };
            acc.solved += childProgress.solved;
            acc.correct += childProgress.correct;
            return acc;
        }, { solved: 0, correct: 0 });

        const solvedTotal = ownStats.solved + childStats.solved;
        const correctTotal = ownStats.correct + childStats.correct;
        const successRate = solvedTotal > 0 ? Math.round((correctTotal / solvedTotal) * 100) : 0;

        const totalQuestionCount = getQuestionCount(topic.id)
            + allChildrenForTotals.reduce((sum, child) => sum + getQuestionCount(child.id), 0);
        const progressBase = Math.max(totalQuestionCount || 0, 1);
        const progress = Math.min(100, Math.round((solvedTotal / progressBase) * 100));
        const isCompleted = progress >= 100;

        return {
            topic,
            icon: pickTopicIcon(topic.title, topic.category),
            childrenToShow,
            progress,
            progressBase,
            successRate,
            isCompleted,
            solvedTotal
        };
    });

    decoratedTopics.sort((a, b) => {
        if (a.isCompleted === b.isCompleted) {
            return Number(a.topic.order || 0) - Number(b.topic.order || 0);
        }
        return a.isCompleted ? 1 : -1;
    });

    decoratedTopics.forEach(({ topic, icon, childrenToShow, progress, progressBase, successRate, isCompleted, solvedTotal }) => {
        const card = document.createElement("div");
        card.className = `topic-card${isCompleted ? " is-completed" : ""}`;

        const subtopicsHtml = childrenToShow.length ? `
          <div class="subtopic-list">
            ${childrenToShow.map((child) => `
              <a class="subtopic-link" href="${buildTopicPath(child)}">
                <span class="subtopic-title-wrap">
                  <span class="subtopic-icon">${pickTopicIcon(child.title, child.category, { isSubtopic: true })}</span>
                  <span title="${child.title}">${child.title}</span>
                </span>
                <span class="subtopic-meta">
                  <span class="subtopic-meta-badge" title="Sınavda çıkacak hedef soru sayısı">
                    <span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/></svg></span>
                    ${child.totalQuestionTarget || 0}
                  </span>
                </span>
              </a>
            `).join("")}
          </div>
        ` : "";

        const progressHtml = `
          <div class="topic-progress-hero">
            <div class="progress-container" role="progressbar" aria-label="${topic.title} ilerleme" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="topic-progress-line">
              <span class="progress-info-item progress-info-item-main" title="İlerleme: %${progress}" aria-label="İlerleme %${progress}">
                <span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19h16"/><path d="M7 15l4-4 3 3 4-5"/><path d="M18 9h3v3"/></svg></span>
                <span class="progress-info-copy"><span class="progress-info-label">İlerleme</span><strong>%${progress}</strong></span>
              </span>
              <span class="progress-info-item progress-info-item-count" title="Çözülen / Toplam: ${solvedTotal}/${progressBase}" aria-label="Çözülen ${solvedTotal}, toplam ${progressBase}">
                <span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="7" width="10" height="10" rx="2"/><path d="M10 7v-2h10a2 2 0 0 1 2 2v10h-2"/></svg></span>
                <span class="progress-info-copy"><span class="progress-info-label">Çözülen / Toplam</span><strong>${solvedTotal}/${progressBase}</strong></span>
              </span>
              <span class="progress-info-item progress-info-item-success" title="Başarı: %${successRate}" aria-label="Başarı %${successRate}">
                <span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7 10 17l-5-5"/></svg></span>
                <span class="progress-info-copy"><span class="progress-info-label">Başarı</span><strong>%${successRate}</strong></span>
              </span>
              ${topic.totalQuestionTarget ? `<span class="progress-info-item progress-info-item-target" title="Sınavda çıkacak hedef soru sayısı" aria-label="Hedef soru ${topic.totalQuestionTarget}"><span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/></svg></span><span class="progress-info-copy"><span class="progress-info-label">Hedef soru</span><strong>${topic.totalQuestionTarget}</strong></span></span>` : ""}
            </div>
          </div>
        `;

        card.innerHTML = `
          <a href="${buildTopicPath(topic)}" class="topic-main-link" style="text-decoration:none; color:inherit; display:block; flex-grow: 1;">
            <div class="card-header-row">
              <div class="topic-icon">${icon}</div>
              <span class="topic-badge badge-${topic.category}">${topic.category === "ortak" ? "Ortak" : "Alan"}</span>
            </div>

            <h3 class="topic-title">${topic.title}</h3>
            ${isCompleted ? "<div class=\"topic-completed-badge\">🏁 Bu konu tamamlandı</div>" : ""}
            <p class="topic-desc">${topic.description || "Konu açıklaması bulunmuyor."}</p>
          </a>
          ${subtopicsHtml}
          ${progressHtml}
        `;

        container.appendChild(card);
    });
}

export async function initKonularPage(options = {}) {
    if (konularPageInitialized) return;
    konularPageInitialized = true;

    if (options.skipLayout !== true) {
        await initLayout();
    }

    bindUiEvents();
    bindAuthAndLoad();
}

export function disposeKonularPage() {
    clearSubscriptions();
    authBound = false;
    konularPageInitialized = false;
    userStats = {};
}

document.addEventListener("DOMContentLoaded", () => {
    void initKonularPage();
});
