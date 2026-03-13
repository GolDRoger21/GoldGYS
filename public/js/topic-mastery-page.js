import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, documentId, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "./firestore-metrics.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showConfirm, showToast } from "./notifications.js";
import { TopicService } from "./topic-service.js";
import { buildTopicHref } from "./topic-url.js";
import { CacheManager } from "./cache-manager.js";
import { USER_CACHE_KEYS } from "./cache-keys.js";
import { initLayout } from "./ui-loader.js";

const ANALYSIS_CACHE_TTL = 30 * 60 * 1000;
const TOPIC_META_FETCH_LIMIT = 8;

const state = {
    userId: null,
    results: [],
    topics: [],
    progressMap: new Map(),
    successMap: new Map(),
    currentTopicId: null,
    statsResetAt: null,
    topicResets: {},
    topicFilter: "in_progress",
    search: "",
    sortBy: "smart"
};

let masteryInitialized = false;
let masteryAuthUnsubscribe = null;

function parseNum(v) {
    const num = Number(v);
    return Number.isFinite(num) ? num : 0;
}

function normalizeStr(str) {
    if (!str) return "";
    let s = str.toString().toLocaleLowerCase("tr-TR").trim();
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
    s = s.replace(/[\s\-_.,;()'"]/g, "");
    return s;
}

function getCompletedSeconds(exam) {
    return exam?.completedAt?.seconds || null;
}

function getTopicQuestionTotal(topic, progress = null) {
    return [
        topic?._fetchedTotal,
        topic?.totalQuestions,
        topic?.questionCount,
        topic?.questionsCount,
        topic?.targetQuestions,
        progress?.totalQuestions,
        progress?.questionCount
    ].map(parseNum).find((v) => v > 0) || 0;
}

function getProgressSolvedCount(progress = {}) {
    return Math.max(
        parseNum(progress?.solvedCount),
        parseNum(progress?.answeredCount),
        parseNum(progress?.correctCount) + parseNum(progress?.wrongCount),
        Array.isArray(progress?.solvedIds) ? progress.solvedIds.length : 0,
        progress?.answers ? Object.keys(progress.answers).length : 0
    );
}

function normalizeResetTimestamp(timestamp) {
    if (!timestamp) return null;
    if (typeof timestamp.seconds === "number") return timestamp.seconds;
    if (typeof timestamp.toDate === "function") return Math.floor(timestamp.toDate().getTime() / 1000);
    return null;
}

function normalizeTopicResets(topicResets = {}) {
    return Object.entries(topicResets).reduce((acc, [topicId, timestamp]) => {
        const seconds = normalizeResetTimestamp(timestamp);
        if (seconds) acc[topicId] = seconds;
        return acc;
    }, {});
}

function resolveCurrentTopicId(currentTopicId, currentTopicUpdatedAt, statsResetAt, topicResets) {
    if (!currentTopicId) return null;
    if (statsResetAt && (!currentTopicUpdatedAt || currentTopicUpdatedAt <= statsResetAt)) return null;
    const topicResetAt = topicResets?.[currentTopicId];
    if (topicResetAt && (!currentTopicUpdatedAt || currentTopicUpdatedAt <= topicResetAt)) return null;
    return currentTopicId;
}

function applyGlobalReset(results, resetAtSeconds) {
    if (!resetAtSeconds) return results;
    return results.filter((result) => {
        const completedAt = getCompletedSeconds(result);
        if (!completedAt) return true;
        return completedAt > resetAtSeconds;
    });
}

function getEffectiveTopics(topics = state.topics) {
    const childParentIds = new Set(topics.filter((t) => t?.parentId).map((t) => t.parentId));
    return topics.filter((topic) => !childParentIds.has(topic.id));
}

async function hydrateTopicTotals(topics) {
    const unresolved = [];
    for (const topic of topics) {
        const totalFromDoc = getTopicQuestionTotal(topic);
        if (totalFromDoc > 0) {
            topic._fetchedTotal = totalFromDoc;
            continue;
        }
        const cacheKey = `topic_pack_meta_${topic.id}`;
        const cachedMeta = await CacheManager.getData(cacheKey, 24 * 60 * 60 * 1000);
        const cachedCount = parseNum(cachedMeta?.data?.questionCount);
        if (cachedCount > 0) {
            topic._fetchedTotal = cachedCount;
            continue;
        }
        unresolved.push(topic);
    }

    await Promise.all(unresolved.slice(0, TOPIC_META_FETCH_LIMIT).map(async (topic) => {
        try {
            const meta = await TopicService.getTopicPackMeta(topic.id);
            const count = parseNum(meta?.questionCount || (Array.isArray(meta?.questionIds) ? meta.questionIds.length : 0));
            if (count > 0) topic._fetchedTotal = count;
        } catch {
            // noop
        }
    }));
}

function buildCategoryTotals(results, topics, topicResets) {
    const categoryTotals = {};
    topics.forEach((topic) => { categoryTotals[topic.id] = { correct: 0, total: 0 }; });

    results.forEach((exam) => {
        if (!exam.categoryStats) return;
        const completedAt = getCompletedSeconds(exam);
        Object.entries(exam.categoryStats).forEach(([cat, stats]) => {
            const normCat = normalizeStr(cat);
            const topic = topics.find(t =>
                t.id === cat ||
                t.slug === cat ||
                normalizeStr(t.title) === normCat ||
                (t.shortName && normalizeStr(t.shortName) === normCat) ||
                (normCat.length > 5 && normalizeStr(t.title).includes(normCat)) ||
                (normCat.length > 5 && normCat.includes(normalizeStr(t.title)))
            );
            if (!topic) return;
            const resetAt = topicResets?.[topic.id];
            if (resetAt && completedAt && completedAt <= resetAt) return;
            categoryTotals[topic.id].correct += parseNum(stats.correct);
            categoryTotals[topic.id].total += parseNum(stats.total);
        });
    });
    return categoryTotals;
}

function buildTopicSuccessMap(topics, categoryTotals) {
    const map = new Map();
    topics.forEach((topic) => {
        const progress = state.progressMap.get(topic.id) || state.progressMap.get(topic.slug) || {};
        const solvedCount = getProgressSolvedCount(progress);
        const totalQuestions = getTopicQuestionTotal(topic, progress);
        const progressUpdatedAt = normalizeResetTimestamp(progress?.updatedAt) || normalizeResetTimestamp(progress?.lastSyncedAt) || 0;
        const isReset = (state.statsResetAt && progressUpdatedAt <= state.statsResetAt) ||
            (state.topicResets?.[topic.id] && progressUpdatedAt <= state.topicResets[topic.id]);
        let successValue = 0;
        if (!isReset && totalQuestions > 0 && solvedCount > 0) {
            successValue = Math.round((solvedCount / totalQuestions) * 100);
        } else {
            const stats = categoryTotals[topic.id];
            if (stats && stats.total > 0) {
                successValue = Math.round((stats.correct / stats.total) * 100);
            }
        }
        map.set(topic.id, Math.min(100, successValue));
    });
    return map;
}

function getTopicStatus(topicId) {
    const topic = state.topics.find((t) => t.id === topicId) || {};
    const progress = state.progressMap.get(topicId) || state.progressMap.get(topic.slug) || {};
    const solvedCount = getProgressSolvedCount(progress);
    const progressUpdatedAt = normalizeResetTimestamp(progress?.updatedAt) || normalizeResetTimestamp(progress?.lastSyncedAt) || 0;

    if (state.statsResetAt && progressUpdatedAt <= state.statsResetAt) return "pending";
    const topicResetAt = state.topicResets?.[topicId];
    if (topicResetAt && progressUpdatedAt <= topicResetAt) return "pending";
    if (progress?.status === "completed") return "completed";
    if (solvedCount > 0) return "in_progress";
    const successVal = state.successMap ? state.successMap.get(topicId) : 0;
    if (successVal > 0) return "in_progress";
    if (progress?.status === "in_progress" || topicId === state.currentTopicId) return "in_progress";
    return "pending";
}

function getBadgeHTMLForStatus(status) {
    if (status === "completed") return '<span class="status-badge badge-green"><span class="badge-dot"></span>Tamamlandı</span>';
    if (status === "in_progress") return '<span class="status-badge badge-blue"><span class="badge-dot pulse"></span>Çalışılıyor</span>';
    return '<span class="status-badge badge-gray"><span class="badge-dot"></span>Başlanmadı</span>';
}

function getProgressColor(val) {
    if (val >= 80) return "var(--color-success)";
    if (val >= 50) return "var(--color-warning)";
    if (val > 0) return "var(--color-danger)";
    return "var(--border-color)";
}

function getCompleteIcon() {
    return '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1" d="M5 13l4 4L19 7"></path></svg>';
}

function getFocusIcon(isFocused) {
    if (isFocused) {
        return '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>';
    }
    return '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
}

function getResetIcon() {
    return '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m14.356 2A8 8 0 106.582 9m0 0H9"></path></svg>';
}

function sortTopics(rows) {
    if (state.sortBy === "alphabetical") return rows.sort((a, b) => a.topic.title.localeCompare(b.topic.title, "tr"));
    if (state.sortBy === "strongest") return rows.sort((a, b) => b.success - a.success);
    if (state.sortBy === "weakest") return rows.sort((a, b) => a.success - b.success);
    return rows.sort((a, b) => {
        if (state.topicFilter === "in_progress" || state.topicFilter === "completed") {
            if (b.success !== a.success) return b.success - a.success;
        }
        const tA = parseNum(a.topic.totalQuestionTarget || a.topic.targetQuestions || a.topic._fetchedTotal);
        const tB = parseNum(b.topic.totalQuestionTarget || b.topic.targetQuestions || b.topic._fetchedTotal);
        if (tB !== tA) return tB - tA;
        return b.success - a.success;
    });
}

function updateLastUpdate() {
    const el = document.getElementById("masteryLastUpdate");
    if (!el) return;
    el.innerText = `Son güncelleme: ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
    el.classList.remove("status-in-progress");
    el.classList.add("status-completed");
}

function renderSummary(rows) {
    const completed = rows.filter((row) => row.status === "completed").length;
    const inProgress = rows.filter((row) => row.status === "in_progress").length;
    const pending = rows.filter((row) => row.status === "pending").length;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = String(value);
    };
    setText("masteryCompleted", completed);
    setText("masteryInProgress", inProgress);
    setText("masteryPending", pending);
}

function renderTopicCards(rows) {
    const container = document.getElementById("topicMasteryCards");
    if (!container) return;
    if (!rows.length) {
        container.innerHTML = '<div class="text-center text-muted" style="padding:12px;">Filtreye uygun konu bulunamadı.</div>';
        return;
    }

    container.innerHTML = rows.map(({ topic, success, status }) => {
        const topicUrl = buildTopicHref ? buildTopicHref(topic) : `/konu/${topic.slug || topic.id}`;
        const badgeData = getBadgeHTMLForStatus(status);
        const focusIcon = getFocusIcon(topic.id === state.currentTopicId);
        return `
          <article class="mastery-card">
            <a href="${topicUrl}" class="mastery-card-title">${topic.title}</a>
            <div class="mastery-card-meta">
              <div class="progress-container">
                <div class="progress-bar-wrap">
                  <div class="progress-bar-fill" style="width:${success}%; background:${getProgressColor(success)};"></div>
                </div>
                <span class="progress-val" style="color:${getProgressColor(success)};">%${success}</span>
              </div>
              ${badgeData}
            </div>
            <div class="mastery-card-actions">
              <button class="glass-icon-btn btn-complete" onclick="window.toggleMasteryTopicStatus('${topic.id}', 'completed')" title="Öğrendim / Çalıştım">${getCompleteIcon()}</button>
              <button class="glass-icon-btn btn-focus ${topic.id === state.currentTopicId ? "is-focused" : ""}" onclick="window.setMasteryFocusTopic('${topic.id}')" title="Bu konuya odaklan">${focusIcon}</button>
              <button class="glass-icon-btn btn-reset" onclick="window.resetMasteryTopicStats('${topic.id}')" title="Konu istatistiğini sıfırla">${getResetIcon()}</button>
            </div>
          </article>
        `;
    }).join("");
}

function renderTopicList() {
    const tableBody = document.getElementById("topicMasteryList");
    if (!tableBody) return;

    const effectiveTopics = getEffectiveTopics(state.topics);
    let allRows = effectiveTopics.map((topic) => ({
        topic,
        success: state.successMap.get(topic.id) || 0,
        status: getTopicStatus(topic.id)
    }));
    
    renderSummary(allRows);

    let rows = allRows.filter((row) => state.topicFilter === "all" || row.status === state.topicFilter);
    if (state.search.trim()) {
        const q = normalizeStr(state.search);
        rows = rows.filter((row) => normalizeStr(row.topic.title).includes(q));
    }
    rows = sortTopics(rows);
    renderTopicCards(rows);

    if (!rows.length) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Filtreye uygun konu bulunamadı.</td></tr>';
        return;
    }

    tableBody.innerHTML = rows.map(({ topic, success, status }) => {
        const badgeData = getBadgeHTMLForStatus(status);
        const focusIcon = getFocusIcon(topic.id === state.currentTopicId);
        const isCurrentRow = topic.id === state.currentTopicId ? "active-focus-row" : "";
        const topicUrl = buildTopicHref ? buildTopicHref(topic) : `/konu/${topic.slug || topic.id}`;
        return `<tr class="topic-row ${isCurrentRow}" data-status="${status}">
            <td data-label="Konu">
                <a href="${topicUrl}" class="topic-title-main" style="text-decoration:none; display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--text-main);">${topic.title}</span>
                </a>
                <div class="topic-desc-sub" style="margin-top:4px;">${topic.description || ""}</div>
            </td>
            <td data-label="Başarı">
                <div class="progress-container">
                    <div class="progress-bar-wrap">
                        <div class="progress-bar-fill" style="width:${success}%; background:${getProgressColor(success)};"></div>
                    </div>
                    <span class="progress-val" style="color:${getProgressColor(success)};">%${success}</span>
                </div>
            </td>
            <td data-label="Durum">
                <div class="topic-status-cell">${badgeData}${topic.id === state.currentTopicId ? '<span class="focus-indicator">Odak</span>' : ""}</div>
            </td>
            <td data-label="İşlemler">
              <div class="action-buttons">
                <button class="glass-icon-btn btn-complete" onclick="window.toggleMasteryTopicStatus('${topic.id}', 'completed')" title="Öğrendim / Çalıştım">${getCompleteIcon()}</button>
                <button class="glass-icon-btn btn-focus ${topic.id === state.currentTopicId ? "is-focused" : ""}" onclick="window.setMasteryFocusTopic('${topic.id}')" title="Bu konuya odaklan">${focusIcon}</button>
                <button class="glass-icon-btn btn-reset" onclick="window.resetMasteryTopicStats('${topic.id}')" title="İstatistikleri sıfırla">${getResetIcon()}</button>
              </div>
            </td>
        </tr>`;
    }).join("");
}

function bindEvents() {
    const searchInput = document.getElementById("topicMasterySearchInput");
    const sortSelect = document.getElementById("topicMasterySortSelect");
    const chips = document.querySelectorAll("#topicMasteryFilterChips button");
    const filterDesc = document.getElementById("topicMasteryFilterDescription");
    const resetAllBtn = document.getElementById("resetAllMasteryStatsBtn");

    const filterTexts = {
        in_progress: "Şu an çalışmaya devam ettiğiniz veya odaklandığınız konular",
        pending: "Henüz çalışmaya veya test çözmeye başlamadığınız konular",
        completed: "Tamamladığınız konular",
        all: "Tüm konular"
    };

    if (chips.length) {
        chips.forEach((chip) => {
            chip.addEventListener("click", () => {
                state.topicFilter = chip.dataset.filter;
                chips.forEach((c) => {
                    c.classList.remove("badge-blue", "is-active");
                    c.classList.add("badge-gray");
                });
                chip.classList.remove("badge-gray");
                chip.classList.add("badge-blue", "is-active");
                if (filterDesc) {
                    if (window.innerWidth <= 768) {
                        filterDesc.style.display = "block";
                        filterDesc.innerText = filterTexts[state.topicFilter] || "";
                    } else {
                        filterDesc.style.display = "none";
                    }
                }
                renderTopicList();
            });
        });
    }

    const activeChip = Array.from(chips).find(c => c.dataset.filter === state.topicFilter) || Array.from(chips).find(c => c.classList.contains('badge-blue'));
    if (activeChip) {
        chips.forEach(c => c.classList.remove('is-active'));
        activeChip.classList.add('is-active');
    }

    if (filterDesc && window.innerWidth <= 768 && activeChip) {
        filterDesc.style.display = 'block';
        filterDesc.innerText = filterTexts[activeChip.dataset.filter] || '';
    }

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            state.search = e.target.value;
            renderTopicList();
        });
    }
    if (sortSelect) {
        sortSelect.addEventListener("change", (e) => {
            state.sortBy = e.target.value;
            renderTopicList();
        });
    }
    if (resetAllBtn) {
        resetAllBtn.addEventListener("click", resetAllStats);
    }
}

async function syncCachedUserProfilePatch(userId, patch = {}) {
    const userCacheKey = USER_CACHE_KEYS.userProfile(userId);
    const cachedUser = await CacheManager.getData(userCacheKey, ANALYSIS_CACHE_TTL);
    const baseUser = (cachedUser?.cached && cachedUser?.data && typeof cachedUser.data === "object") ? cachedUser.data : {};
    await CacheManager.saveData(userCacheKey, { ...baseUser, ...patch }, ANALYSIS_CACHE_TTL);
}

window.toggleMasteryTopicStatus = async (topicId, newStatus) => {
    const ok = await showConfirm("Konu durumunu güncellemek istiyor musun?", { title: "Durum Güncelle", confirmText: "Güncelle", cancelText: "Vazgeç", tone: "warning" });
    if (!ok) return;
    await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), { status: newStatus, manualCompleted: true, updatedAt: serverTimestamp() }, { merge: true });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const current = state.progressMap.get(topicId) || {};
    state.progressMap.set(topicId, { ...current, status: newStatus, manualCompleted: true, updatedAt: { seconds: nowSeconds } });
    await CacheManager.saveData(USER_CACHE_KEYS.topicProgressCollection(state.userId), [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderTopicList();
};

window.setMasteryFocusTopic = async (topicId) => {
    const isCurrent = state.currentTopicId === topicId;
    await setDoc(doc(db, "users", state.userId), {
        currentTopicId: isCurrent ? null : topicId,
        currentTopicUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
    if (!isCurrent) {
        await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), { status: "in_progress", updatedAt: serverTimestamp() }, { merge: true });
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    state.currentTopicId = isCurrent ? null : topicId;
    await syncCachedUserProfilePatch(state.userId, {
        currentTopicId: state.currentTopicId,
        currentTopicUpdatedAt: { seconds: nowSeconds },
        updatedAt: { seconds: nowSeconds }
    });
    if (!isCurrent) {
        const current = state.progressMap.get(topicId) || {};
        state.progressMap.set(topicId, { ...current, status: "in_progress", updatedAt: { seconds: nowSeconds } });
    }
    await CacheManager.saveData(USER_CACHE_KEYS.topicProgressCollection(state.userId), [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderTopicList();
};

window.resetMasteryTopicStats = async (topicId) => {
    const ok = await showConfirm("Bu konuya ait istatistikleri sıfırlamak istediğine emin misin?", { title: "Konu İstatistiğini Sıfırla", confirmText: "Sıfırla", cancelText: "Vazgeç", tone: "warning" });
    if (!ok) return;
    const updates = { [`topicResets.${topicId}`]: serverTimestamp(), updatedAt: serverTimestamp() };
    if (state.currentTopicId === topicId) {
        updates.currentTopicId = null;
        updates.currentTopicUpdatedAt = serverTimestamp();
    }
    await setDoc(doc(db, "users", state.userId), updates, { merge: true });
    await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
        status: "pending",
        manualCompleted: false,
        updatedAt: serverTimestamp(),
        lastSyncedAt: serverTimestamp(),
        solvedCount: 0,
        solvedIds: [],
        answers: {}
    }, { merge: true });
    const nowSeconds = Math.floor(Date.now() / 1000);
    state.topicResets[topicId] = nowSeconds;
    if (state.currentTopicId === topicId) state.currentTopicId = null;
    await syncCachedUserProfilePatch(state.userId, {
        topicResets: { ...(state.topicResets || {}) },
        currentTopicId: state.currentTopicId,
        currentTopicUpdatedAt: { seconds: nowSeconds },
        updatedAt: { seconds: nowSeconds }
    });
    const current = state.progressMap.get(topicId) || {};
    state.progressMap.set(topicId, {
        ...current,
        status: "pending",
        manualCompleted: false,
        updatedAt: { seconds: nowSeconds },
        lastSyncedAt: { seconds: nowSeconds },
        solvedCount: 0,
        solvedIds: [],
        answers: {}
    });
    await CacheManager.saveData(USER_CACHE_KEYS.topicProgressCollection(state.userId), [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderTopicList();
};

async function runChunked(tasks, chunkSize) {
    for (let i = 0; i < tasks.length; i += chunkSize) {
        await Promise.all(tasks.slice(i, i + chunkSize).map((task) => task()));
    }
}

async function resetAllStats() {
    const ok = await showConfirm("Tüm konu takip istatistikleri sıfırlanacak. Onaylıyor musun?", { title: "Tüm Verileri Sıfırla", confirmText: "Evet", cancelText: "Hayır", tone: "warning" });
    if (!ok) return;
    await setDoc(doc(db, "users", state.userId), {
        statsResetAt: serverTimestamp(),
        topicResets: {},
        currentTopicId: null,
        currentTopicUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });

    try {
        const progressSnap = await getDocs(
            query(
                collection(db, `users/${state.userId}/topic_progress`),
                orderBy(documentId()),
                limit(1000)
            ),
            "users.topic_progress"
        );
        const updateTasks = progressSnap.docs.map((d) => () => setDoc(d.ref, {
            status: 'pending',
            manualCompleted: false,
            updatedAt: serverTimestamp(),
            lastSyncedAt: serverTimestamp(),
            solvedCount: 0,
            solvedIds: [],
            answers: {}
        }, { merge: true }));
        await runChunked(updateTasks, 100);
    } catch (err) {
        console.warn("Toplu progress sıfırlama uyarısı:", err);
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    state.statsResetAt = nowSeconds;
    state.topicResets = {};
    state.currentTopicId = null;
    
    await syncCachedUserProfilePatch(state.userId, {
        statsResetAt: { seconds: nowSeconds },
        topicResets: {},
        currentTopicId: null,
        currentTopicUpdatedAt: { seconds: nowSeconds },
        updatedAt: { seconds: nowSeconds }
    });

    state.progressMap.forEach((data, key) => {
        state.progressMap.set(key, {
            ...data,
            status: 'pending',
            manualCompleted: false,
            updatedAt: { seconds: nowSeconds },
            lastSyncedAt: { seconds: nowSeconds },
            solvedCount: 0,
            solvedIds: [],
            answers: {}
        });
    });
    
    await CacheManager.saveData(USER_CACHE_KEYS.topicProgressCollection(state.userId), [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderTopicList();
    showToast("Konu hakimiyet verileri sıfırlandı.", "success");
}

async function initTopicMastery(userId) {
    try {
        const [topicsCache, resultsCache, progressCache, userCache] = await Promise.all([
            CacheManager.getData("all_topics", 24 * 60 * 60 * 1000),
            CacheManager.getData(USER_CACHE_KEYS.examResultsCollection(userId), ANALYSIS_CACHE_TTL),
            CacheManager.getData(USER_CACHE_KEYS.topicProgressCollection(userId), ANALYSIS_CACHE_TTL),
            CacheManager.getData(USER_CACHE_KEYS.userProfile(userId), ANALYSIS_CACHE_TTL)
        ]);

        let allTopics = topicsCache?.cached && topicsCache.data
            ? topicsCache.data
            : (await getDocs(query(collection(db, "topics"), orderBy("order", "asc"), limit(500)), "topics")).docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((t) => t.isActive !== false && t.status !== "deleted" && t.isDeleted !== true);
        if (!topicsCache?.cached) await CacheManager.saveData("all_topics", allTopics, 24 * 60 * 60 * 1000);

        let rawResults = resultsCache?.cached && resultsCache.data
            ? resultsCache.data
            : (await getDocs(query(collection(db, `users/${userId}/exam_results`), orderBy("completedAt", "desc"), limit(100)), "users.exam_results")).docs.map((d) => d.data());
        if (!resultsCache?.cached) await CacheManager.saveData(USER_CACHE_KEYS.examResultsCollection(userId), rawResults, ANALYSIS_CACHE_TTL);

        let progressMapDocs = progressCache?.cached && progressCache.data
            ? progressCache.data
            : (await getDocs(query(collection(db, `users/${userId}/topic_progress`), orderBy(documentId()), limit(500)), "users.topic_progress"))
                .docs.map((d) => ({ id: d.id, data: d.data() }));
        if (!progressCache?.cached) await CacheManager.saveData(USER_CACHE_KEYS.topicProgressCollection(userId), progressMapDocs, ANALYSIS_CACHE_TTL);

        let userData = userCache?.cached && userCache.data
            ? userCache.data
            : {};
        if (!userCache?.cached) {
            const userSnap = await getDoc(doc(db, "users", userId));
            userData = userSnap.exists() ? userSnap.data() : {};
            if (userSnap.exists()) await CacheManager.saveData(USER_CACHE_KEYS.userProfile(userId), userData, ANALYSIS_CACHE_TTL);
        }

        state.statsResetAt = normalizeResetTimestamp(userData.statsResetAt);
        state.topicResets = normalizeTopicResets(userData.topicResets);
        state.currentTopicId = resolveCurrentTopicId(
            userData.currentTopicId,
            normalizeResetTimestamp(userData.currentTopicUpdatedAt),
            state.statsResetAt,
            state.topicResets
        );
        state.results = applyGlobalReset(rawResults, state.statsResetAt);
        state.topics = allTopics;
        await hydrateTopicTotals(state.topics);
        state.progressMap = new Map(progressMapDocs.map((d) => [d.id, d.data]));

        const categoryTotals = buildCategoryTotals(state.results, state.topics, state.topicResets);
        state.successMap = buildTopicSuccessMap(state.topics, categoryTotals);
        renderTopicList();
        updateLastUpdate();
    } catch (error) {
        console.error("Konu hakimiyet verisi yüklenemedi:", error);
        showToast("Konu hakimiyet verileri yüklenirken hata oluştu.", "error");
    }
}

export async function initTopicMasteryPage(options = {}) {
    if (masteryInitialized) return;
    masteryInitialized = true;

    if (options.skipLayout !== true) {
        await initLayout();
    }

    bindEvents();
    masteryAuthUnsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "/login.html";
            return;
        }
        state.userId = user.uid;
        await initTopicMastery(user.uid);
    });
}

export function disposeTopicMasteryPage() {
    if (typeof masteryAuthUnsubscribe === "function") {
        masteryAuthUnsubscribe();
        masteryAuthUnsubscribe = null;
    }
    masteryInitialized = false;
}

document.addEventListener("DOMContentLoaded", () => {
    void initTopicMasteryPage();
});
