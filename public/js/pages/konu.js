import { db, auth } from '../firebase-config.js';
import { TopicService } from '../topic-service.js';
import { showConfirm, showToast } from '../notifications.js';
import { doc, getDoc, collection, getDocs, query, orderBy, where, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentTopicId = null;
let topicTitle = "";
let unsubscribeAuth = null;


export async function mount() {
    console.log("Konu page mount started");

    // Reset State
    currentTopicId = null;
    topicTitle = "";

    const urlParams = new URLSearchParams(window.location.search);
    currentTopicId = urlParams.get('id');

    if (!currentTopicId) {
        const pathMatch = window.location.pathname.match(/^\/konu\/([^/]+)$/);
        if (pathMatch) {
            currentTopicId = decodeURIComponent(pathMatch[1]);
        }
    }

    if (!currentTopicId) {
        window.location.href = '/konular';
        return;
    }

    if (!window.location.pathname.startsWith('/konu/')) {
        window.history.replaceState({}, '', `/konu/${encodeURIComponent(currentTopicId)}`);
    }

    initMobileTabs();

    // 1. Önce Konu Başlığını Çek
    await loadTopicHeader();

    // 2. Alt Konuları ve İçerikleri Çek (Hata olursa devam et)
    try {
        await loadTopicData();
    } catch (error) {
        console.error("Veri yükleme sırasında hata:", error);
        // Hata olsa bile "Yükleniyor" yazısını kaldırıp boş state gösterelim
        const testsList = document.getElementById('testsList');
        if (testsList) {
            testsList.innerHTML = '<div class="test-card">Veriler yüklenirken bir bağlantı hatası oluştu.</div>';
        }
    }

    // Auth listener to update progress dynamically
    if (unsubscribeAuth) unsubscribeAuth();

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        await loadQuestionCount();
    });
}



export function unmount() {

    if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
    }
    currentTopicId = null;
    topicTitle = "";
    // Clean up window functions if possible, but HTML usage prevents it easily without rewriting HTML.
}

// Mobile Tab Functionality
function initMobileTabs() {
    const tabButtons = document.querySelectorAll('[data-topic-tab]');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            tabButtons.forEach(b => b.setAttribute('aria-selected', 'false'));

            // Add active class to clicked button
            e.currentTarget.classList.add('active');
            e.currentTarget.setAttribute('aria-selected', 'true');

            // Show/Hide content
            const tabName = e.currentTarget.getAttribute('data-topic-tab');
            document.body.setAttribute('data-topic-tab', tabName);

            // Manually manage visibility for non-CSS support fallback
            document.querySelectorAll('[data-tab-content]').forEach(content => {
                if (content.getAttribute('data-tab-content') === tabName) {
                    content.style.display = 'block';
                } else {
                    content.style.display = 'none';
                }
            });
        });
    });
}

async function loadTopicHeader() {
    const topicSnap = await getDoc(doc(db, "topics", currentTopicId));
    if (topicSnap.exists()) {
        const data = topicSnap.data();
        topicTitle = data.title;
        const titleEl = document.getElementById('topicTitle');
        if (titleEl) titleEl.innerText = data.title;
        document.title = `${data.title} | Çalışma`;
    }
}

async function safeGetDocs(primaryQuery, fallbackQuery, contextLabel) {
    try {
        return await getDocs(primaryQuery);
    } catch (error) {
        console.warn(`${contextLabel} sıralı sorgu hatası, yedek sorguya geçiliyor:`, error);
        if (fallbackQuery) {
            return await getDocs(fallbackQuery);
        }
        throw error;
    }
}

async function loadTopicData() {
    // ALT KONULARI ÇEKME (Firestore Index Hatası burada olabilir, try-catch ile koruyoruz)
    let subtopics = [];
    try {
        const subtopicQuery = query(
            collection(db, "topics"),
            where("parentId", "==", currentTopicId),
            where("isActive", "==", true),
            orderBy("order", "asc")
        );
        const subtopicFallbackQuery = query(
            collection(db, "topics"),
            where("parentId", "==", currentTopicId),
            orderBy("order", "asc")
        );
        const subtopicSnap = await safeGetDocs(subtopicQuery, subtopicFallbackQuery, 'Alt konular');
        subtopicSnap.forEach(doc => {
            const data = doc.data();
            if (data?.isActive === false) return;
            subtopics.push({ id: doc.id, ...data });
        });
    } catch (e) {
        console.warn("Alt konular çekilemedi (Muhtemelen eksik Index):", e);
        // Alt konu bölümünü gizle ama hata fırlatma, içerik yüklemeye devam et
        const subtopicSection = document.getElementById('subtopicSection');
        if (subtopicSection) subtopicSection.style.display = 'none';
    }

    const hasSubtopics = subtopics.length > 0;
    const subtopicSection = document.getElementById('subtopicSection');

    if (hasSubtopics) {
        await renderSubtopics(subtopics);
        if (subtopicSection) subtopicSection.style.display = 'block';
    } else if (subtopicSection) {
        subtopicSection.style.display = 'none';
    }

    // İÇERİKLERİ YÜKLE (Index hatası olsa bile burası çalışmalı)
    await loadTopicContent(hasSubtopics);

    const topicContentSection = document.getElementById('topicContentSection');
    const topicMaterialsSection = document.getElementById('topicMaterialsSection');

    if (topicContentSection) topicContentSection.style.display = '';
    if (topicMaterialsSection) topicMaterialsSection.style.display = '';

    return hasSubtopics;
}

