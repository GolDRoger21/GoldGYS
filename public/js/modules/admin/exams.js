import { db } from "../../firebase-config.js";
import { collection, getDocs, doc, addDoc, deleteDoc, serverTimestamp, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let generatedQuestionsCache = [];

// PDF'teki Konu Dağılımı (Yazı İşleri Müdürü Şablonu)
const EXAM_TEMPLATE = {
    "Türkiye Cumhuriyeti Anayasası": 6,
    "Atatürk İlkeleri ve İnkılap Tarihi": 2,
    "Devlet Teşkilatı": 9,
    "Devlet Memurları Kanunu": 6,
    "Türkçe Dil Bilgisi": 2,
    "Halkla İlişkiler": 1,
    "Etik Davranış İlkeleri": 1,
    "Bakanlık Merkez Teşkilatı": 1,
    "Yargı Örgütü": 6, // Ortak + Alan toplamı
    "UYAP": 1,
    "Mali Yönetim": 1,
    "Bakanlık Teşkilatı (Alan)": 3,
    "Komisyonlar": 1,
    "Elektronik İşlemler (İmza/SEGBİS)": 3,
    "Resmi Yazışma": 6,
    "Tebligat Hukuku": 5,
    "Diğer Mevzuat (Bilgi Edinme vb.)": 7,
    "Yazı İşleri ve Harçlar": 9,
    "Ceza Muhakemesi Kanunu": 3,
    "Hukuk Muhakemeleri Kanunu": 3,
    "İdari Yargılama Usulü": 2,
    "İnfaz Kanunu": 2
};

export function initExamsPage() {
    console.log("Sınav Yönetimi Modülü Başlatıldı");
    renderInterface();
    loadExams();
}

function renderInterface() {
    const container = document.getElementById('section-exams');
    if (!container) return;

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
                    <div class="col-md-3"><label>Süre (Dk)</label><input type="number" id="inpDuration" class="form-control" value="100"></div>
                    <div class="col-md-3"><label>Şablon</label><select class="form-control" disabled><option>Yazı İşleri Müdürü (80 Soru)</option></select></div>
                </div>
                
                <div id="generationLog" class="alert alert-secondary" style="max-height: 150px; overflow-y: auto; font-size: 0.85rem;">
                    Hazır...
                </div>

                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                    <table class="admin-table table-sm">
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

    const btnCreate = document.getElementById('btnCreateExam');
    const btnSave = document.getElementById('btnSaveExam');
    const btnCancel = document.getElementById('btnCancelWizard');

    if (btnCreate) btnCreate.addEventListener('click', startExamGeneration);
    if (btnSave) btnSave.addEventListener('click', saveExamToFirestore);
    if (btnCancel) btnCancel.addEventListener('click', () => {
        document.getElementById('examWizard').style.display = 'none';
    });
}

// --- AKILLI DENEME OLUŞTURMA ALGORİTMASI ---
async function startExamGeneration() {
    const wizard = document.getElementById('examWizard');
    const logArea = document.getElementById('generationLog');
    const tbody = document.getElementById('previewQuestionsBody');
    const saveBtn = document.getElementById('btnSaveExam');

    if (wizard) wizard.style.display = 'block';
    if (tbody) tbody.innerHTML = '';
    if (saveBtn) saveBtn.disabled = true;

    generatedQuestionsCache = [];
    logArea.innerHTML = '🚀 Soru havuzu taranıyor...<br>';

    try {
        // 1. Tüm Aktif Soruları Çek (Performans için sadece gerekli alanlar)
        // Not: Büyük veride bu işlem Cloud Function'a taşınmalıdır. Şimdilik client-side yapıyoruz.
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));

        // Soruları Kategorilere Göre Grupla
        const questionPool = {};
        qSnapshot.forEach(doc => {
            const data = doc.data();
            const cat = data.category || 'Genel';
            if (!questionPool[cat]) questionPool[cat] = [];
            questionPool[cat].push({ id: doc.id, ...data });
        });

        logArea.innerHTML += `📦 Toplam ${qSnapshot.size} aktif soru bulundu.<br>`;

        // 2. Şablona Göre Soru Seç
        let totalSelected = 0;

        for (const [category, targetCount] of Object.entries(EXAM_TEMPLATE)) {
            // Kategori eşleşmesi (Tam veya Kısmi)
            // Veritabanındaki kategori isimleri ile şablondaki isimler uyuşmayabilir.
            // Bu yüzden "içerir" mantığıyla arama yapıyoruz.
            let pool = [];

            // Havuzdaki kategorilerden uygun olanları bul
            Object.keys(questionPool).forEach(poolCat => {
                if (poolCat.includes(category) || category.includes(poolCat)) {
                    pool = pool.concat(questionPool[poolCat]);
                }
            });

            // Yeterli soru var mı?
            if (pool.length < targetCount) {
                logArea.innerHTML += `<span class="text-danger">⚠️ ${category}: Yetersiz soru (${pool.length}/${targetCount}). Eksikler rastgele tamamlanacak.</span><br>`;
            }

            // Rastgele Seçim (Fisher-Yates Shuffle benzeri)
            const selected = pool.sort(() => 0.5 - Math.random()).slice(0, targetCount);
            generatedQuestionsCache = generatedQuestionsCache.concat(selected);

            logArea.innerHTML += `✅ ${category}: ${selected.length} soru seçildi.<br>`;
            totalSelected += selected.length;
        }

        // 3. Eksik Kalanları Tamamla (Hedef 80 Soru)
        const TARGET_TOTAL = 80;
        if (generatedQuestionsCache.length < TARGET_TOTAL) {
            const needed = TARGET_TOTAL - generatedQuestionsCache.length;
            logArea.innerHTML += `ℹ️ Hedefe ulaşmak için ${needed} rastgele soru daha ekleniyor...<br>`;

            // Zaten seçilenlerin ID'lerini al
            const selectedIds = new Set(generatedQuestionsCache.map(q => q.id));

            // Tüm havuzdan seçilmemiş olanları bul
            let remainingPool = [];
            Object.values(questionPool).flat().forEach(q => {
                if (!selectedIds.has(q.id)) remainingPool.push(q);
            });

            const extras = remainingPool.sort(() => 0.5 - Math.random()).slice(0, needed);
            generatedQuestionsCache = generatedQuestionsCache.concat(extras);
        }

        // 4. Önizleme Tablosunu Doldur
        generatedQuestionsCache.forEach((q, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${i + 1}</td><td>${q.category || '-'}</td><td>${q.text ? q.text.substring(0, 50) + '...' : ''}</td>`;
            tbody.appendChild(tr);
        });

        logArea.innerHTML += `<br><strong>🎉 Toplam ${generatedQuestionsCache.length} soru ile deneme hazır!</strong>`;
        logArea.scrollTop = logArea.scrollHeight;

        if (generatedQuestionsCache.length > 0) saveBtn.disabled = false;

    } catch (e) {
        console.error(e);
        logArea.innerHTML += `<div class="text-danger">❌ Hata: ${e.message}</div>`;
    }
}

async function saveExamToFirestore() {
    const titleInp = document.getElementById('inpExamTitle');
    const durInp = document.getElementById('inpDuration');
    const title = titleInp ? titleInp.value : '';

    if (!title) return alert("Lütfen deneme başlığı giriniz");

    try {
        // Soruların sadece ID'lerini ve temel bilgilerini sakla (Veri tasarrufu)
        // Ancak sınav anında hızlı yüklenmesi için tam veriyi de saklayabiliriz (NoSQL mantığı)
        // Şimdilik tam veriyi saklıyoruz.

        await addDoc(collection(db, "exams"), {
            title,
            duration: parseInt(durInp ? durInp.value : 100),
            totalQuestions: generatedQuestionsCache.length,
            questionsSnapshot: generatedQuestionsCache, // Soruların o anki hali (Snapshot)
            createdAt: serverTimestamp(),
            isActive: true,
            role: "Yazı İşleri Müdürü"
        });

        alert("Deneme başarıyla yayınlandı!");
        document.getElementById('examWizard').style.display = 'none';
        loadExams();
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

async function loadExams() {
    const list = document.getElementById('examsList');
    if (!list) return;

    list.innerHTML = 'Yükleniyor...';

    try {
        const snap = await getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc")));
        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<p class="text-muted">Henüz deneme yok.</p>';
            return;
        }

        snap.forEach(d => {
            const exam = d.data();
            const date = exam.createdAt ? new Date(exam.createdAt.seconds * 1000).toLocaleDateString() : '-';

            const div = document.createElement('div');
            div.className = 'card mb-2 p-3 d-flex flex-row justify-content-between align-items-center';
            div.style.borderLeft = '4px solid var(--gold-primary)';

            div.innerHTML = `
                <div>
                    <h5 class="mb-1">${exam.title}</h5>
                    <small class="text-muted">📅 ${date} • 📝 ${exam.totalQuestions} Soru • ⏱️ ${exam.duration} Dk</small>
                </div>
                <div>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteExam('${d.id}')">Sil</button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (error) {
        list.innerHTML = `<div class="text-danger">Hata: ${error.message}</div>`;
    }
}

window.deleteExam = async (id) => {
    if (confirm("Bu denemeyi silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "exams", id));
        loadExams();
    }
};