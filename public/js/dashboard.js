// public/js/dashboard.js

import { initLayout } from './ui-loader.js';
import { auth, db } from "./firebase-config.js";
import { getUserProfile } from "./user-profile.js";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { buildTopicPath } from './topic-url.js';
import { CacheManager } from './cache-manager.js';
import { pickTopicIcon } from './topic-icon-map.js';

// UI Elementleri
const ui = {
    loader: document.getElementById("pageLoader"),
    loaderText: document.getElementById("loaderText"),
    welcomeMsg: document.getElementById("welcomeMsg"),
    mainWrapper: document.getElementById("mainWrapper"),
    countdown: document.getElementById("countdownDays"),
    countdownLabel: document.getElementById("countdownLabel"),
    examPanelBody: document.getElementById("examPanelBody"),
    examStatusBadge: document.getElementById("examStatusBadge"),
    announcementList: document.getElementById("announcementList"),
    focusTopicsList: document.getElementById("focusTopicsList"),
    recentActivityList: document.getElementById("recentActivityList"),
    successRateBar: document.getElementById("successRateBar"),
    successRateText: document.getElementById("successRateText"),
    solvedTodayCount: document.getElementById("solvedTodayCount"),
    solvedTotalCount: document.getElementById("solvedTotalCount"),
    wrongTodayCount: document.getElementById("wrongTodayCount")
};

let examCountdownInterval = null;


const DASHBOARD_STATS_TTL = 2 * 60 * 1000; // 2 dakika
const DASHBOARD_FEED_TTL = 6 * 60 * 60 * 1000; // 6 saat
const DASHBOARD_DATA_CACHE_TTL = 30 * 60 * 1000; // 30 dakika


async function getCachedUserDoc(uid) {
    const cacheKey = `user_profile_${uid}`;
    const cachedUser = await CacheManager.getData(cacheKey, DASHBOARD_DATA_CACHE_TTL);
    if (cachedUser?.cached && cachedUser.data) {
        return { exists: () => true, data: () => cachedUser.data };
    }

    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
        await CacheManager.saveData(cacheKey, userSnap.data(), DASHBOARD_DATA_CACHE_TTL);
    }
    return userSnap;
}

function getDashboardDateKey() {
    return new Date().toISOString().slice(0, 10);
}