async function loadTopicContent(hasSubtopics) {
    const testsContainer = document.getElementById('testsList');
    const materialsContainer = document.getElementById('materialsList');

    if (testsContainer) testsContainer.innerHTML = '';
    if (materialsContainer) materialsContainer.innerHTML = '';

    let testCount = 0;
    let materialCount = 0;
    const validCompletedIds = new Set();

    if (auth.currentUser) {
        try {
            const completedRef = collection(db, `users/${auth.currentUser.uid}/completed_tests`);
            const q = query(completedRef, where("topicId", "==", currentTopicId));
            const snap = await getDocs(q);
            snap.forEach(d => validCompletedIds.add(d.id));
        } catch (e) {
            console.warn("Tamamlanan testler çekilemedi:", e);
        }
    }

    try {
        const lessonsQuery = query(collection(db, `topics/${currentTopicId}/lessons`), orderBy("order", "asc"));
        const lessonsFallback = collection(db, `topics/${currentTopicId}/lessons`);
        const snapshot = await safeGetDocs(lessonsQuery, lessonsFallback, 'Konu içerikleri');

        snapshot.forEach(doc => {
            const item = { id: doc.id, ...doc.data() };
            if (item?.status === 'deleted' || item?.isDeleted || item?.isActive === false) return;

            const isTest = item.type === 'test' || (Array.isArray(item.questions) && item.questions.length > 0) || Number.isFinite(item.qCount);

            if (isTest) {
                testCount += 1;
                const qCount = item.qCount || (item.questions ? item.questions.length : 0);

                // SEO-Friendly Link Generation
                const testUrl = `/test/${encodeURIComponent(currentTopicId)}/${encodeURIComponent(item.id)}?mode=select`;

                let badgeHtml = '';
                if (validCompletedIds.has(item.id)) {
                    badgeHtml = '<span class="badge bg-success text-white" style="margin-left:auto;">✅ Tamamlandı</span>';
                }

                if (testsContainer) {
                    testsContainer.innerHTML += `
                      <div class="test-card" style="${validCompletedIds.has(item.id) ? 'border-color:var(--color-success); background:rgba(25, 135, 84, 0.03);' : ''}">
                          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; align-items:center;">
                              <div style="display:flex; flex-direction:column;">
                                <strong style="font-size:1.05rem;">${item.title}</strong>
                                <span class="badge bg-light text-dark" style="width:fit-content; margin-top:4px;">${qCount} Soru</span>
                              </div>
                              ${badgeHtml}
                          </div>
                          <div style="margin-top:10px;">
                              <a href="${testUrl}" class="btn btn-sm ${validCompletedIds.has(item.id) ? 'btn-success' : 'btn-outline-primary'} w-100">
                                ${validCompletedIds.has(item.id) ? 'Tekrar Çöz' : 'Testi Çöz'}
                              </a>
                          </div>
                      </div>
                  `;
                }
            } else {
                // Materyalleri işle
                if (item.materials && item.materials.length > 0) {
                    item.materials.forEach(mat => {
                        materialCount++;
                        let icon = '📝'; let bgClass = 'bg-light'; let btnText = 'İncele';
                        let btnAction = `window.open('${mat.url}', '_blank')`;
                        let badge = '';

                        if (mat.type === 'video') { icon = '▶️'; bgClass = 'bg-warning-subtle'; btnText = 'İzle'; badge = `<span class="badge bg-dark text-white ms-2">${mat.duration || ''}</span>`; }
                        else if (mat.type === 'podcast') { icon = '🎧'; bgClass = 'bg-purple-subtle'; btnText = 'Dinle'; badge = `<span class="badge bg-secondary text-white ms-2">${mat.duration || ''}</span>`; }
                        else if (mat.type === 'pdf') { icon = '📄'; bgClass = 'bg-danger-subtle'; btnText = 'İndir'; }
                        else if (mat.type === 'html') { icon = '📰'; bgClass = 'bg-success-subtle'; btnText = 'Oku'; }

                        if (materialsContainer) {
                            materialsContainer.innerHTML += `
                            <div class="test-card ${bgClass}" style="border-left:4px solid var(--color-primary);">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div>
                                        <div class="d-flex align-items-center flex-wrap">
                                            <span style="font-size:1.2rem; margin-right:8px;">${icon}</span>
                                            <strong>${mat.title || item.title}</strong>
                                            ${badge}
                                        </div>
                                        <small class="text-muted d-block mt-1">${mat.description || item.summary || ''}</small>
                                    </div>
                                </div>
                                <button class="btn btn-sm btn-dark w-100 mt-2" onclick="${btnAction}">${btnText}</button>
                            </div>
                        `;
                        }
                    });
                } else {
                    // Eski tip tekil materyal
                    materialCount++;
                    if (materialsContainer) {
                        materialsContainer.innerHTML += `
                        <div class="test-card" style="border-left:4px solid var(--color-success);">
                            <strong>${item.title}</strong>
                            <div class="text-muted small mt-1">${item.summary || ''}</div>
                            <button class="btn btn-sm btn-light w-100 mt-2">İncele</button>
                        </div>
                    `;
                    }
                }
            }
        });

    } catch (error) {
        console.error('İçerik yükleme hatası:', error);
    }

    // --- BOŞ DURUM YÖNETİMİ (Kritik Kısım) ---

    // Eğer test hiç yoksa:
    if (testsContainer && testsContainer.innerHTML === '') {
        // Eğer alt başlıklar varsa kullanıcıyı oraya yönlendirecek bir mesaj göster
        if (hasSubtopics) {
            testsContainer.innerHTML = `
              <div class="test-card">
                <strong>Bu başlıkta test bulunamadı</strong>
                <div class="text-muted small mt-1">Testler için yukarıdaki <b>Alt Başlıklar</b> bölümünden ilgili konuyu seçiniz.</div>
              </div>
            `;
        } else {
            testsContainer.innerHTML = `
              <div class="test-card">
                <strong>Henüz test eklenmemiş</strong>
                <div class="text-muted small mt-1">Bu konu için testler hazırlanıyor.</div>
              </div>
            `;
        }
    }

    // Eğer notlar boşsa, PLACEHOLDER'ları GÖSTER (İsteğiniz üzerine)
    if (materialsContainer && materialsContainer.innerHTML === '') {
        const placeholders = [
            { icon: '🎥', title: 'Videolu Dersler', message: 'Bu konuda henüz videolu anlatım bulunmuyor.' },
            { icon: '📄', title: 'Ders Notları (PDF)', message: 'PDF notları sisteme yükleniyor.' },
            { icon: '🎧', title: 'Podcast', message: 'Sesli anlatımlar çok yakında.' },
            { icon: '📰', title: 'Özet Bilgiler', message: 'Konu özetleri hazırlanma aşamasında.' }
        ];

        materialsContainer.innerHTML = placeholders.map((item) => `
          <div class="test-card" style="opacity: 0.7; border-style: dashed;">
            <div class="d-flex align-items-center" style="gap:10px;">
              <span style="font-size:1.3rem;">${item.icon}</span>
              <strong>${item.title}</strong>
            </div>
            <div class="text-muted small mt-2">${item.message}</div>
          </div>
        `).join('');
    }

    // Alt başlık boş notunu güncelle
    const subtopicNote = document.getElementById('subtopicEmptyNote');
    if (subtopicNote) {
        // Hem alt başlık var hem de bu sayfada hiç içerik yoksa notu göster
        subtopicNote.style.display = (hasSubtopics && testCount === 0 && materialCount === 0) ? 'block' : 'none';
    }

    return { testCount, materialCount, totalCount: testCount + materialCount };
}

