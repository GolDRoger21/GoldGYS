import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import {
    collection, query, where, getDocs, writeBatch, doc, getCountFromServer, orderBy, limit
} from "../../firestore-metrics.js";

let currentAffectedQuestions = [];
const LEGISLATION_RESULTS_LIMIT = 1000;

export async function initLegislationPage() {
    renderInterface();
    updateDashboardStats();
}

function renderInterface() {
    const container = document.getElementById('section-legislation');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>⚖️ Mevzuat Takip ve Etki Analizi</h2>
                <p class="text-muted">Kanun değişikliklerinden etkilenen soruları tespit edin ve toplu işlem yapın.</p>
            </div>
        </div>
        
        <!-- İstatistik Paneli -->
        <div class="row mb-4">
            <div class="col-md-4">
                <div class="card bg-warning text-dark p-3 h-100">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h3 class="m-0" id="flaggedCount">0</h3>
                            <small>İncelenmesi Gereken Soru</small>
                        </div>
                        <span style="font-size: 2rem;">⚠️</span>
                    </div>
                    <button class="btn btn-sm btn-light mt-3" onclick="loadFlaggedQuestions()">Listele →</button>
                </div>
            </div>
            <div class="col-md-8">
                <div class="card p-4 h-100 border-primary">
                    <h5 class="text-primary mb-3">🔍 Değişiklik Tarayıcı</h5>
                    <div class="row g-2 align-items-end">
                        <div class="col-md-4">
                            <label class="form-label small text-muted">Kanun No / Kod</label>
                            <input type="text" id="searchLegCode" class="form-control" placeholder="Örn: 5271">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small text-muted">Madde No</label>
                            <input type="text" id="searchLegArticle" class="form-control" placeholder="Örn: 231">
                        </div>
                        <div class="col-md-4">
                            <button id="btnAnalyze" class="btn btn-primary w-100">
                                <span class="icon">🔎</span> Etkilenenleri Bul
                            </button>
                        </div>
                    </div>
                    <small class="text-muted mt-2 d-block">
                        * Resmi Gazete'de değişen maddeyi girerek ilgili tüm soruları bulabilirsiniz.
                    </small>
                </div>
            </div>
        </div>

        <!-- Sonuç Listesi -->
        <div id="resultsArea" class="card" style="display:none;">
            <div class="card-header d-flex justify-content-between align-items-center p-3 bg-light">
                <h5 class="m-0">Arama Sonuçları (<span id="resultCount">0</span>)</h5>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-danger" onclick="applyBulkAction('deactivate')">🚫 Toplu Pasife Al</button>
                    <button class="btn btn-sm btn-outline-warning" onclick="applyBulkAction('flag')">🚩 'İncelenecek' İşaretle</button>
                </div>
            </div>
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Kategori</th>
                            <th>Mevzuat Ref.</th>
                            <th>Soru Özeti</th>
                            <th>Durum</th>
                            <th>İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="legislationTableBody"></tbody>
                </table>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('btnAnalyze').addEventListener('click', findAffectedQuestions);

    // Global Fonksiyonlar
    window.loadFlaggedQuestions = loadFlaggedQuestions;
    window.applyBulkAction = applyBulkAction;
}

// --- İŞLEVLER ---

async function updateDashboardStats() {
    try {
        // İncelenmesi gereken (flagged) soru sayısını çek
        const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true), limit(LEGISLATION_RESULTS_LIMIT));
        const snapshot = await getCountFromServer(q);
        document.getElementById('flaggedCount').innerText = snapshot.data().count;
    } catch (e) { console.warn("İstatistik hatası:", e); }
}

