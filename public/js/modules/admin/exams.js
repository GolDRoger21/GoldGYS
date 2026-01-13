import { db } from "../../firebase-config.js";
import { collection, getDocs, doc, addDoc, deleteDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let generatedQuestionsCache = []; 

export function initExamsPage() {
    console.log("Sınav Yönetimi Modülü Başlatıldı");
    renderInterface();
    loadExams();
}

function renderInterface() {
    // DÜZELTME: Doğru container ID'si (section-exams)
    const container = document.getElementById('section-exams'); 
    
    if(!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📝 Deneme Sınavı Yönetimi</h2>
                <p class="text-muted">Yazı İşleri Müdürü şablonuna uygun otomatik deneme oluşturun.</p>
            </div>
            <button id="btnCreateExam" class="btn btn-primary">⚡ Otomatik Deneme Oluştur</button>
        </div>

        <div id="examWizard" class="card mb-4" style="display:none; border: 2px solid var(--gold-primary);">
            <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center p-3">
                <h4 class="mb-0">Yeni Deneme Sınavı</h4>
                <button class="btn btn-sm btn-danger" onclick="document.getElementById('examWizard').style.display='none'">İptal</button>
            </div>
            <div class="card-body p-3">
                <div class="row mb-3">
                    <div class="col-md-6"><label>Deneme Adı</label><input type="text" id="inpExamTitle" class="form-control" placeholder="Örn: 2025 Genel Deneme - 1"></div>
                    <div class="col-md-3"><label>Süre (Dk)</label><input type="number" id="inpDuration" class="form-control" value="120"></div>
                    <div class="col-md-3"><label>Şablon</label><select class="form-control" disabled><option>Yazı İşleri Müdürü (80 Soru)</option></select></div>
                </div>
                <div id="generationStatus" class="alert alert-info">Soru havuzu taranıyor...</div>
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                    <table class="table table-sm">
                        <thead><tr><th>No</th><th>Konu</th><th>Soru</th></tr></thead>
                        <tbody id="previewQuestionsBody"></tbody>
                    </table>
                </div>
                <div class="mt-3 text-right">
                    <button id="btnSaveExam" class="btn btn-success" disabled>✅ Denemeyi Yayınla</button>
                </div>
            </div>
        </div>

        <div class="card p-3">
            <h4>Yayınlanmış Denemeler</h4>
            <div id="examsList">Yükleniyor...</div>
        </div>
    `;

    document.getElementById('btnCreateExam').addEventListener('click', startExamGeneration);
    document.getElementById('btnSaveExam').addEventListener('click', saveExamToFirestore);
}

// --- DENEME OLUŞTURMA MANTIĞI ---
async function startExamGeneration() {
    document.getElementById('examWizard').style.display = 'block';
    const status = document.getElementById('generationStatus');
    const tbody = document.getElementById('previewQuestionsBody');
    const saveBtn = document.getElementById('btnSaveExam');
    
    tbody.innerHTML = '';
    saveBtn.disabled = true;
    status.innerHTML = 'Sorular seçiliyor...';

    try {
        // Basitleştirilmiş rastgele seçim (Örnek amaçlı 5 soru çekiyoruz, gerçekte 80 olacak)
        // Gerçek projede buradaki mantık, yazı işleri müdürü şablonuna göre (örn: Anayasa'dan 6, Türkçe'den 2 soru) işlemeli.
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));
        let allQuestions = [];
        qSnapshot.forEach(doc => allQuestions.push({ id: doc.id, ...doc.data() }));

        if (allQuestions.length < 5) throw new Error("Yeterli soru yok!");

        // Rastgele karıştır ve ilk 80'i (veya var olanı) al
        generatedQuestionsCache = allQuestions.sort(() => 0.5 - Math.random()).slice(0, 80);

        generatedQuestionsCache.forEach((q, i) => {
            tbody.innerHTML += `<tr><td>${i+1}</td><td>${q.category}</td><td>${q.text.substring(0,50)}...</td></tr>`;
        });

        status.className = 'alert alert-success';
        status.innerHTML = `✅ ${generatedQuestionsCache.length} soru seçildi.`;
        saveBtn.disabled = false;

    } catch (e) {
        status.className = 'alert alert-danger';
        status.innerHTML = e.message;
    }
}

async function saveExamToFirestore() {
    const title = document.getElementById('inpExamTitle').value;
    if(!title) return alert("Başlık giriniz");
    
    try {
        await addDoc(collection(db, "exams"), {
            title,
            duration: parseInt(document.getElementById('inpDuration').value),
            totalQuestions: generatedQuestionsCache.length,
            questions: generatedQuestionsCache, // Soruların kopyasını saklıyoruz
            createdAt: serverTimestamp(),
            isActive: true
        });
        alert("Deneme yayınlandı!");
        document.getElementById('examWizard').style.display = 'none';
        loadExams();
    } catch(e) { alert("Hata: " + e.message); }
}

async function loadExams() {
    const list = document.getElementById('examsList');
    const snap = await getDocs(collection(db, "exams"));
    list.innerHTML = '';
    snap.forEach(d => {
        const exam = d.data();
        list.innerHTML += `<div class="border p-2 mb-2 d-flex justify-content-between"><span>${exam.title} (${exam.totalQuestions} Soru)</span> <button class="btn btn-sm btn-danger" onclick="window.deleteExam('${d.id}')">Sil</button></div>`;
    });
}
// Silme fonksiyonunu global yap
window.deleteExam = async (id) => {
    if(confirm("Silinsin mi?")) { await deleteDoc(doc(db, "exams", id)); loadExams(); }
};