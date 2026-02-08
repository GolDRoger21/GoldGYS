

import { auth, db } from "./firebase-config.js";
import { getUserProfile, getLastActivity, getRecentActivities } from "./user-profile.js";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CacheManager } from "./modules/cache-manager.js";

// UI Elementleri (Init içinde sıfırlanacak)
let ui = {};
let examCountdownInterval = null;


function refreshUI() {
    ui.loader = document.getElementById("pageLoader");
    ui.loaderText = document.getElementById("loaderText");
    ui.welcomeMsg = document.getElementById("welcomeMsg");
    ui.mainWrapper = document.getElementById("mainWrapper");
    ui.countdown = document.getElementById("countdownDays");
    ui.countdownLabel = document.getElementById("countdownLabel");
    ui.examPanelBody = document.getElementById("examPanelBody");
    ui.examStatusBadge = document.getElementById("examStatusBadge");
    ui.announcementList = document.getElementById("announcementList");
    ui.recentActivityList = document.getElementById("recentActivityList");
    ui.successRateBar = document.getElementById("successRateBar");
    ui.successRateText = document.getElementById("successRateText");
    ui.solvedTodayCount = document.getElementById("solvedTodayCount");
    ui.solvedTotalCount = document.getElementById("solvedTotalCount");
    ui.wrongTodayCount = document.getElementById("wrongTodayCount");
}

