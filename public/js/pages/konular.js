import { db, auth } from '../firebase-config.js';
import { collection, getDocs, query, orderBy, getCountFromServer, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { CacheManager } from "../modules/cache-manager.js";

let allTopics = [];
let userStats = {};
let questionCounts = new Map();
let unsubscribeAuth = null;
let isMounted = false; // YENİ: SPA State Check

const QUESTION_COUNT_CACHE_KEY = 'topic_question_counts_v2';
const QUESTION_COUNT_CACHE_TTL = 24 * 60 * 60 * 1000;


export async function mount(params) {
    console.log('Konular sayfası başlatılıyor...');
    if (isMounted) return;
    isMounted = true;

    // Reset State
    allTopics = [];
    userStats = {};
    questionCounts = new Map();

    attachEventListeners();

    if (unsubscribeAuth) unsubscribeAuth();

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (!isMounted) return;
        if (user) {
            await loadUserStats(user.uid);
            if (isMounted) await loadTopics();
        } else {
            if (isMounted) await loadTopics();
        }
    });

    const user = auth.currentUser;
    if (user) {
        // Listener handles it
    }
}

export function unmount() {
    isMounted = false; // Stop all async ops
    if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
    }
    allTopics = [];
    userStats = {};
    questionCounts = new Map();
}


function attachEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (!isMounted) return;
            const activeTab = document.querySelector('.tab-btn.active');
            const category = activeTab?.dataset?.category || 'all';
            const search = e.target.value.toLowerCase();
            renderTopics(allTopics, { category, search });
        });
    }

    // Global filter function
    window.filterTopics = (category, ev) => {
        if (!isMounted) return;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        if (ev?.target) ev.target.classList.add('active');

        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        renderTopics(allTopics, { category, search });
    };
}

function getCurrentFilter() {
    const activeTab = document.querySelector('.tab-btn.active');
    const category = activeTab?.dataset?.category || 'all';
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    return { category, search };
}

async function loadUserStats(uid) {
    if (!isMounted) return;
    try {
        // Mock or Real fetch
        userStats = {
            'topic_anayasa': { solved: 45, correct: 38, total: 120 },
            'topic_cmk': { solved: 12, correct: 5, total: 80 }
        };
    } catch (e) {
        console.error(e);
    }
}

async function loadTopics() {
    if (!isMounted) return;
    try {
        let cachedTopics = CacheManager.get('all_topics_with_counts');

        if (cachedTopics) {
            if (isMounted) {
                allTopics = cachedTopics.topics;
                questionCounts = new Map(cachedTopics.counts);
            }
        } else {
            console.log("Fetching topics from Firestore...");
            const q = query(collection(db, "topics"), orderBy("order", "asc"));

            const snapshot = await Promise.race([
                getDocs(q),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Konular yüklenirken zaman aşımı oluştu.")), 8000))
            ]);

            if (!isMounted) return;

            allTopics = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.isActive) {
                    allTopics.push({ id: doc.id, ...data });
                }
            });

            // 1) Question counts from Cache
            const cachedCounts = CacheManager.get(QUESTION_COUNT_CACHE_KEY);
            if (cachedCounts && Array.isArray(cachedCounts)) {
                questionCounts = new Map(cachedCounts);
            }

            // 2) Question counts from Topic fields
            allTopics.forEach((topic) => {
                const countValue = Number.isFinite(topic.questionCount)
                    ? topic.questionCount
                    : (Number.isFinite(topic.questionCountActive) ? topic.questionCountActive : null);
                if (Number.isFinite(countValue)) {
                    questionCounts.set(topic.id, countValue);
                }
            });

            CacheManager.set('all_topics_with_counts', {
                topics: allTopics,
                counts: Array.from(questionCounts.entries())
            }, 60 * 60 * 1000);
        }

        if (!isMounted) return;
        renderTopics(allTopics, getCurrentFilter());

        // Background fetch for missing counts
        const topicsMissingCounts = allTopics.filter(t => !questionCounts.has(t.id));
        if (topicsMissingCounts.length > 0) {
            loadQuestionCounts(topicsMissingCounts)
                .then(() => {
                    if (!isMounted) return;
                    CacheManager.set(QUESTION_COUNT_CACHE_KEY, Array.from(questionCounts.entries()), QUESTION_COUNT_CACHE_TTL);
                    renderTopics(allTopics, getCurrentFilter());
                })
                .catch(() => { });
        }

    } catch (error) {
        if (!isMounted) return;
        console.error("Hata:", error);
        const container = document.getElementById('topicsContainer');
        if (container) {
            container.innerHTML = `<div class="text-danger p-4">Veriler yüklenemedi: ${error.message}<br><button class="btn btn-outline-primary mt-2" onclick="window.location.reload()">Tekrar Dene</button></div>`;
        }
    }
}