async function renderSubtopics(subtopics) {
    const list = document.getElementById('subtopicList');
    if (!list) return;

    const subtopicCards = await Promise.all(subtopics.map(async (subtopic) => {
        // Basit istatistik çekimi (Hata olursa 0 göster)
        let lessonCount = 0;
        let testCount = 0;
        try {
            const lessonQuery = query(collection(db, `topics/${subtopic.id}/lessons`), orderBy("order", "asc"));
            const lessonFallback = collection(db, `topics/${subtopic.id}/lessons`);
            const lessonSnap = await safeGetDocs(lessonQuery, lessonFallback, 'Alt konu içerikleri');
            lessonSnap.forEach(doc => {
                const item = doc.data();
                if (item?.status === 'deleted' || item?.isDeleted) return;
                if (item?.type === 'test') testCount += 1;
                else lessonCount += 1;
            });
        } catch (e) { console.log('Subtopic istatistik hatası', e); }

        return `
          <div class="subtopic-card">
            <h4 class="subtopic-title">${subtopic.title}</h4>
            <span class="subtopic-meta">${subtopic.description || ''}</span>
            <div class="subtopic-badges">
              <span class="badge subtopic-badge">📄 ${lessonCount} Not</span>
              <span class="badge subtopic-badge">📝 ${testCount} Test</span>
            </div>
            <div class="subtopic-actions">
              <a class="btn btn-sm btn-outline-primary" href="/konu/${encodeURIComponent(subtopic.id)}">Konuya Git</a>
            </div>
          </div>
        `;
    }));

    list.innerHTML = subtopicCards.join('');
}