export async function init() {
    try {
        // Reset state
        ui = {};
        refreshUI();
        if (ui.loaderText) ui.loaderText.textContent = "Sistem başlatılıyor...";

        // 1. Dashboard'a Özel İçeriği Hazırla
        const user = auth.currentUser;

        if (user) {
            if (ui.loaderText) ui.loaderText.textContent = "Verileriniz yükleniyor...";

            // Profil bilgisini çek (Welcome mesajı için)
            const profile = await getUserProfile(user.uid);
            const displayName = (profile && profile.ad) || user.displayName || (user.email ? user.email.split('@')[0] : 'Kullanıcı');

            if (ui.welcomeMsg) {
                ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}!`;
            }

            await loadDashboardStats(user.uid);

            // Sınav ilanını, duyuruları ve aktiviteleri yükle
            await Promise.all([
                loadExamAnnouncement(),
                loadAnnouncements(),
                loadRecentActivities(user.uid)
            ]);

            // Son aktiviteyi ve akıllı ipucunu göster
            checkLastActivity(user);
            showSmartTip();
        } else {
            // Kullanıcı yoksa login'e at (ui-loader hallediyor ama burada da duralım)
            return;
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
}

// Cleanup function if needed
export function cleanup() {
    if (examCountdownInterval) {
        clearInterval(examCountdownInterval);
        examCountdownInterval = null;
    }
    // Clear UI references
    ui = {};
}

async function loadDashboardStats(uid) {
    if (!uid) return;

    try {
        const cacheKey = `dashboard_stats_${uid}`;
        let cachedStats = CacheManager.get(cacheKey);

        let todayStats, totalStats;

        if (cachedStats) {
            console.log("Dashboard stats loaded from cache");
            ({ todayStats, totalStats } = cachedStats);
        } else {
            console.log("Fetching dashboard stats from Firestore...");
            // Bugünün istatistikleri
            const todayRange = getTodayRange();
            todayStats = await fetchExamStats(uid, { range: todayRange });

            // Genel istatistikler
            totalStats = await fetchExamStats(uid);

            CacheManager.set(cacheKey, { todayStats, totalStats }, 5 * 60 * 1000); // 5 dk cache
        }

        // UI Güncelleme
        if (ui.solvedTodayCount) ui.solvedTodayCount.textContent = todayStats.total || 0;
        if (ui.wrongTodayCount) ui.wrongTodayCount.textContent = todayStats.wrong || 0;
        if (ui.solvedTotalCount) ui.solvedTotalCount.textContent = totalStats.total || 0;

        // Başarı Oranı
        const successRate = totalStats.total > 0
            ? Math.round((totalStats.correct / totalStats.total) * 100)
            : 0;

        if (ui.successRateText) ui.successRateText.textContent = `%${successRate}`;
        if (ui.successRateBar) {
            ui.successRateBar.style.width = `${successRate}%`;
            ui.successRateBar.setAttribute('aria-valuenow', successRate);

            // Renk ayarı
            ui.successRateBar.className = 'progress-bar';
            if (successRate >= 70) ui.successRateBar.classList.add('bg-success');
            else if (successRate >= 40) ui.successRateBar.classList.add('bg-warning');
            else ui.successRateBar.classList.add('bg-danger');
        }

    } catch (error) {
        console.error("İstatistik yükleme hatası:", error);
    }
}

function hideLoader() {
    refreshUI();
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

async function checkLastActivity(user) {
    const activity = await getLastActivity(user.uid);
    const card = document.getElementById('lastActivityCard');

    if (activity && card) {
        const timeAgo = new Date(activity.timestamp.seconds * 1000).toLocaleDateString('tr-TR');

        card.innerHTML = `
            <div class="card p-3 d-flex justify-content-between align-items-center" style="background: linear-gradient(to right, var(--bg-surface), var(--bg-hover)); border-left: 4px solid var(--color-primary);">
                <div>
                    <small class="text-muted text-uppercase" style="font-size:0.75rem;">Son Çalışılan</small>
                    <h4 class="m-0" style="color:var(--text-main);">${activity.title}</h4>
                    <small class="text-muted">${activity.subTitle || 'Konu Çalışması'} • ${timeAgo}</small>
                </div>
                <a href="/konu/${encodeURIComponent(activity.id)}" class="btn btn-sm btn-primary">
                    Devam Et ▶
                </a>
            </div>
        `;
        card.style.display = 'block';
    }
}

function showSmartTip() {
    // Basit bir mantık: Rastgele bir motivasyon veya hatırlatma
    const tips = [
        "💡 İpucu: Yanlış yaptığın soruları 'Yanlışlarım' sayfasından tekrar çözebilirsin.",
        "🔥 Motivasyon: Günde sadece 20 soru çözerek hedefine ulaşabilirsin.",
        "📚 Hatırlatma: 'Anayasa Hukuku' konusunda eksiklerin var gibi görünüyor."
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];

    const container = document.querySelector('.dashboard-container');
    const target = document.getElementById('lastActivityCard');

    const tipDiv = document.createElement('div');
    tipDiv.className = 'alert alert-info mb-4';
    // Use CSS variables for theme compatibility
    tipDiv.style.background = 'var(--bg-info-subtle, rgba(59, 130, 246, 0.1))';
    tipDiv.style.border = '1px solid var(--border-info-subtle, rgba(59, 130, 246, 0.2))';
    tipDiv.style.color = 'var(--text-main)';
    tipDiv.innerHTML = randomTip;

    if (target && target.parentNode) {
        target.parentNode.insertBefore(tipDiv, target.nextSibling);
        return;
    }

    if (container) {
        container.appendChild(tipDiv);
    }
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

    try {
        const cacheKey = 'dashboard_exam_announcement';
        let cachedData = CacheManager.get(cacheKey);
        let data = null;

        if (cachedData) {
            data = cachedData;
        } else {
            const examQuery = query(
                collection(db, "examAnnouncements"),
                where("isActive", "==", true),
                orderBy("examDate", "asc"),
                limit(1)
            );
            const snapshot = await getDocs(examQuery);
            
            if (!snapshot.empty) {
                const docData = snapshot.docs[0].data();
                // Store serializable data
                data = {
                    ...docData,
                    examDate: normalizeTimestamp(docData.examDate),
                    applicationStart: normalizeTimestamp(docData.applicationStart),
                    applicationEnd: normalizeTimestamp(docData.applicationEnd)
                };
                CacheManager.set(cacheKey, data, 60 * 60 * 1000); // 1 saat cache
            } else {
                CacheManager.set(cacheKey, { empty: true }, 60 * 60 * 1000); // Boş sonucu da cachele
                data = { empty: true };
            }
        }

        if (data.empty) {
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
            return;
        }

        const examDate = parseDate(data.examDate);
        const applyStart = parseDate(data.applicationStart);
        const applyEnd = parseDate(data.applicationEnd);

        ui.examPanelBody.innerHTML = `
            <div class="panel-item">
                <div class="panel-item-content">
                    <div class="panel-item-icon gold">🗓️</div>
                    <div>
                        <strong>${data.title || 'Sınav İlanı'}</strong>
                        <div class="panel-meta">${data.description || 'Sınav detayları güncellendi.'}</div>
                    </div>
                </div>
                <span class="panel-pill">Aktif</span>
            </div>
            <div class="panel-item">
                <div class="panel-item-content">
                    <div class="panel-item-icon purple">📅</div>
                    <div>
                        <strong>${examDate ? formatDate(examDate, true) : 'Tarih açıklanacak'}</strong>
                        <div class="panel-meta">Sınav Tarihi</div>
                    </div>
                </div>
                <span class="panel-pill">${data.location || 'Konum belirlenecek'}</span>
            </div>
            <div class="panel-item">
                <div class="panel-item-content">
                    <div class="panel-item-icon teal">📝</div>
                    <div>
                        <strong>${formatRange(applyStart, applyEnd)}</strong>
                        <div class="panel-meta">Başvuru Takvimi</div>
                    </div>
                </div>
                ${data.applicationLink ? `<a class="btn btn-sm btn-outline-primary" href="${data.applicationLink}" target="_blank" rel="noopener">Başvur</a>` : ''}
            </div>
        `;

        if (ui.examStatusBadge) ui.examStatusBadge.textContent = "Aktif";
        setCountdownState(examDate);
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

    try {
        const cacheKey = 'dashboard_announcements';
        let cachedList = CacheManager.get(cacheKey);
        let list = null;

        if (cachedList) {
            list = cachedList;
        } else {
            const announcementQuery = query(
                collection(db, "announcements"),
                where("isActive", "==", true),
                orderBy("createdAt", "desc"),
                limit(5)
            );
            const snapshot = await getDocs(announcementQuery);

            if (snapshot.empty) {
                CacheManager.set(cacheKey, [], 30 * 60 * 1000);
                list = [];
            } else {
                list = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        ...data,
                        createdAt: normalizeTimestamp(data.createdAt)
                    };
                });
                CacheManager.set(cacheKey, list, 30 * 60 * 1000); // 30 dk cache
            }
        }

        if (list.length === 0) {
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
            return;
        }

        ui.announcementList.innerHTML = list.map(data => {
            const createdAt = parseDate(data.createdAt);
            return `
                <div class="panel-item">
                    <div class="panel-item-content">
                        <div class="panel-item-icon gold">📣</div>
                        <div>
                            <strong>${data.title || 'Duyuru'}</strong>
                            <div class="panel-meta">${data.body || ''}</div>
                            <div class="panel-meta">${createdAt ? formatDate(createdAt) : ''}</div>
                        </div>
                    </div>
                    <span class="panel-pill">${data.level || 'Bilgi'}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error("Duyurular yüklenemedi:", error);
        ui.announcementList.innerHTML = `<p class="text-muted">Duyurular yüklenemedi.</p>`;
    }
}

async function loadRecentActivities(uid) {
    if (!ui.recentActivityList) return;

    try {
        const cacheKey = `recent_activities_${uid}`;
        let activities = CacheManager.get(cacheKey);

        if (!activities) {
            activities = await getRecentActivities(uid, 4);
            CacheManager.set(cacheKey, activities, 2 * 60 * 1000); // 2 dk cache
        }

        if (!activities.length) {
            ui.recentActivityList.innerHTML = `
                <div class="panel-item">
                    <div class="panel-item-content">
                        <div class="panel-item-icon teal">✨</div>
                        <div>
                            <strong>Henüz aktivite yok.</strong>
                            <div class="panel-meta">İlk konunu çalıştığında burada görünecek.</div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        ui.recentActivityList.innerHTML = `
            <div class="activity-list">
                ${activities.map(activity => {
            const timeAgo = activity.timestamp && typeof activity.timestamp.toDate === 'function'
                ? activity.timestamp.toDate().toLocaleDateString('tr-TR')
                : (activity.timestamp ? new Date(activity.timestamp).toLocaleDateString('tr-TR') : '');
            
            const icon = activity.type === 'test' ? '📝' : '📖';
            return `
                        <div class="activity-item">
                            <div class="activity-icon">${icon}</div>
                            <div>
                                <div class="activity-title">${activity.title || 'Çalışma'}</div>
                                <div class="panel-meta">${activity.subTitle || 'Konu Çalışması'} • ${timeAgo}</div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    } catch (error) {
        console.error("Aktiviteler yüklenemedi:", error);
        ui.recentActivityList.innerHTML = `<p class="text-muted">Aktivite bilgisi yüklenemedi.</p>`;
    }
}

function normalizeTimestamp(ts) {
    if (!ts) return null;
    if (ts.seconds) return ts.seconds * 1000;
    if (typeof ts === 'string') return ts;
    if (typeof ts === 'number') return ts;
    return null; 
}

function parseDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (typeof value === 'number') return new Date(value);
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