async function findAffectedQuestions() {
    const code = document.getElementById('searchLegCode').value.trim();
    const article = document.getElementById('searchLegArticle').value.trim();
    const resultsArea = document.getElementById('resultsArea');
    const tbody = document.getElementById('legislationTableBody');

    if (!code) {
        showToast("Lütfen en azından kanun numarası girin.", "info");
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Veritabanı taranıyor...</td></tr>';
    resultsArea.style.display = 'block';

    try {
        // Sorgu Oluştur
        let constraints = [
            where("legislationRef.code", "==", code)
        ];

        if (article) {
            constraints.push(where("legislationRef.article", "==", article));
        }

        const q = query(collection(db, "questions"), ...constraints, limit(LEGISLATION_RESULTS_LIMIT));
        const snapshot = await getDocs(q);

        currentAffectedQuestions = [];
        tbody.innerHTML = '';
        document.getElementById('resultCount').innerText = snapshot.size;

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Bu kriterlere uygun soru bulunamadı.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            currentAffectedQuestions.push({ id: doc.id, ...data });

            const statusBadge = data.isActive
                ? '<span class="badge bg-success">Aktif</span>'
                : '<span class="badge bg-secondary">Pasif</span>';

            const flagBadge = data.isFlaggedForReview
                ? '<span class="badge bg-warning text-dark">İncelenecek</span>'
                : '';

            tbody.innerHTML += `
                <tr>
                    <td><small>${doc.id.substring(0, 5)}</small></td>
                    <td>${data.category}</td>
                    <td><span class="badge bg-light text-dark border">${data.legislationRef?.code} / Md.${data.legislationRef?.article}</span></td>
                    <td title="${data.text}">${data.text.substring(0, 50)}...</td>
                    <td>${statusBadge} ${flagBadge}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="window.openQuestionEditor('${doc.id}')">Düzenle</button>
                    </td>
                </tr>
            `;
        });

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

async function loadFlaggedQuestions() {
    const resultsArea = document.getElementById('resultsArea');
    const tbody = document.getElementById('legislationTableBody');

    resultsArea.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true), limit(LEGISLATION_RESULTS_LIMIT));
    const snapshot = await getDocs(q);

    currentAffectedQuestions = [];
    tbody.innerHTML = '';
    document.getElementById('resultCount').innerText = snapshot.size;

    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">İncelenmesi gereken soru yok.</td></tr>';
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        currentAffectedQuestions.push({ id: doc.id, ...data });

        tbody.innerHTML += `
            <tr>
                <td><small>${doc.id.substring(0, 5)}</small></td>
                <td>${data.category}</td>
                <td>${data.legislationRef?.code || '-'}</td>
                <td>${data.text.substring(0, 50)}...</td>
                <td><span class="badge bg-warning text-dark">İncelenecek</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.openQuestionEditor('${doc.id}')">Düzenle</button>
                </td>
            </tr>
        `;
    });
}

async function applyBulkAction(actionType) {
    if (currentAffectedQuestions.length === 0) {
        showToast("İşlem yapılacak soru bulunamadı.", "info");
        return;
    }

    let confirmMsg = "";
    let updateData = {};

    if (actionType === 'deactivate') {
        confirmMsg = `${currentAffectedQuestions.length} soruyu YAYINDAN KALDIRMAK (Pasife almak) istiyor musunuz?`;
        updateData = { isActive: false, isFlaggedForReview: true }; // Hem pasife al hem işaretle
    } else if (actionType === 'flag') {
        confirmMsg = `${currentAffectedQuestions.length} soruyu "İncelenecek" olarak işaretlemek istiyor musunuz? (Yayında kalmaya devam eder)`;
        updateData = { isFlaggedForReview: true };
    }

    const shouldApply = await showConfirm(confirmMsg, {
        title: "Toplu İşlem",
        confirmText: "Uygula",
        cancelText: "Vazgeç"
    });
    if (!shouldApply) return;

    try {
        // Firestore Batch (Max 500 işlem)
        const batch = writeBatch(db);

        currentAffectedQuestions.forEach(q => {
            const docRef = doc(db, "questions", q.id);
            batch.update(docRef, updateData);
        });

        await batch.commit();
        showToast("Toplu işlem başarıyla tamamlandı.", "success");

        // Listeyi yenile
        findAffectedQuestions();
        updateDashboardStats();

    } catch (error) {
        console.error(error);
        showToast(`İşlem sırasında hata oluştu: ${error.message}`, "error");
    }
}
