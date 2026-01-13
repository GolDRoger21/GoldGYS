import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, writeBatch, doc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentQuestions = []; 

export async function initLegislationPage() {
    console.log("Mevzuat modülü başlatıldı.");
    // UI olmadığı için önce UI'ı basıyoruz
    renderLegislationInterface();
    updateStats();
}

function renderLegislationInterface() {
    const container = document.getElementById('section-legislation');
    if(!container) return;

    container.innerHTML = `
        <div class="section-header">
            <h2>⚖️ Mevzuat Değişiklik Yönetimi</h2>
        </div>
        <div class="card p-4">
            <div class="row align-items-end">
                <div class="col-md-3">
                    <label>Kanun No</label>
                    <input type="text" id="legCode" class="form-control" placeholder="Örn: 5271">
                </div>
                <div class="col-md-3">
                    <label>Madde No</label>
                    <input type="text" id="legArticle" class="form-control" placeholder="Örn: 231">
                </div>
                <div class="col-md-3">
                    <button id="btnFindAffected" class="btn btn-primary w-100">🔎 Etkilenenleri Bul</button>
                </div>
                <div class="col-md-3">
                    <button id="btnShowFlagged" class="btn btn-outline-warning w-100">⚠️ İncelenecekler</button>
                </div>
            </div>
        </div>
        
        <div id="affectedQuestionsArea" class="card mt-3" style="display:none;">
            <div class="d-flex justify-content-between mb-3">
                <h4>Sonuçlar</h4>
                <button id="btnMarkAllReview" class="btn btn-danger">🚨 Tümünü İşaretle</button>
            </div>
            <div class="table-responsive">
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Kategori</th><th>Mevzuat</th><th>Durum</th><th>İşlem</th></tr></thead>
                    <tbody id="legislationTableBody"></tbody>
                </table>
            </div>
        </div>
    `;

    // Eventler
    document.getElementById('btnFindAffected').addEventListener('click', findAffectedQuestions);
    document.getElementById('btnMarkAllReview').addEventListener('click', markAllAsFlagged);
    document.getElementById('btnShowFlagged').addEventListener('click', loadFlaggedQuestions);
}

// Global UI değişkeni yerine document.getElementById kullanacağız
async function updateStats() {
    try {
        const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
        const snapshot = await getCountFromServer(q);
        // İstatistik gösterilecek yer varsa güncelle (opsiyonel)
    } catch (e) { console.warn(e); }
}

async function findAffectedQuestions() {
    const code = document.getElementById('legCode').value;
    const article = document.getElementById('legArticle').value.trim();
    const tableBody = document.getElementById('legislationTableBody');
    const area = document.getElementById('affectedQuestionsArea');

    if (!article) return alert("Madde numarası girin.");

    tableBody.innerHTML = '<tr><td colspan="5">Aranıyor...</td></tr>';
    area.style.display = 'block';

    try {
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), where("legislationRef.article", "==", article));
        const snapshot = await getDocs(q);
        currentQuestions = [];
        tableBody.innerHTML = '';

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5">Soru bulunamadı.</td></tr>';
            return;
        }

        snapshot.forEach(docSnap => {
            currentQuestions.push({ id: docSnap.id, ...docSnap.data() });
            renderRow(docSnap.id, docSnap.data(), tableBody);
        });
    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="5" style="color:red">Hata: ${error.message}</td></tr>`;
    }
}

async function loadFlaggedQuestions() {
    const area = document.getElementById('affectedQuestionsArea');
    const tableBody = document.getElementById('legislationTableBody');
    area.style.display = 'block';
    tableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
    const snapshot = await getDocs(q);
    tableBody.innerHTML = '';
    snapshot.forEach(docSnap => renderRow(docSnap.id, docSnap.data(), tableBody));
}

function renderRow(id, data, tbody) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><small>${id.substring(0,6)}...</small></td>
        <td>${data.category}</td>
        <td>${data.legislationRef?.code} m.${data.legislationRef?.article}</td>
        <td>${data.isFlaggedForReview ? '⚠️' : '✅'}</td>
        <td><button class="btn-sm" onclick="window.openQuestionEditor('${id}')">Düzenle</button></td>
    `;
    tbody.appendChild(tr);
}

async function markAllAsFlagged() {
    if(!currentQuestions.length || !confirm("Emin misiniz?")) return;
    const batch = writeBatch(db);
    currentQuestions.forEach(q => batch.update(doc(db, "questions", q.id), { isFlaggedForReview: true }));
    await batch.commit();
    alert("İşaretlendi.");
    findAffectedQuestions();
}