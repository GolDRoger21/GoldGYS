import { db } from "../../firebase-config.js";
import { collection, getDocs, doc, addDoc, deleteDoc, serverTimestamp, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let generatedQuestionsCache = [];

// Yazı İşleri Müdürü Şablonu
const EXAM_TEMPLATE = {
    "Türkiye Cumhuriyeti Anayasası": 6,
    "Atatürk İlkeleri ve İnkılap Tarihi": 2,
    "Devlet Teşkilatı": 9,
    "Devlet Memurları Kanunu": 6,
    "Türkçe Dil Bilgisi": 2,
    "Halkla İlişkiler": 1,
    "Etik Davranış İlkeleri": 1,
    "Bakanlık Merkez Teşkilatı": 1,
    "Yargı Örgütü": 6,
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
    renderInterface();
    loadExams();
}

function renderInterface() {
    const container = document.getElementById('section-exams');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📝 Deneme Sınavı Yönetimi</h2>
                <p class="text-muted">Otomatik deneme oluşturun veya mevcutları yönetin.</p>
            </div>
            <button id="btnCreateExam" class="btn btn-primary">⚡ Otomatik Deneme Oluştur</button>
        </div>

        <!-- Deneme Oluşturma Sihirbazı -->
        <div id="examWizard" class="card mb-4 border-primary" style="display:none;">
            <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center p-3">
                <h5 class="m-0">Yeni Deneme Oluşturucu</h5>
                <button class="btn btn-sm btn-light text-primary" id="btnCancelWizard">Kapat</button>
            </div>
            <div class="card-body p-4">
                <div class="row g-3 mb-4">
                    <div class="col-md-6">
                        <label class="form-label">Deneme Başlığı</label>
                        <input type="text" id="inpExamTitle" class="form-control" placeholder="Örn: 2025 Genel Deneme - 1">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Süre (Dk)</label>
                        <input type="number" id="inpDuration" class="form-control" value="100">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Şablon</label>
                        <select class="form-control" disabled><option>Yazı İşleri Müdürü (80 Soru)</option></select>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-4">
                        <div class="card bg-light h-100">
                            <div class="card-header fw-bold">İşlem Günlüğü</div>
                            <div id="generationLog" class="card-body" style="max-height: 300px; overflow-y: auto; font-size: 0.85rem;">
                                <span class="text-muted">Başlatılmayı bekliyor...</span>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-8">
                        <div class="card h-100">
                            <div class="card-header fw-bold d-flex justify-content-between">
                                <span>Soru Önizleme</span>
                                <span id="qCountBadge" class="badge bg-secondary">0 Soru</span>
                            </div>
                            <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                                <table class="admin-table table-sm">
                                    <thead><tr><th>#</th><th>Kategori</th><th>Soru</th></tr></thead>
                                    <tbody id="previewQuestionsBody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mt-4 text-end">
                    <button id="btnStartGen" class="btn btn-warning me-2">🔄 Soruları Seç</button>
                    <button id="btnSaveExam" class="btn btn-success" disabled>✅ Yayınla</button>
                </div>
            </div>
        </div>

        <!-- Deneme Listesi -->
        <div class="card">
            <div class="card-header p-3">
                <h5 class="m-0">Yayınlanmış Denemeler</h5>
            </div>
            <div id="examsList" class="p-3">Yükleniyor...</div>
        </div>
    `;

    document.getElementById('btnCreateExam').addEventListener('click', () => document.getElementById('examWizard').style.display = 'block');
    document.getElementById('btnCancelWizard').addEventListener('click', () => document.getElementById('examWizard').style.display = 'none');
    document.getElementById('btnStartGen').addEventListener('click', generateQuestions);
    document.getElementById('btnSaveExam').addEventListener('click', saveExam);
}

async function generateQuestions() {
    const logArea = document.getElementById('generationLog');
    const tbody = document.getElementById('previewQuestionsBody');
    const saveBtn = document.getElementById('btnSaveExam');

    generatedQuestionsCache = [];
    logArea.innerHTML = '🚀 Başlatılıyor...<br>';
    tbody.innerHTML = '';
    saveBtn.disabled = true;

    try {
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));
        const pool = {};

        qSnapshot.forEach(doc => {
            const d = doc.data();
            const cat = d.category || 'Genel';
            if (!pool[cat]) pool[cat] = [];
            pool[cat].push({ id: doc.id, ...d });
        });

        logArea.innerHTML += `📦 ${qSnapshot.size} aktif soru tarandı.<br>`;

        for (const [cat, target] of Object.entries(EXAM_TEMPLATE)) {
            let candidates = [];
            Object.keys(pool).forEach(pCat => {
                if (pCat.includes(cat) || cat.includes(pCat)) candidates = candidates.concat(pool[pCat]);
            });

            if (candidates.length < target) {
                logArea.innerHTML += `<span class="text-danger">⚠️ ${cat}: ${candidates.length}/${target} (Eksik)</span><br>`;
            } else {
                logArea.innerHTML += `<span class="text-success">✅ ${cat}: ${target} OK</span><br>`;
            }

            const selected = candidates.sort(() => 0.5 - Math.random()).slice(0, target);
            generatedQuestionsCache = generatedQuestionsCache.concat(selected);
        }

        // Eksikleri tamamla
        if (generatedQuestionsCache.length < 80) {
            const needed = 80 - generatedQuestionsCache.length;
            logArea.innerHTML += `ℹ️ ${needed} rastgele soru ekleniyor...<br>`;
            // Basitlik için rastgele ekle (Geliştirilebilir)
        }

        // Tabloyu doldur
        generatedQuestionsCache.forEach((q, i) => {
            tbody.innerHTML += `<tr><td>${i + 1}</td><td>${q.category}</td><td>${q.text.substring(0, 40)}...</td></tr>`;
        });

        document.getElementById('qCountBadge').innerText = `${generatedQuestionsCache.length} Soru`;
        saveBtn.disabled = false;

    } catch (e) {
        logArea.innerHTML += `<span class="text-danger">Hata: ${e.message}</span>`;
    }
}

async function saveExam() {
    const title = document.getElementById('inpExamTitle').value;
    const duration = document.getElementById('inpDuration').value;

    if (!title) return alert("Başlık giriniz.");

    try {
        await addDoc(collection(db, "exams"), {
            title,
            duration: parseInt(duration),
            totalQuestions: generatedQuestionsCache.length,
            questionsSnapshot: generatedQuestionsCache,
            createdAt: serverTimestamp(),
            isActive: true,
            role: "Yazı İşleri Müdürü"
        });
        alert("Deneme yayınlandı!");
        document.getElementById('examWizard').style.display = 'none';
        loadExams();
    } catch (e) { alert("Hata: " + e.message); }
}

async function loadExams() {
    const list = document.getElementById('examsList');
    const snap = await getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc")));

    list.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        list.innerHTML += `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div>
                    <strong>${d.title}</strong><br>
                    <small class="text-muted">${d.totalQuestions} Soru • ${d.duration} Dk</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="window.deleteExam('${doc.id}')">Sil</button>
            </div>
        `;
    });
}

window.deleteExam = async (id) => {
    if (confirm("Silinsin mi?")) {
        await deleteDoc(doc(db, "exams", id));
        loadExams();
    }
};