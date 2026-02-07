// public/js/dashboard.js

import { auth, db } from "./firebase-config.js";
import { getUserProfile, getLastActivity, getRecentActivities } from "./user-profile.js";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// UI Elementleri
const ui = {};

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

let examCountdownInterval = null;

export async function init() {
    try {
        refreshUI();
        if (ui.loaderText) ui.loaderText.textContent = "Sistem başlatılıyor...";

        // 1. Dashboard'a Özel İçeriği Hazırla
        const user = auth.currentUser;

        if (user) {
            if (ui.loaderText) ui.loaderText.textContent = "Verileriniz yükleniyor...";

            // Profil bilgisini çek (Welcome mesajı için)
            const profile = await getUserProfile(user.uid);
            const displayName = profile?.ad || user.displayName || (user.email ? user.email.split('@')[0] : 'Kullanıcı');

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
    // Clear UI references to avoid holding on to detached DOM elements
    for (const key in ui) {
        ui[key] = null;
    }
}

// Backwards compatibility for full reload if needed, but module execution shouldn't rely on it event listener if called by loader
// However, if the page is loaded directly and this script is included via <script type="module" src="..."> in HTML (legacy), 
// we might want to keep a self-executing part. 
// BUT `ui-loader` loads it dynamically. 
// If dashboard.html still has <script type="module" src="/js/dashboard.js"></script>, it will run this module.
// Since we removed the event listener, it won't run automatically via script tag unless we add a check.
// Using `if (document.readyState ...)` check or just calling init() if not imported?
// Actually best to remove script tag from dashboard.html and rely on ui-loader.
// Check if dashboard.html has inline script tag. I haven't checked dashboard.html content yet.
// I will assume ui-loader is responsible for calling init(). 


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

    // Dashboard'da uygun bir yere ekle (Örn: Quick Access altına veya üstüne)
    // Şimdilik container'ın başına veya sonuna ekleyebiliriz ama hoşdurması için stats-grid'den hemen sonraya ekleyelim
    // Veya welcome bölümünün altına. Kullanıcının isteği: "Dashboard'da uygun bir yere ekle"

    // Mevcut yapıda welcome-section bittikten sonra, lastActivityCard var. Onun da altına koyabiliriz.
    // Ancak daha temiz görünmesi için lastActivityCard varsa onun altına, yoksa welcome altına.
    const container = document.querySelector('.dashboard-container');
    const target = document.getElementById('lastActivityCard');

    const tipDiv = document.createElement('div');
    tipDiv.className = 'alert alert-info mb-4';
    tipDiv.style.background = 'rgba(59, 130, 246, 0.1)';
    tipDiv.style.border = '1px solid rgba(59, 130, 246, 0.2)';
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
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
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
            return;
        }

        ui.announcementList.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
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
        const activities = await getRecentActivities(uid, 4);

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
            const timeAgo = activity.timestamp?.toDate
                ? activity.timestamp.toDate().toLocaleDateString('tr-TR')
                : '';
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
