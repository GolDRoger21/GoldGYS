import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, writeBatch, doc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elementleri
const ui = {
    legCode: document.getElementById('legCode'),
    legArticle: document.getElementById('legArticle'),
    btnFind: document.getElementById('btnFindAffected'),
    btnMarkAll: document.getElementById('btnMarkAllReview'),
    btnShowFlagged: document.getElementById('btnShowFlagged'),
    resultsArea: document.getElementById('affectedQuestionsArea'),
    tableBody: document.getElementById('legislationTableBody'),
    flaggedCountDisplay: document.getElementById('flaggedCount')
};

let currentQuestions = []; // Listelenen soruları tutar

export async function initLegislationPage() {
    console.log("Mevzuat modülü başlatıldı.");
    
    // Event Listeners
    if(ui.btnFind) ui.btnFind.addEventListener('click', findAffectedQuestions);
    if(ui.btnMarkAll) ui.btnMarkAll.addEventListener('click', markAllAsFlagged);
    if(ui.btnShowFlagged) ui.btnShowFlagged.addEventListener('click', loadFlaggedQuestions);

    // Açılışta sayıları güncelle
    updateStats();
}

async function updateStats() {
    try {
        const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
        const snapshot = await getCountFromServer(q);
        if(ui.flaggedCountDisplay) ui.flaggedCountDisplay.innerText = snapshot.data().count;
    } catch (e) {
        console.warn("İstatistik yüklenemedi:", e);
    }
}

// 1. Etkilenen Soruları Bul
async function findAffectedQuestions() {
    const code = ui.legCode.value;
    const article = ui.legArticle.value.trim();

    if (!article) return alert("Lütfen madde numarası girin.");

    ui.tableBody.innerHTML = '<tr><td colspan="5">Aranıyor... (İndeks oluşturmanız gerekebilir)</td></tr>';
    ui.resultsArea.style.display = 'block';

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
            ui.tableBody.innerHTML = '<tr><td colspan="5">Bu maddeye bağlı soru bulunamadı.</td></tr>';
            return;
        }

        ui.tableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            currentQuestions.push({ id: docSnap.id, ...data });
            renderRow(docSnap.id, data);
        });

    } catch (error) {
        console.error("Arama hatası:", error);
        ui.tableBody.innerHTML = `<tr><td colspan="5" style="color:red">Hata: ${error.message} <br> (Konsola bakın, indeks linki olabilir)</td></tr>`;
    }
}

// 2. Halihazırda İşaretli Olanları Getir
async function loadFlaggedQuestions() {
    ui.resultsArea.style.display = 'block';
    ui.tableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    const q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));
    const snapshot = await getDocs(q);
    
    ui.tableBody.innerHTML = '';
    snapshot.forEach(docSnap => renderRow(docSnap.id, docSnap.data()));
}

function renderRow(id, data) {
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
    ui.tableBody.appendChild(row);
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