async function loadQuestionCounts(topics) {
    if (!isMounted) return;
    const counts = new Map();
    await Promise.all(topics.map(async (topic) => {
        if (!isMounted) return;
        try {
            const q = query(
                collection(db, "questions"),
                where("category", "==", topic.title),
                where("isActive", "==", true)
            );
            const snap = await getCountFromServer(q);
            if (isMounted) counts.set(topic.id, snap.data().count || 0);
        } catch (e) {
            console.warn(`Soru sayısı alınamadı: ${topic.title}`, e);
            if (isMounted) counts.set(topic.id, 0);
        }
    }));
    if (isMounted) counts.forEach((val, key) => questionCounts.set(key, val));
}

function renderTopics(topics, options = {}) {
    if (!isMounted) return;
    const { category = 'all', search = '' } = options;
    const container = document.getElementById('topicsContainer');
    if (!container) return; // Guard

    const searchTerm = search.trim().toLowerCase();
    const childrenByParent = new Map();

    topics.forEach(t => {
        if (t.parentId) {
            const list = childrenByParent.get(t.parentId) || [];
            list.push(t);
            childrenByParent.set(t.parentId, list);
        }
    });

    const parents = topics.filter(t => !t.parentId);
    const visibleParents = parents.filter(parent => {
        if (category !== 'all' && parent.category !== category) return false;
        const children = (childrenByParent.get(parent.id) || []).filter(child =>
            category === 'all' || child.category === category
        );
        const parentMatches = !searchTerm || parent.title.toLowerCase().includes(searchTerm);
        const matchingChildren = searchTerm ? children.filter(child => child.title.toLowerCase().includes(searchTerm)) : children;
        if (searchTerm && !parentMatches && matchingChildren.length === 0) return false;
        return true;
    });

    if (visibleParents.length === 0) {
        container.innerHTML = `
          <div class="text-center p-5 text-muted" style="grid-column: 1/-1;">
            <div style="font-size: 2rem; margin-bottom: 8px;">🧭</div>
            Aradığınız kriterde konu bulunamadı.
          </div>
        `;
        return;
    }

    container.innerHTML = '';
    const getQuestionCount = (id) => {
        if (!questionCounts.has(id)) return null;
        return questionCounts.get(id);
    };
    visibleParents.forEach(t => {
        const iconRules = [
            { match: /anayasa|anayasal/i, icon: '⚖️' },
            { match: /ceza|tck|cmk|infaz|suç|kovuşturma/i, icon: '🚔' },
            { match: /idare|idari|yönetim/i, icon: '🏛️' },
            { match: /yazışma|yazı işleri|dilekçe/i, icon: '✍️' },
            { match: /tebligat|bildirim/i, icon: '📩' },
            { match: /insan hak|eşitlik|hak/i, icon: '🤝' },
            { match: /uluslararası|avrupa|küresel/i, icon: '🌍' },
            { match: /vergi|mali|muhasebe|bütçe|finans/i, icon: '💰' },
            { match: /icra|iflas/i, icon: '📑' },
            { match: /medeni|aile|miras/i, icon: '🏠' },
            { match: /ticaret|şirket|sermaye/i, icon: '🏢' },
            { match: /iş hukuk|çalışma|sosyal güvenlik/i, icon: '👷' },
            { match: /mevzuat|yönetmelik|genelge/i, icon: '📜' },
            { match: /etik|disiplin|kurallar/i, icon: '🧭' },
            { match: /iletişim|halkla|tanıtım/i, icon: '💬' },
            { match: /teknoloji|bilişim|siber|veri/i, icon: '💻' },
            { match: /sağlık|tıp/i, icon: '🩺' },
            { match: /eğitim|öğretim/i, icon: '🎓' },
            { match: /güvenlik|asayiş|jandarma|polis/i, icon: '🛡️' },
            { match: /çevre|imar|şehir/i, icon: '🌿' }
        ];
        const matchedRule = iconRules.find(rule => rule.match.test(t.title));
        const icon = matchedRule?.icon || (t.category === 'alan' ? '📗' : '📘');

        const allChildren = (childrenByParent.get(t.id) || []).filter(child =>
            category === 'all' || child.category === category
        );
        const allChildrenForTotals = childrenByParent.get(t.id) || [];
        const parentMatches = !searchTerm || t.title.toLowerCase().includes(searchTerm);
        const matchingChildren = searchTerm
            ? allChildren.filter(child => child.title.toLowerCase().includes(searchTerm))
            : allChildren;
        const childrenToShow = searchTerm && !parentMatches ? matchingChildren : allChildren;

        const stats = userStats[t.id] || { solved: 0, correct: 0, total: t.totalQuestionTarget || 100 };
        const successRate = stats.solved > 0 ? Math.round((stats.correct / stats.solved) * 100) : 0;
        const progress = Math.min(100, Math.round((stats.solved / stats.total) * 100));
        const childrenTotal = (childrenByParent.get(t.id) || []).length;
        const questionTarget = t.totalQuestionTarget || stats.total || 0;
        const parentCount = getQuestionCount(t.id);
        const childCounts = allChildrenForTotals.map(child => getQuestionCount(child.id));
        const hasUnknown = [parentCount, ...childCounts].some(val => val === null);
        const totalQuestionCount = (parentCount || 0)
            + childCounts.reduce((sum, val) => sum + (val || 0), 0);
        const totalQuestionLabel = hasUnknown ? `${totalQuestionCount}+` : `${totalQuestionCount}`;

        const card = document.createElement('a');
        card.href = `/konu/${encodeURIComponent(t.id)}`;
        card.className = 'topic-card';

        const subtopicsHtml = childrenToShow.length ? `
                    <div class="subtopic-list">
                        ${childrenToShow.map(child => `
                            <a class="subtopic-link" href="/konu/${encodeURIComponent(child.id)}">
                                <span>${child.title}</span>
                                <span class="subtopic-meta">Sıra ${child.order || '-'} • ${getQuestionCount(child.id) ?? '—'} Soru</span>
                            </a>
                        `).join('')}
                    </div>
                ` : '';

        const statsHtml = childrenToShow.length ? '' : `
                    <div class="stats-row">
                        <div class="stat-item">
                            <span class="stat-val stat-total">${stats.solved} / ${stats.total}</span>
                            <span class="stat-lbl">Çözülen Soru</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-val stat-success">%${successRate}</span>
                            <span class="stat-lbl">Başarı Oranı</span>
                        </div>
                    </div>
                    
                    <div class="progress-container">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                `;

        card.innerHTML = `
                    <div class="card-header-row">
                        <div class="topic-icon">${icon}</div>
                        <span class="topic-badge badge-${t.category}">${t.category === 'ortak' ? 'Ortak' : 'Alan'}</span>
                    </div>
                    
                    <h3 class="topic-title">${t.title}</h3>
                    <p class="topic-desc">${t.description || 'Konu açıklaması bulunmuyor.'}</p>
                    <div class="topic-meta">
                        <span class="topic-meta-item">📌 ${childrenTotal} Alt Konu</span>
                        <span class="topic-meta-item">🧮 ${totalQuestionLabel} Soru</span>
                        <span class="topic-meta-item">🎯 ${questionTarget} Hedef Soru</span>
                    </div>
                    ${subtopicsHtml}
                    ${statsHtml}
                `;
        container.appendChild(card);
    });
}
