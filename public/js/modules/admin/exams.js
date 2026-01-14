import { db } from "../../firebase-config.js";
import { collection, getDocs, doc, addDoc, deleteDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let generatedQuestionsCache = []; 

export function initExamsPage() {
    console.log("Sınav Yönetimi Modülü Başlatıldı");
    // Önce arayüzü oluştur
    renderInterface();
    // Sonra listeyi yükle
    loadExams();
}

function renderInterface() {
    // DÜZELTME: Doğru container ID'si (section-exams) seçildi.
    // Eskiden section-content seçildiği için Soru Bankası ile çakışıyordu.
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
                <button class="btn btn-sm btn-danger" id="btnCancelWizard">İptal</button>
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

    // Event Listener'ları elementler oluştuktan sonra ekle
    const btnCreate = document.getElementById('btnCreateExam');
    const btnSave = document.getElementById('btnSaveExam');
    const btnCancel = document.getElementById('btnCancelWizard');

    if(btnCreate) btnCreate.addEventListener('click', startExamGeneration);
    if(btnSave) btnSave.addEventListener('click', saveExamToFirestore);
    if(btnCancel) btnCancel.addEventListener('click', () => {
        document.getElementById('examWizard').style.display = 'none';
    });
}

// --- DENEME OLUŞTURMA MANTIĞI ---

async function startExamGeneration() {
    const wizard = document.getElementById('examWizard');
    const status = document.getElementById('generationStatus');
    const tbody = document.getElementById('previewQuestionsBody');
    const saveBtn = document.getElementById('btnSaveExam');
    
    if(wizard) wizard.style.display = 'block';
    if(tbody) tbody.innerHTML = '';
    if(saveBtn) saveBtn.disabled = true;
    if(status) status.innerHTML = 'Sorular seçiliyor...';

    try {
        // Not: Gerçek projede burada daha detaylı bir algoritma kullanılır.
        // Şimdilik test amaçlı rastgele soru çekiyoruz.
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));
        let allQuestions = [];
        qSnapshot.forEach(doc => allQuestions.push({ id: doc.id, ...doc.data() }));

        if (allQuestions.length < 5) throw new Error("Yeterli soru yok! En az 5 aktif soru gerekli.");

        // Rastgele karıştır ve al (Örn: 80 soru)
        generatedQuestionsCache = allQuestions.sort(() => 0.5 - Math.random()).slice(0, 80);

        generatedQuestionsCache.forEach((q, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${i+1}</td><td>${q.category || '-'}</td><td>${q.text ? q.text.substring(0,50) + '...' : ''}</td>`;
            tbody.appendChild(tr);
        });

        if(status) {
            status.className = 'alert alert-success';
            status.innerHTML = `✅ ${generatedQuestionsCache.length} soru seçildi.`;
        }
        if(saveBtn) saveBtn.disabled = false;

    } catch (e) {
        if(status) {
            status.className = 'alert alert-danger';
            status.innerHTML = e.message;
        }
    }
}

async function saveExamToFirestore() {
    const titleInp = document.getElementById('inpExamTitle');
    const durInp = document.getElementById('inpDuration');
    const title = titleInp ? titleInp.value : '';
    
    if(!title) return alert("Lütfen deneme başlığı giriniz");
    
    try {
        await addDoc(collection(db, "exams"), {
            title,
            duration: parseInt(durInp ? durInp.value : 120),
            totalQuestions: generatedQuestionsCache.length,
            questions: generatedQuestionsCache, // Soruların anlık kopyasını sakla
            createdAt: serverTimestamp(),
            isActive: true
        });
        alert("Deneme başarıyla yayınlandı!");
        document.getElementById('examWizard').style.display = 'none';
        loadExams();
    } catch(e) { 
        alert("Hata: " + e.message); 
    }
}

async function loadExams() {
    const list = document.getElementById('examsList');
    if(!list) return;
    
    list.innerHTML = 'Yükleniyor...';
    
    try {
        const snap = await getDocs(collection(db, "exams"));
        list.innerHTML = '';
        
        if(snap.empty) {
            list.innerHTML = '<p class="text-muted">Henüz deneme yok.</p>';
            return;
        }

        snap.forEach(d => {
            const exam = d.data();
            const div = document.createElement('div');
            div.className = 'border p-2 mb-2 d-flex justify-content-between align-items-center bg-dark';
            div.innerHTML = `
                <span>${exam.title} (${exam.totalQuestions} Soru)</span> 
                <button class="btn btn-sm btn-danger" onclick="window.deleteExam('${d.id}')">Sil</button>
            `;
            list.appendChild(div);
        });
    } catch (error) {
        list.innerHTML = `<div class="text-danger">Hata: ${error.message}</div>`;
    }
}

// Silme fonksiyonunu global window nesnesine ata
window.deleteExam = async (id) => {
    if(confirm("Bu denemeyi silmek istediğinize emin misiniz?")) { 
        await deleteDoc(doc(db, "exams", id)); 
        loadExams(); 
    }
};