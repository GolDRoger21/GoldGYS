import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, writeBatch, doc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global değişken
let currentQuestions = []; 

export async function initLegislationPage() {
    console.log("Mevzuat modülü başlatıldı.");
    
    // 1. Arayüzü Oluştur (HTML boş geldiği için JS ile dolduruyoruz)
    renderLegislationInterface();

    // 2. İstatistikleri güncelle
    updateStats();
}

function renderLegislationInterface() {
    // Admin panelinde ilgili alanı bul
    const container = document.getElementById('section-legislation');
    if(!container) return;

    // Arayüzü oluştur: Başlık, İstatistik Kartı, Arama Kutuları ve Tablo
    container.innerHTML = `
        <div class="section-header">
            <h2>⚖️ Mevzuat Değişiklik Yönetimi</h2>
        </div>
        
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card bg-dark text-white text-center p-3" style="border: 1px solid var(--border-color);">
                    <h3 id="flaggedCount" class="text-warning display-4 font-weight-bold" style="font-size: 2.5rem; margin: 10px 0;">0</h3>
                    <small class="text-muted">İncelenmesi Gereken</small>
                </div>
            </div>
            <div class="col-md-9">
                <div class="card p-3">
                    <h4>🔍 Etki Analizi</h4>
                    <p class="text-muted text-sm">Değişen kanun maddesine bağlı soruları bulup topluca işaretleyin.</p>
                    <div class="row">
                        <div class="col-md-3 form-group">
                            <input type="text" id="legCode" class="form-control" placeholder="Kanun No (Örn: 5271)">
                        </div>
                        <div class="col-md-3 form-group">
                            <input type="text" id="legArticle" class="form-control" placeholder="Madde No (Örn: 231)">
                        </div>
                        <div class="col-md-3">
                            <button id="btnFindAffected" class="btn btn-primary w-100">🔎 Etkilenenleri Bul</button>
                        </div>
                         <div class="col-md-3">
                            <button id="btnShowFlagged" class="btn btn-outline-warning w-100">⚠️ İşaretlileri Gör</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="affectedQuestionsArea" class="card" style="display:none;">
            <div class="card-header d-flex justify-content-between align-items-center mb-3">
                <h4>Sonuçlar</h4>
                <button id="btnMarkAllReview" class="btn btn-danger">🚨 Tümünü "İncelenecek" İşaretle</button>
            </div>
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Kategori</th>
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

    // Event Listener'ları elementler oluştuktan sonra ekle
    const btnFind = document.getElementById('btnFindAffected');
    const btnMark = document.getElementById('btnMarkAllReview');
    const btnShow = document.getElementById('btnShowFlagged');

    if(btnFind) btnFind.addEventListener('click', findAffectedQuestions);
    if(btnMark) btnMark.addEventListener('click', markAllAsFlagged);
    if(btnShow) btnShow.addEventListener('click', loadFlaggedQuestions);
}

async function updateStats() {
    try {
        const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
        const snapshot = await getCountFromServer(q);
        const countDisplay = document.getElementById('flaggedCount');
        if(countDisplay) countDisplay.innerText = snapshot.data().count;
    } catch (e) {
        console.warn("İstatistik yüklenemedi:", e);
    }
}

async function findAffectedQuestions() {
    const codeInput = document.getElementById('legCode');
    const articleInput = document.getElementById('legArticle');
    const tableBody = document.getElementById('legislationTableBody');
    const area = document.getElementById('affectedQuestionsArea');

    const code = codeInput ? codeInput.value : '';
    const article = articleInput ? articleInput.value.trim() : '';

    if (!article) return alert("Lütfen madde numarası girin.");

    if(tableBody) tableBody.innerHTML = '<tr><td colspan="5">Aranıyor...</td></tr>';
    if(area) area.style.display = 'block';

    try {
        const q = query(
            collection(db, "questions"),
            where("legislationRef.code", "==", code),
            where("legislationRef.article", "==", article)
        );

        const snapshot = await getDocs(q);
        currentQuestions = [];

        if (snapshot.empty) {
            if(tableBody) tableBody.innerHTML = '<tr><td colspan="5">Bu maddeye bağlı soru bulunamadı.</td></tr>';
            return;
        }

        if(tableBody) tableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            currentQuestions.push({ id: docSnap.id, ...data });
            renderRow(docSnap.id, data);
        });

    } catch (error) {
        console.error("Arama hatası:", error);
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="error">Hata: ${error.message} <br><small>Firestore İndeksi gerekebilir. Konsolu kontrol edin.</small></td></tr>`;
    }
}

async function loadFlaggedQuestions() {
    const area = document.getElementById('affectedQuestionsArea');
    const tableBody = document.getElementById('legislationTableBody');
    
    if(area) area.style.display = 'block';
    if(tableBody) tableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    try {
        const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
        const snapshot = await getDocs(q);
        
        currentQuestions = [];
        if(tableBody) tableBody.innerHTML = '';
        
        if (snapshot.empty) {
            if(tableBody) tableBody.innerHTML = '<tr><td colspan="5">İncelenmesi gereken soru yok.</td></tr>';
            return;
        }

        snapshot.forEach(docSnap => {
            currentQuestions.push({ id: docSnap.id, ...docSnap.data() });
            renderRow(docSnap.id, docSnap.data());
        });
    } catch (e) {
        console.error(e);
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="5">Hata: ${e.message}</td></tr>`;
    }
}

function renderRow(id, data) {
    const tableBody = document.getElementById('legislationTableBody');
    if(!tableBody) return;

    const isFlagged = data.isFlaggedForReview;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><small>${id.substring(0,8)}...</small></td>
        <td>${data.category || '-'}</td>
        <td>
            <span class="badge" style="background:var(--bg-secondary); color:var(--text-primary);">${data.legislationRef?.code || '?'} m.${data.legislationRef?.article || '?'}</span>
        </td>
        <td>
            ${isFlagged 
                ? '<span class="badge" style="background:#f59e0b; color:#000;">⚠️ İncelenecek</span>' 
                : '<span class="badge" style="background:#10b981; color:#fff;">✅ Güncel</span>'}
        </td>
        <td>
            <button class="btn-sm btn-primary" onclick="window.openQuestionEditor('${id}')">✏️ Düzenle</button>
        </td>
    `;
    tableBody.appendChild(row);
}

async function markAllAsFlagged() {
    if (currentQuestions.length === 0) return;
    if (!confirm(`${currentQuestions.length} soruyu "İncelenmesi Gerekiyor" olarak işaretlemek istediğinize emin misiniz?`)) return;

    const batch = writeBatch(db);
    
    currentQuestions.forEach(q => {
        const docRef = doc(db, "questions", q.id);
        batch.update(docRef, { 
            isFlaggedForReview: true
        });
    });

    try {
        await batch.commit();
        alert("İşlem başarılı! Sorular işaretlendi.");
        updateStats();
        // Tabloyu yenile
        const codeInput = document.getElementById('legCode');
        if(codeInput && codeInput.value) {
            findAffectedQuestions();
        } else {
            loadFlaggedQuestions();
        }
    } catch (error) {
        console.error("Batch hatası:", error);
        alert("Güncelleme sırasında hata oluştu.");
    }
}