function applyStatsToUI(totalStats, todayStats) {
    const successRate = totalStats.total > 0
        ? Math.round((totalStats.correct / totalStats.total) * 100)
        : 0;

    if (ui.solvedTodayCount) ui.solvedTodayCount.textContent = todayStats.total.toLocaleString('tr-TR');
    if (ui.solvedTotalCount) ui.solvedTotalCount.textContent = totalStats.total.toLocaleString('tr-TR');
    if (ui.wrongTodayCount) ui.wrongTodayCount.textContent = todayStats.wrong.toLocaleString('tr-TR');
    if (ui.successRateText) ui.successRateText.textContent = `%${successRate}`;
    if (ui.successRateBar) ui.successRateBar.style.width = `${successRate}%`;
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (ui.loaderText) ui.loaderText.textContent = "Sistem başlatılıyor...";

        // 1. Merkezi Layout Yükleyicisini Bekle
        // (Header, Sidebar, Auth Kontrolü, Admin Rolü, Mobil Menü - hepsi burada halledilir)
        await initLayout();

        // 2. Dashboard'a Özel İçeriği Hazırla
        const user = auth.currentUser;

        if (user) {
            if (ui.loaderText) ui.loaderText.textContent = "Verileriniz yükleniyor...";

            // Profil bilgisini çek (Welcome mesajı için)
            // Not: Header zaten ui-loader tarafından güncellendi.
            const profile = await getUserProfile(user.uid);
            const displayName = profile?.ad || user.displayName || (user.email ? user.email.split('@')[0] : 'Kullanıcı');

            if (ui.welcomeMsg) {
                ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}!`;
            }

            try {
                await loadDashboardStats(user.uid);
            } catch (statsError) {
                console.error("Dashboard istatistikleri yüklenemedi:", statsError);
            }

            // Sınav ilanını, duyuruları ve aktiviteleri yükle
            let userData = {};
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                userData = userSnap.exists() ? userSnap.data() : {};
            } catch (userDocError) {
                console.error("Kullanıcı dokümanı yüklenemedi:", userDocError);
            }

            await Promise.allSettled([
                loadExamAnnouncement(),
                loadAnnouncements(),
                loadFocusTopics(user.uid, userData.currentTopicId),
                loadRecentActivities(user.uid)
            ]);
        }

        // 3. Her şey hazır, sayfa yükleyicisini kaldır
        hideLoader();

    } catch (error) {
        console.error("Dashboard yükleme hatası:", error);
        if (ui.loaderText) {
            ui.loaderText.innerHTML = "Bir hata oluştu.<br>Lütfen sayfayı yenileyin.";
            ui.loaderText.style.color = "#ef4444";
        }
    }
});

function hideLoader() {
    if (ui.loader) {
        ui.loader.style.opacity = "0";
        setTimeout(() => {
            ui.loader.style.display = "none";
            if (ui.mainWrapper) {
                ui.mainWrapper.style.display = "block";
                // Yumuşak geçiş efekti
                requestAnimationFrame(() => {
                    ui.mainWrapper.style.opacity = "1";
                });
            }
        }, 400);
    }
}

async function loadFocusTopics(uid, currentTopicId) {
    if (!ui.focusTopicsList) return;

    try {
        // --- CACHE DESTEKLİ ÇEKİM ---
        const cacheKey = `topic_progress_col_${uid}`;
        let progressMapDocs = [];
        const cachedProgCol = await CacheManager.getData(cacheKey, DASHBOARD_DATA_CACHE_TTL); // 5 dakika

        if (cachedProgCol?.cached && cachedProgCol.data) {
            progressMapDocs = cachedProgCol.data;
        } else {
            const progressSnap = await getDocs(collection(db, `users/${uid}/topic_progress`));
            progressMapDocs = progressSnap.docs.map(d => ({ id: d.id, data: d.data() }));
            await CacheManager.saveData(cacheKey, progressMapDocs, DASHBOARD_DATA_CACHE_TTL);
        }

        const inProgressIds = progressMapDocs
            .filter(d => d.data.status === 'in_progress')
            .map(d => d.id)
            .slice(0, 6);

        const focusIds = currentTopicId
            ? [currentTopicId, ...inProgressIds.filter((id) => id !== currentTopicId)]
            : inProgressIds;

        const selectedIds = focusIds.slice(0, 5);
        if (!selectedIds.length) {
            ui.focusTopicsList.innerHTML = `<p class="text-muted">Henüz odak konu seçmedin. Analiz sayfasından bir konu seçerek burada sabitleyebilirsin.</p>`;
            return;
        }

        // Tüm konuları önbellekten al (Dashboard hızlı yüklenmesi için)
        let allTopics = [];
        const cachedTopics = await CacheManager.getData('all_topics', 24 * 60 * 60 * 1000);
        if (cachedTopics?.cached && cachedTopics.data) {
            allTopics = cachedTopics.data;
        } else {
            const topicsSnap = await getDocs(query(collection(db, "topics"), orderBy("order", "asc")));
            allTopics = topicsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.isActive !== false && t.status !== 'deleted' && t.isDeleted !== true);
            await CacheManager.saveData('all_topics', allTopics, 24 * 60 * 60 * 1000);
        }

        const topicItems = selectedIds
            .map((topicId) => {
                const topic = allTopics.find(t => t.id === topicId);
                if (!topic) return null;
                const topicUrl = buildTopicPath ? buildTopicPath({ id: topicId, slug: topic.slug }) : `/konu/${topic.slug || topicId}`;
                const isPrimaryFocus = topicId === currentTopicId;
                return `
                    <a href="${topicUrl}" class="panel-item topic-link-item" style="display:flex;">
                        <div class="panel-item-content" style="flex: 1;">
                            <div class="panel-item-icon ${isPrimaryFocus ? 'teal' : 'gold'}" style="flex-shrink: 0;">${isPrimaryFocus ? '🌟' : '🎯'}</div>
                            <div style="flex: 1; min-width: 0;">
                                <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${topic.title}</strong>
                                <div class="panel-meta" style="display: flex; gap: 6px; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span class="panel-pill ${isPrimaryFocus ? 'focus-badge' : ''}" style="padding: 2px 8px; font-size: 0.70rem;">${isPrimaryFocus ? 'Aktif Odak' : 'Odak'}</span>
                                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${isPrimaryFocus ? 'Ana odak konun' : 'Odakta'}</span>
                                </div>
                            </div>
                        </div>
                    </a>
                `;
            })
            .filter(Boolean);

        ui.focusTopicsList.innerHTML = topicItems.join('');
    } catch (error) {
        console.error("Odak konuları yüklenemedi:", error);
        ui.focusTopicsList.innerHTML = `<p class="text-muted">Odaklanan konular getirilemedi.</p>`;
    }
}

async function loadDashboardStats(uid) {
    const userSnap = await getCachedUserDoc(uid);
    const userData = userSnap.exists() ? userSnap.data() : {};
    const statsResetAtSeconds = normalizeResetTimestamp(userData.statsResetAt);

    // Bütün analizleri bellek üzerinden (cached) hesaplayacağız DB masrafı olmasın:
    const resultsCacheKey = `exam_results_col_${uid}`;
    let rawResults = [];
    const cachedResults = await CacheManager.getData(resultsCacheKey, DASHBOARD_DATA_CACHE_TTL);
    if (cachedResults?.cached && cachedResults.data) {
        rawResults = cachedResults.data;
    } else {
        const resultsQuery = query(collection(db, `users/${uid}/exam_results`), orderBy('completedAt', 'desc'), limit(100));
        const resultSnap = await getDocs(resultsQuery);
        rawResults = resultSnap.docs.map(d => d.data());
        await CacheManager.saveData(resultsCacheKey, rawResults, DASHBOARD_DATA_CACHE_TTL);
    }

    const { start: todayStart, end: todayEnd } = getTodayRange();
    let totalStats = { total: 0, correct: 0, wrong: 0 };
    let todayStats = { total: 0, correct: 0, wrong: 0 };

    rawResults.forEach(exam => {
        let completedAtSec = null;
        if (exam.completedAt?.seconds) completedAtSec = exam.completedAt.seconds;
        else if (exam.completedAt) completedAtSec = Math.floor(new Date(exam.completedAt).getTime() / 1000);

        if (!completedAtSec) return;

        // Reset yapılmışsa ve sınav eski ise yoksay
        if (statsResetAtSeconds && completedAtSec <= statsResetAtSeconds) return;

        const dateScoreTotal = exam.total || ((exam.correct || 0) + (exam.wrong || 0) + (exam.empty || 0));
        const examDate = new Date(completedAtSec * 1000);

        // Genel İstatistik Ekle 
        totalStats.total += dateScoreTotal;
        totalStats.correct += (exam.correct || 0);
        totalStats.wrong += (exam.wrong || 0);

        // Bugün İstatistiğine uyuyorsa Ekle
        if (examDate >= todayStart && examDate < todayEnd) {
            todayStats.total += dateScoreTotal;
            todayStats.correct += (exam.correct || 0);
            todayStats.wrong += (exam.wrong || 0);
        }
    });

    applyStatsToUI(totalStats, todayStats);
}

function normalizeResetTimestamp(timestamp) {
    if (!timestamp) return null;
    if (typeof timestamp.seconds === 'number') return timestamp.seconds;
    if (typeof timestamp.toDate === 'function') return Math.floor(timestamp.toDate().getTime() / 1000);
    return null;
}

async function fetchExamStats(uid, options = {}) {
    if (!uid) return { total: 0, correct: 0, wrong: 0 };

    const baseRef = collection(db, `users/${uid}/exam_results`);
    const constraints = [];
    const range = options.range || null;
    const resetAtSeconds = typeof options.resetAtSeconds === 'number' ? options.resetAtSeconds : null;

    if (range || resetAtSeconds) {
        let startDate = range ? range.start : null;
        if (resetAtSeconds) {
            const resetDate = new Date(resetAtSeconds * 1000);
            if (!startDate || resetDate > startDate) {
                startDate = resetDate;
            }
        }

        if (startDate && range && startDate >= range.end) {
            return { total: 0, correct: 0, wrong: 0 };
        }

        if (startDate) {
            constraints.push(where("completedAt", ">=", Timestamp.fromDate(startDate)));
        }
        if (range) {
            constraints.push(where("completedAt", "<", Timestamp.fromDate(range.end)));
        }
    }

    const q = constraints.length ? query(baseRef, ...constraints) : baseRef;
    const snapshot = await getDocs(q);

    return snapshot.docs.reduce((acc, docSnap) => {
        const data = docSnap.data();
        const total = data.total || ((data.correct || 0) + (data.wrong || 0) + (data.empty || 0));
        acc.total += total;
        acc.correct += data.correct || 0;
        acc.wrong += data.wrong || 0;
        return acc;
    }, { total: 0, correct: 0, wrong: 0 });
}

function getTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
}

async function loadExamAnnouncement() {
    if (!ui.examPanelBody) return;

    const cacheKey = "dashboard_exam_announcement_v1";
    const cached = await CacheManager.getData(cacheKey);
    if (cached?.cached && cached.data?.html) {
        ui.examPanelBody.innerHTML = cached.data.html;
        setCountdownState(cached.data.examDate ? new Date(cached.data.examDate) : null);
        if (ui.examStatusBadge) ui.examStatusBadge.textContent = cached.data.statusBadge || "Aktif";
        return;
    }

    try {
        const examQuery = query(
            collection(db, "examAnnouncements"),
            where("isActive", "==", true),
            orderBy("examDate", "asc"),
            limit(1)
        );
        const snapshot = await getDocs(examQuery);

        if (snapshot.empty) {
            ui.examPanelBody.innerHTML = `
                <div class="panel-item">
                    <div class="panel-item-content">
                        <div class="panel-item-icon gold">📌</div>
                        <div>
                            <strong>Sınav ilanı henüz paylaşılmadı.</strong>
                            <div class="panel-meta">Yeni ilan yayınlandığında burada göreceksiniz.</div>
                        </div>
                    </div>
                    <span class="panel-pill">Takipte</span>
                </div>
            `;
            setCountdownState(null);
            if (ui.examStatusBadge) ui.examStatusBadge.textContent = "İlan Yok";
            await CacheManager.saveData(cacheKey, {
                html: ui.examPanelBody.innerHTML,
                examDate: null,
                statusBadge: "İlan Yok"
            }, DASHBOARD_FEED_TTL);
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        const examDate = parseDate(data.examDate);
        const applyStart = parseDate(data.applicationStart);
        const applyEnd = parseDate(data.applicationEnd);

        ui.examPanelBody.innerHTML = `
            <div class="panel-item">
                <div class="panel-item-content" style="flex: 1;">
                    <div class="panel-item-icon gold">🗓️</div>
                    <div style="flex: 1; min-width: 0;">
                        <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${data.title || 'Sınav İlanı'}</strong>
                        <div class="panel-meta" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.description || 'Sınav detayları güncellendi.'}</div>
                    </div>
                </div>
                <span class="panel-pill" style="flex-shrink: 0;">Aktif</span>
            </div>
            <div class="panel-item">
                <div class="panel-item-content" style="flex: 1;">
                    <div class="panel-item-icon purple">📅</div>
                    <div style="flex: 1; min-width: 0;">
                        <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${examDate ? formatDate(examDate, true) : 'Tarih açıklanacak'}</strong>
                        <div class="panel-meta">Sınav Tarihi</div>
                    </div>
                </div>
                <span class="panel-pill" style="flex-shrink: 0;">${data.location || 'Konum belirlenecek'}</span>
            </div>
            <div class="panel-item">
                <div class="panel-item-content" style="flex: 1;">
                    <div class="panel-item-icon teal">📝</div>
                    <div style="flex: 1; min-width: 0;">
                        <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${formatRange(applyStart, applyEnd)}</strong>
                        <div class="panel-meta">Başvuru Takvimi</div>
                    </div>
                </div>
                ${data.applicationLink ? `<a class="btn btn-sm btn-outline-primary" style="flex-shrink: 0;" href="${data.applicationLink}" target="_blank" rel="noopener">Başvur</a>` : ''}
            </div>
        `;

        if (ui.examStatusBadge) ui.examStatusBadge.textContent = "Aktif";
        setCountdownState(examDate);
        await CacheManager.saveData(cacheKey, {
            html: ui.examPanelBody.innerHTML,
            examDate: examDate ? examDate.toISOString() : null,
            statusBadge: "Aktif"
        }, DASHBOARD_FEED_TTL);
    } catch (error) {
        console.error("Sınav ilanı yüklenemedi:", error);
        ui.examPanelBody.innerHTML = `<p class="text-muted">Sınav bilgileri yüklenemedi.</p>`;
        setCountdownState(null);
        if (ui.examStatusBadge) ui.examStatusBadge.textContent = "Kontrol Edin";
    }
}

function setCountdownState(examDate) {
    if (!ui.countdown) return;

    if (examCountdownInterval) {
        clearInterval(examCountdownInterval);
        examCountdownInterval = null;
    }

    if (!examDate || Number.isNaN(examDate.getTime())) {
        ui.countdown.textContent = "--";
        if (ui.countdownLabel) ui.countdownLabel.textContent = "Sınav Yok";
        return;
    }

    const updateTimer = () => {
        const now = new Date();
        const distance = examDate.getTime() - now.getTime();
        if (distance <= 0) {
            ui.countdown.textContent = "0";
            if (ui.countdownLabel) ui.countdownLabel.textContent = "Gün Kaldı";
            return;
        }
        const days = Math.ceil(distance / (1000 * 60 * 60 * 24));
        ui.countdown.textContent = days.toString();
        if (ui.countdownLabel) ui.countdownLabel.textContent = "Gün Kaldı";
    };

    updateTimer();
    examCountdownInterval = setInterval(updateTimer, 60000);
}

async function loadAnnouncements() {
    if (!ui.announcementList) return;

    const cacheKey = "dashboard_announcements_v1";
    const cached = await CacheManager.getData(cacheKey);
    if (cached?.cached && cached.data?.html) {
        ui.announcementList.innerHTML = cached.data.html;
        return;
    }

    try {
        const announcementQuery = query(
            collection(db, "announcements"),
            where("isActive", "==", true),
            orderBy("createdAt", "desc"),
            limit(5)
        );
        const snapshot = await getDocs(announcementQuery);

        if (snapshot.empty) {
            ui.announcementList.innerHTML = `
                <div class="panel-item">
                    <div class="panel-item-content">
                        <div class="panel-item-icon purple">📭</div>
                        <div>
                            <strong>Henüz duyuru yok.</strong>
                            <div class="panel-meta">Yeni duyurular burada yayınlanacak.</div>
                        </div>
                    </div>
                </div>
            `;
            await CacheManager.saveData(cacheKey, { html: ui.announcementList.innerHTML }, DASHBOARD_FEED_TTL);
            return;
        }

        ui.announcementList.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = parseDate(data.createdAt);
            return `
                <div class="panel-item">
                    <div class="panel-item-content" style="flex: 1;">
                    <div class="panel-item-icon gold" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:16px;height:16px;display:block;">
                            <path d="M3 11.5V12.5C3 13.3284 3.67157 14 4.5 14H6L8.2 18.4C8.53873 19.0775 9.23112 19.5 9.98861 19.5H11V14.5L17.7465 16.9166C18.4016 17.1513 19.1054 16.6656 19.1054 15.9697V8.03034C19.1054 7.33439 18.4016 6.84868 17.7465 7.0834L11 9.5V4.5H9.98861C9.23112 4.5 8.53873 4.92251 8.2 5.6L6 10H4.5C3.67157 10 3 10.6716 3 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M21 9.5C21.596 10.2107 22 11.252 22 12.5C22 13.748 21.596 14.7893 21 15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${data.title || 'Duyuru'}</strong>
                        <div class="panel-meta" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-height: 1.5em;">${data.body || ''}</div>
                        <div class="panel-meta">${createdAt ? formatDate(createdAt) : ''}</div>
                    </div>
                </div>
                <span class="panel-pill" style="flex-shrink: 0;">${data.level || 'Bilgi'}</span>
                </div>
            `;
        }).join('');
        await CacheManager.saveData(cacheKey, { html: ui.announcementList.innerHTML }, DASHBOARD_FEED_TTL);
    } catch (error) {
        console.error("Duyurular yüklenemedi:", error);
        ui.announcementList.innerHTML = `<p class="text-muted">Duyurular yüklenemedi.</p>`;
    }
}

async function loadRecentActivities(uid) {
    if (!ui.recentActivityList) return;

    try {
        // --- CACHE DESTEKLİ PROGRESS ÇEKİMİ ---
        const cacheKey = `topic_progress_col_${uid}`;
        let progressMapDocs = [];
        const cachedProgCol = await CacheManager.getData(cacheKey, DASHBOARD_DATA_CACHE_TTL);

        if (cachedProgCol?.cached && cachedProgCol.data) {
            progressMapDocs = cachedProgCol.data;
        } else {
            const progressSnap = await getDocs(collection(db, `users/${uid}/topic_progress`));
            progressMapDocs = progressSnap.docs.map(d => ({ id: d.id, data: d.data() }));
            await CacheManager.saveData(cacheKey, progressMapDocs, DASHBOARD_DATA_CACHE_TTL);
        }

        // Tüm konuları önbellekten çek (Hızlı adlandırma için)
        let allTopics = [];
        const cachedTopics = await CacheManager.getData('all_topics', 24 * 60 * 60 * 1000);
        if (cachedTopics?.cached && cachedTopics.data) {
            allTopics = cachedTopics.data;
        }

        const activitiesRaw = progressMapDocs.map(docSnap => {
            const pData = docSnap.data;
            const topicId = pData.topicId || docSnap.id;
            const solvedCount = Number(pData.solvedCount || 0);
            const answersCount = pData.answers && typeof pData.answers === 'object'
                ? Object.keys(pData.answers).length
                : 0;

            if (solvedCount <= 0 && answersCount <= 0) {
                return null;
            }

            const tData = allTopics.find(t => t.id === topicId) || { title: "Bilinmeyen Konu", slug: topicId };
            const lastActivityDate = parseDate(pData.lastSyncedAt) || parseDate(pData.updatedAt);

            return {
                topicId,
                title: tData.title,
                slug: tData.slug,
                solvedCount,
                lastActivityDate
            };
        });

        const activities = activitiesRaw
            .filter(Boolean)
            .sort((a, b) => (b.lastActivityDate?.getTime?.() || 0) - (a.lastActivityDate?.getTime?.() || 0))
            .slice(0, 5);

        if (!activities.length) {
            ui.recentActivityList.innerHTML = `
                <div class="panel-item">
                    <div class="panel-item-content">
                        <div class="panel-item-icon teal">✨</div>
                        <div>
                            <strong>Henüz aktivite yok.</strong>
                            <div class="panel-meta">Test çözdükçe burada görünecek.</div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        ui.recentActivityList.innerHTML = activities.map(act => {
            const actDate = act.lastActivityDate;
            const topicUrl = buildTopicPath ? buildTopicPath({ id: act.topicId, slug: act.slug }) : `/konu/${act.slug || act.topicId}`;

            return `
                <a href="${topicUrl}" class="panel-item topic-link-item" style="display:flex;">
                    <div class="panel-item-content" style="flex: 1;">
                        <div class="panel-item-icon blue" style="flex-shrink: 0;">${pickTopicIcon(act.title)}</div>
                        <div style="flex: 1; min-width: 0;">
                            <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${act.title}</strong>
                            <div class="panel-meta" style="display: flex; gap: 6px; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <span class="panel-pill" style="padding: 2px 8px; font-size: 0.70rem;">${actDate ? formatDate(actDate) : 'Yakın Zamanda'}</span>
                                <span>${act.solvedCount || 0} soru çözüldü</span>
                            </div>
                        </div>
                    </div>
                </a>
            `;
        }).join('');
    } catch (error) {
        console.error("Aktiviteler yüklenemedi:", error);
        ui.recentActivityList.innerHTML = `<p class="text-muted">Aktivite geçmişi alınamadı.</p>`;
    }
}

function parseDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date, withTime = false) {
    if (!date) return '';
    const options = withTime
        ? { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('tr-TR', options);
}

function formatRange(start, end) {
    if (!start && !end) return 'Takvim açıklanacak';
    if (start && end) {
        return `${formatDate(start)} - ${formatDate(end)}`;
    }
    return start ? `${formatDate(start)} itibariyle` : `${formatDate(end)} tarihine kadar`;
}
