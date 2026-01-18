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
import { EXAM_RULES } from "../../data/exam-rules.js";

// --- AKILLI ALGORİTMA ---
async function generateQuestions() {
    const logArea = document.getElementById('generationLog');
    const tbody = document.getElementById('previewQuestionsBody');
    const saveBtn = document.getElementById('btnSaveExam');

    generatedQuestionsCache = [];
    logArea.innerHTML = '🚀 Başlatılıyor (Akıllı Mod)...<br>';
    tbody.innerHTML = '';
    saveBtn.disabled = true;

    try {
        // 1. Tüm Aktif Soruları Çek
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));

        // Soruları Havuza At (Kategoriden bağımsız düz liste)
        const allQuestions = [];
        qSnapshot.forEach(doc => {
            allQuestions.push({ id: doc.id, ...doc.data() });
        });

        logArea.innerHTML += `📦 ${allQuestions.length} aktif soru tarandı.<br>----------------<br>`;
        const selectedIds = new Set();

        // Helper: Soru derse uygun mu?
        const isMatch = (q, lesson) => {
            if (!q.legislationRef) return false;
            const qCode = q.legislationRef.code;
            const qArt = parseInt(q.legislationRef.article);

            // Kod Eşleşmeli
            if (qCode !== lesson.legislationCode) return false;

            // Aralık Kontrolü
            if (lesson.articleRange === "ALL") return true;
            if (typeof lesson.articleRange === 'string' && lesson.articleRange.includes('-')) {
                const [start, end] = lesson.articleRange.split('-').map(Number);
                return qArt >= start && qArt <= end;
            }
            return false;
        };

        // 2. EXAM_RULES (Müfredat) Üzerinden İlerle
        for (const topicRule of EXAM_RULES) {
            let topicSelectedCount = 0;
            logArea.innerHTML += `<strong>📌 ${topicRule.title}</strong> (Hedef: ${topicRule.totalQuestionTarget})<br>`;

            // A. Ders (Lesson) Bazlı Seçim
            if (topicRule.lessons && topicRule.lessons.length > 0) {
                for (const lesson of topicRule.lessons) {
                    if (lesson.qTarget > 0) {
                        // Bu derse uygun soruları bul
                        const candidates = allQuestions.filter(q =>
                            !selectedIds.has(q.id) && isMatch(q, lesson)
                        );

                        // Rastgele Seç
                        const picked = candidates.sort(() => 0.5 - Math.random()).slice(0, lesson.qTarget);

                        picked.forEach(q => {
                            generatedQuestionsCache.push(q);
                            selectedIds.add(q.id);
                        });
                        topicSelectedCount += picked.length;
                        logArea.innerHTML += `&nbsp;&nbsp;↳ ${lesson.title}: ${picked.length}/${lesson.qTarget}<br>`;
                    }
                }
            }

            // B. Eksikleri Tamamla (Konu Bazlı Fallback)
            if (topicSelectedCount < topicRule.totalQuestionTarget) {
                const needed = topicRule.totalQuestionTarget - topicSelectedCount;
                // Konu başlığı eşleşen veya kategori eşleşen boştaki sorular
                const extras = allQuestions.filter(q =>
                    !selectedIds.has(q.id) &&
                    (q.category === topicRule.title || q.category.includes(topicRule.title))
                );

                const pickedExtras = extras.sort(() => 0.5 - Math.random()).slice(0, needed);
                pickedExtras.forEach(q => {
                    generatedQuestionsCache.push(q);
                    selectedIds.add(q.id);
                });

                if (pickedExtras.length > 0) {
                    logArea.innerHTML += `&nbsp;&nbsp;⚠️ Ek Takviye: ${pickedExtras.length} soru<br>`;
                }
            }
        }

        // 3. Genel Kontrol ve Tablo
        // ... (Eski koddaki 80 soruya tamamlama ve tablo render kısmı buraya eklenebilir veya mevcut koddaki gibi bırakılabilir)
        // Ancak burada EXAM_RULES kullandığımız için "Object.entries(EXAM_TEMPLATE)" döngüsü kalktı.

        // Tabloyu Doldur
        generatedQuestionsCache.forEach((q, i) => {
            tbody.innerHTML += `<tr><td>${i + 1}</td><td>${q.category}</td><td>${q.text.substring(0, 40)}...</td></tr>`;
        });

        document.getElementById('qCountBadge').innerText = `${generatedQuestionsCache.length} Soru`;
        logArea.innerHTML += `<br><strong>🎉 Deneme Hazır! Toplam: ${generatedQuestionsCache.length}</strong>`;
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