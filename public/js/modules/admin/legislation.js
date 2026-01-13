import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, writeBatch, doc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// UI Referanslarını global tutmuyoruz, render sonrası seçeceğiz veya direkt kullanacağız.
let currentQuestions = []; 

export async function initLegislationPage() {
    console.log("Mevzuat modülü başlatıldı.");
    renderLegislationInterface(); // Arayüzü oluştur
    updateStats(); // İstatistikleri çek
}

function renderLegislationInterface() {
    const container = document.getElementById('section-legislation');
    if(!container) return;

    container.innerHTML = `
        <div class="section-header">
            <h2>⚖️ Mevzuat Değişiklik Yönetimi</h2>
        </div>
        
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card bg-dark text-white text-center p-3">
                    <h3 id="flaggedCount" class="text-warning display-4 font-weight-bold">0</h3>
                    <small>İncelenmesi Gereken</small>
                </div>
            </div>
            <div class="col-md-9">
                <div class="card p-3">
                    <h4>🔍 Etki Analizi</h4>
                    <p class="text-muted text-sm">Değişen kanun maddesine bağlı soruları bulup topluca işaretleyin.</p>
                    <div class="row">
                        <div class="col-md-3">
                            <input type="text" id="legCode" class="form-control" placeholder="Kanun No (Örn: 5271)">
                        </div>
                        <div class="col-md-3">
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
            <div class="card-header d-flex justify-content-between align-items-center">
                <h4>Sonuçlar</h4>
                <button id="btnMarkAllReview" class="btn btn-danger">🚨 Tümünü "İncelenecek" İşaretle</button>
            </div>
            <div class="table-responsive">
                <table class="table table-hover">
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

    // Event Listener'ları Ekle
    document.getElementById('btnFindAffected').addEventListener('click', findAffectedQuestions);
    document.getElementById('btnMarkAllReview').addEventListener('click', markAllAsFlagged);
    document.getElementById('btnShowFlagged').addEventListener('click', loadFlaggedQuestions);
}

async function updateStats() {
    try {
        const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
        const snapshot = await getCountFromServer(q);
        const flaggedCountDisplay = document.getElementById('flaggedCount');
        if(flaggedCountDisplay) flaggedCountDisplay.innerText = snapshot.data().count;
    } catch (e) {
        console.warn("İstatistik yüklenemedi:", e);
    }
}

// 1. Etkilenen Soruları Bul
async function findAffectedQuestions() {
    const code = document.getElementById('legCode').value;
    const article = document.getElementById('legArticle').value.trim();
    const tableBody = document.getElementById('legislationTableBody');
    const resultsArea = document.getElementById('affectedQuestionsArea');

    if (!article) return alert("Lütfen madde numarası girin.");

    tableBody.innerHTML = '<tr><td colspan="5">Aranıyor... (İndeks oluşturmanız gerekebilir)</td></tr>';
    resultsArea.style.display = 'block';

    try {
        // Firestore Sorgusu: legislationRef.code VE legislationRef.article eşleşenleri bul
        const q = query(
            collection(db, "questions"),
            where("legislationRef.code", "==", code),
            where("legislationRef.article", "==", article)
        );

        const snapshot = await getDocs(q);
        currentQuestions = [];

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5">Bu maddeye bağlı soru bulunamadı.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            currentQuestions.push({ id: docSnap.id, ...data });
            renderRow(docSnap.id, data);
        });

    } catch (error) {
        console.error("Arama hatası:", error);
        tableBody.innerHTML = `<tr><td colspan="5" style="color:red">Hata: ${error.message} <br> (Konsola bakın, indeks linki olabilir)</td></tr>`;
    }
}

// 2. Halihazırda İşaretli Olanları Getir
async function loadFlaggedQuestions() {
    const resultsArea = document.getElementById('affectedQuestionsArea');
    const tableBody = document.getElementById('legislationTableBody');
    resultsArea.style.display = 'block';
    tableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
    const snapshot = await getDocs(q);
    
    tableBody.innerHTML = '';
    snapshot.forEach(docSnap => renderRow(docSnap.id, docSnap.data()));
}

function renderRow(id, data) {
    const tableBody = document.getElementById('legislationTableBody');
    const isFlagged = data.isFlaggedForReview;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><small>${id}</small></td>
        <td>${data.category || '-'}</td>
        <td>
            <span class="badge badge-info">${data.legislationRef?.code} m.${data.legislationRef?.article}</span>
        </td>
        <td>
            ${isFlagged 
                ? '<span class="badge badge-warning">⚠️ İncelenecek</span>' 
                : '<span class="badge badge-success">✅ Güncel</span>'}
        </td>
        <td>
            <button class="btn-sm" onclick="window.openQuestionEditor('${id}')">✏️ Düzenle</button>
        </td>
    `;
    tableBody.appendChild(row);
}

// 3. Toplu İşaretleme (Batch Update)
async function markAllAsFlagged() {
    if (currentQuestions.length === 0) return;
    if (!confirm(`${currentQuestions.length} soruyu "İncelenmesi Gerekiyor" olarak işaretlemek istediğinize emin misiniz?`)) return;

    const batch = writeBatch(db);
    
    currentQuestions.forEach(q => {
        const docRef = doc(db, "questions", q.id);
        batch.update(docRef, { 
            isFlaggedForReview: true,
            lastUpdated: new Date() // Timestamp düzeltilmeli
        });
    });

    try {
        await batch.commit();
        alert("İşlem başarılı! Sorular işaretlendi.");
        updateStats();
        // Tabloyu yenile (basitçe satırları güncelle)
        findAffectedQuestions(); 
    } catch (error) {
        console.error("Batch hatası:", error);
        alert("Güncelleme sırasında hata oluştu.");
    }
}