async function loadQuestionCount() {
    if (!currentTopicId) return;
    try {
        // 1. Toplam Soru Sayısı (Paket metadata veya fallback)
        const meta = await TopicService.getTopicPackMeta(currentTopicId);
        let totalCount = meta?.questionCount || meta?.questionIds?.length || 0;

        if (!totalCount) {
            const allIds = await TopicService.getTopicQuestionIdsById(currentTopicId);
            totalCount = allIds.length;
        }

        if (!totalCount && topicTitle) {
            const allIds = await TopicService.getTopicQuestionIds(topicTitle);
            totalCount = allIds.length;
        }

        // 2. Çözülenler
        let solvedCount = 0;
        if (auth.currentUser) {
            const progress = await TopicService.getUserProgress(auth.currentUser.uid, currentTopicId);
            solvedCount = (progress.solvedIds || []).length;
        }

        updateStudyModeState(totalCount, solvedCount);
    } catch (e) {
        console.warn("Soru sayısı çekilemedi:", e);
    }
}

function updateStudyModeState(totalCount, solvedCount) {
    const status = document.getElementById('studyModeStatus');
    const modeButtons = document.querySelectorAll('.mode-btn');
    const resetBtn = document.getElementById('resetProgressBtn');
    const progressBar = document.getElementById('topicProgressBar');
    const progressText = document.getElementById('progressText');

    const hasQuestions = totalCount > 0;
    const remaining = Math.max(0, totalCount - solvedCount);

    // Butonları Yönet
    modeButtons.forEach((btn) => {
        btn.disabled = !hasQuestions;
    });

    // Reset Butonu: Eğer çözülen varsa göster
    if (resetBtn) {
        resetBtn.style.display = (solvedCount > 0 && hasQuestions) ? 'inline-flex' : 'none';
    }

    // Progress Bar Güncelle
    if (progressBar && totalCount > 0) {
        const percent = Math.min(100, Math.round((solvedCount / totalCount) * 100));
        progressBar.style.width = `${percent}%`;
        if (progressText) progressText.innerText = `%${percent} Tamamlandı (${solvedCount}/${totalCount})`;
    }

    if (status) {
        if (remaining === 0 && totalCount > 0) {
            status.innerHTML = `🌟 Tebrikler! <strong>${totalCount}</strong> sorunun tamamını çözdünüz. Tekrar çözmek için sıfırlayabilirsiniz.`;
        } else {
            status.innerHTML = hasQuestions
                ? `Bu konuda toplam <strong id="totalQCount">${totalCount}</strong> soru var. <br> <small>(${solvedCount} çözüldü, ${remaining} kaldı)</small>`
                : `Bu konu için henüz aktif soru bulunmuyor.`;
        }
    }
}

// Global scope functions needing export or window attachment if called from HTML onclick
// The HTML uses onclick="resetTopicProgress()" and onclick="startSmartTest(...)"
// We need to attach these to window
window.resetTopicProgress = async function () {
    if (!currentTopicId) return;
    const confirmed = await showConfirm(
        "Bu konudaki tüm ilerlemeniz sıfırlanacak. Çözdüğünüz sorular 'çözülmemiş' olarak işaretlenecek.\nDevam etmek istiyor musunuz?",
        { title: "İlerlemeyi Sıfırla", confirmText: "Evet, Sıfırla", cancelText: "Vazgeç" }
    );

    if (confirmed) {
        try {
            await TopicService.resetTopicProgress(auth.currentUser.uid, currentTopicId);
            showToast("İlerlemeniz başarıyla sıfırlandı.", "success");
            setTimeout(() => window.location.reload(), 1000); // Reload to refresh state
        } catch (error) {
            showToast("Sıfırlama sırasında bir hata oluştu.", "error");
            console.error(error);
        }
    }
};

window.startSmartTest = function (mode) {
    if (!currentTopicId) return;
    window.location.href = `/test/${currentTopicId}/smart?mode=${mode}`;
};
