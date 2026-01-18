import { db } from "../../firebase-config.js";
import { collection, getDocs, doc, addDoc, deleteDoc, serverTimestamp, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let generatedQuestionsCache = [];

// SINAV ŞABLONU (Konu Dağılımı)
// Not: Veritabanındaki 'category' alanlarınızın bu isimleri içerdiğinden emin olun.
const EXAM_TEMPLATE = {
    "Anayasa": 6,
    "Atatürk": 2,
    "Devlet Teşkilatı": 9,
    "Devlet Memurları": 6,
    "Türkçe": 2,
    "Halkla İlişkiler": 1,
    "Etik": 1,
    "Bakanlık": 4, // Merkez + Alan
    "Yargı": 6,
    "UYAP": 1,
    "Mali": 1,
    "Komisyon": 1,
    "Elektronik": 3,
    "Yazışma": 6,
    "Tebligat": 5,
    "Bilgi Edinme": 1,
    "Dilekçe": 1,
    "Disiplin": 2,
    "Yazı İşleri": 9,
    "Ceza Muhakemesi": 3,
    "Hukuk Muhakemeleri": 3,
    "İdari Yargılama": 2,
    "İnfaz": 2
};

export function initExamsPage() {
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
                            <div id="generationLog" class="card-body p-2" style="max-height: 300px; overflow-y: auto; font-size: 0.85rem; font-family:monospace;">
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

// --- AKILLI ALGORİTMA ---
async function generateQuestions() {
    const logArea = document.getElementById('generationLog');
    const tbody = document.getElementById('previewQuestionsBody');
    const saveBtn = document.getElementById('btnSaveExam');

    generatedQuestionsCache = [];
    logArea.innerHTML = '🚀 Başlatılıyor...<br>';
    tbody.innerHTML = '';
    saveBtn.disabled = true;

    try {
        // 1. Tüm Aktif Soruları Çek
        // Not: Büyük veride bu işlem Cloud Function ile yapılmalıdır. Şimdilik client-side.
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));

        // Soruları Havuza At
        const pool = {};
        qSnapshot.forEach(doc => {
            const d = doc.data();
            const cat = d.category || 'Genel';
            if (!pool[cat]) pool[cat] = [];
            pool[cat].push({ id: doc.id, ...d });
        });

        logArea.innerHTML += `📦 ${qSnapshot.size} aktif soru tarandı.<br>----------------<br>`;

        // 2. Şablona Göre Seçim Yap
        for (const [targetCat, targetCount] of Object.entries(EXAM_TEMPLATE)) {
            let candidates = [];

            // Havuzdaki kategorilerden, hedef kategori ismini İÇERENLERİ bul
            // Örn: "Anayasa" arıyorsak "Anayasa Hukuku", "TC Anayasası" vb. gelir.
            Object.keys(pool).forEach(poolCat => {
                if (poolCat.includes(targetCat) || targetCat.includes(poolCat)) {
                    candidates = candidates.concat(pool[poolCat]);
                }
            });

            // Yeterli soru var mı?
            if (candidates.length < targetCount) {
                logArea.innerHTML += `<span class="text-danger">⚠️ ${targetCat}: ${candidates.length}/${targetCount} (Eksik)</span><br>`;
            } else {
                logArea.innerHTML += `<span class="text-success">✅ ${targetCat}: ${targetCount} OK</span><br>`;
            }

            // Rastgele Karıştır ve Seç
            const selected = candidates.sort(() => 0.5 - Math.random()).slice(0, targetCount);
            generatedQuestionsCache = generatedQuestionsCache.concat(selected);
        }

        // 3. Eksikleri Tamamla (Hedef 80)
        if (generatedQuestionsCache.length < 80) {
            const needed = 80 - generatedQuestionsCache.length;
            logArea.innerHTML += `----------------<br>ℹ️ Hedef 80 için ${needed} rastgele soru ekleniyor...<br>`;

            // Seçilmemiş sorulardan bir havuz oluştur
            const selectedIds = new Set(generatedQuestionsCache.map(q => q.id));
            let remainingPool = [];
            Object.values(pool).flat().forEach(q => {
                if (!selectedIds.has(q.id)) remainingPool.push(q);
            });

            const extras = remainingPool.sort(() => 0.5 - Math.random()).slice(0, needed);
            generatedQuestionsCache = generatedQuestionsCache.concat(extras);
        }

        // 4. Tabloyu Doldur
        generatedQuestionsCache.forEach((q, i) => {
            tbody.innerHTML += `<tr><td>${i + 1}</td><td>${q.category}</td><td>${q.text.substring(0, 40)}...</td></tr>`;
        });

        document.getElementById('qCountBadge').innerText = `${generatedQuestionsCache.length} Soru`;
        logArea.innerHTML += `<br><strong>🎉 Deneme Hazır!</strong>`;
        logArea.scrollTop = logArea.scrollHeight;

        if (generatedQuestionsCache.length > 0) saveBtn.disabled = false;

    } catch (e) {
        logArea.innerHTML += `<span class="text-danger">Hata: ${e.message}</span>`;
        console.error(e);
    }
}

async function saveExam() {
    const title = document.getElementById('inpExamTitle').value;
    const duration = document.getElementById('inpDuration').value;

    if (!title) return alert("Başlık giriniz.");

    try {
        // Soruların anlık kopyasını (Snapshot) kaydediyoruz.
        // Böylece ana soru değişse/silinse bile deneme bozulmaz.
        await addDoc(collection(db, "exams"), {
            title,
            duration: parseInt(duration),
            totalQuestions: generatedQuestionsCache.length,
            questionsSnapshot: generatedQuestionsCache,
            createdAt: serverTimestamp(),
            isActive: true,
            role: "Yazı İşleri Müdürü"
        });
        alert("Deneme başarıyla yayınlandı!");
        document.getElementById('examWizard').style.display = 'none';
        loadExams();
    } catch (e) { alert("Hata: " + e.message); }
}

async function loadExams() {
    const list = document.getElementById('examsList');
    const snap = await getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc")));

    list.innerHTML = '';
    if (snap.empty) {
        list.innerHTML = '<p class="text-muted">Henüz deneme yok.</p>';
        return;
    }

    snap.forEach(doc => {
        const d = doc.data();
        const date = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString() : '-';

        list.innerHTML += `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div>
                    <strong>${d.title}</strong><br>
                    <small class="text-muted">📅 ${date} • 📝 ${d.totalQuestions} Soru • ⏱️ ${d.duration} Dk</small>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.deleteExam('${doc.id}')">Sil</button>
                </div>
            </div>
        `;
    });
}

window.deleteExam = async (id) => {
    if (confirm("Bu denemeyi silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "exams", id));
        loadExams();
    }
};