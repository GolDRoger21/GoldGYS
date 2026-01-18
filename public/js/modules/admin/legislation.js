import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, writeBatch, doc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentQuestions = [];

export async function initLegislationPage() {
    console.log("Mevzuat modülü başlatıldı.");
    renderLegislationInterface();
    updateStats();
}

function renderLegislationInterface() {
    const container = document.getElementById('section-legislation');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>⚖️ Mevzuat Değişiklik Yönetimi</h2>
                <p class="text-muted">Değişen kanun maddelerine bağlı soruları tespit edin ve güncelleyin.</p>
            </div>
        </div>
        
        <div class="row mb-4">
            <div class="col-md-4">
                <div class="card bg-dark text-white text-center p-4" style="border: 1px solid var(--border-color);">
                    <h3 id="flaggedCount" class="text-warning display-4 font-weight-bold" style="font-size: 2.5rem; margin: 10px 0;">0</h3>
                    <small class="text-muted">İncelenmesi Gereken Soru</small>
                </div>
            </div>
            <div class="col-md-8">
                <div class="card p-4">
                    <h4>🔍 Etki Analizi</h4>
                    <p class="text-muted text-sm mb-3">Örn: 5271 sayılı kanunun 231. maddesi değiştiyse, bu maddeye atıf yapan tüm soruları bul.</p>
                    <div class="row">
                        <div class="col-md-4 form-group">
                            <label>Kanun No</label>
                            <input type="text" id="legCode" class="form-control" placeholder="Örn: 5271">
                        </div>
                        <div class="col-md-4 form-group">
                            <label>Madde No</label>
                            <input type="text" id="legArticle" class="form-control" placeholder="Örn: 231">
                        </div>
                        <div class="col-md-4 form-group" style="display:flex; align-items:flex-end;">
                            <button id="btnFindAffected" class="btn btn-primary w-100">🔎 Etkilenenleri Bul</button>
                        </div>
                    </div>
                    <div class="mt-2 text-right">
                        <button id="btnShowFlagged" class="btn btn-sm btn-outline-warning">⚠️ Mevcut İşaretlileri Gör</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="affectedQuestionsArea" class="card" style="display:none;">
            <div class="card-header d-flex justify-content-between align-items-center mb-3 p-3 border-bottom">
                <h4 class="m-0">Arama Sonuçları</h4>
                <button id="btnMarkAllReview" class="btn btn-danger">🚨 Tümünü "İncelenecek" İşaretle</button>
            </div>
            <div class="table-responsive p-3">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Kategori</th>
                            <th>Soru Özeti</th>
                            <th>Mevzuat</th>
                            <th>Durum</th>
                            <th>İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="legislationTableBody"></tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('btnFindAffected').addEventListener('click', findAffectedQuestions);
    document.getElementById('btnMarkAllReview').addEventListener('click', markAllAsFlagged);
    document.getElementById('btnShowFlagged').addEventListener('click', loadFlaggedQuestions);
}

async function updateStats() {
    try {
        const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
        const snapshot = await getCountFromServer(q);
        const el = document.getElementById('flaggedCount');
        if (el) el.innerText = snapshot.data().count;
    } catch (e) { console.warn(e); }
}

async function findAffectedQuestions() {
    const code = document.getElementById('legCode').value.trim();
    const article = document.getElementById('legArticle').value.trim();
    const tableBody = document.getElementById('legislationTableBody');
    const area = document.getElementById('affectedQuestionsArea');

    if (!code || !article) return alert("Lütfen Kanun No ve Madde No giriniz.");

    if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Veritabanı taranıyor...</td></tr>';
    if (area) area.style.display = 'block';

    try {
        // İç içe obje sorgusu (legislationRef.code)
        const q = query(
            collection(db, "questions"),
            where("legislationRef.code", "==", code),
            where("legislationRef.article", "==", article)
        );

        const snapshot = await getDocs(q);
        currentQuestions = [];

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Bu maddeye bağlı soru bulunamadı.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            currentQuestions.push({ id: docSnap.id, ...data });
            renderRow(docSnap.id, data, tableBody);
        });

    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

async function loadFlaggedQuestions() {
    const area = document.getElementById('affectedQuestionsArea');
    const tableBody = document.getElementById('legislationTableBody');

    area.style.display = 'block';
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
    const snapshot = await getDocs(q);

    currentQuestions = [];
    tableBody.innerHTML = '';

    if (snapshot.empty) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">İncelenmesi gereken soru yok.</td></tr>';
        return;
    }

    snapshot.forEach(docSnap => {
        currentQuestions.push({ id: docSnap.id, ...docSnap.data() });
        renderRow(docSnap.id, docSnap.data(), tableBody);
    });
}

function renderRow(id, data, container) {
    const isFlagged = data.isFlaggedForReview;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><small>${id.substring(0, 6)}</small></td>
        <td>${data.category || '-'}</td>
        <td>${data.text ? data.text.substring(0, 40) + '...' : '-'}</td>
        <td>
            <span class="badge" style="background:var(--bg-hover);">${data.legislationRef?.code || '?'} / ${data.legislationRef?.article || '?'}</span>
        </td>
        <td>
            ${isFlagged
            ? '<span class="badge" style="background:#f59e0b; color:#000;">⚠️ İncelenecek</span>'
            : '<span class="badge" style="background:#10b981; color:#fff;">✅ Güncel</span>'}
        </td>
        <td>
            <button class="btn btn-sm btn-primary" onclick="window.openQuestionEditor('${id}')">✏️</button>
        </td>
    `;
    container.appendChild(row);
}

async function markAllAsFlagged() {
    if (currentQuestions.length === 0) return;
    if (!confirm(`${currentQuestions.length} soruyu "İncelenmesi Gerekiyor" olarak işaretlemek ve pasife almak istiyor musunuz?`)) return;

    const batch = writeBatch(db);

    currentQuestions.forEach(q => {
        const docRef = doc(db, "questions", q.id);
        batch.update(docRef, {
            isFlaggedForReview: true,
            isActive: false // Güvenlik için yayından kaldır
        });
    });

    try {
        await batch.commit();
        alert("İşlem başarılı! Sorular işaretlendi ve yayından kaldırıldı.");
        updateStats();
        findAffectedQuestions(); // Listeyi yenile
    } catch (error) {
        alert("Hata: " + error.message);
    }
}