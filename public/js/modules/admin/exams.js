import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import { getConfigPublic } from "./utils.js";
import { collection, getDocs, doc, addDoc, deleteDoc, serverTimestamp, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let generatedQuestionsCache = [];

// SINAV ŞABLONU (PDF'e Göre Kanun Kodları ve Soru Sayıları)
const EXAM_BLUEPRINT = [
    { code: "2709", count: 6, name: "Anayasa" },
    { code: "HIST_01", count: 1, name: "İnkılap Tarihi" },
    { code: "SEC_01", count: 1, name: "Ulusal Güvenlik" },
    { code: "5302", count: 2, name: "İl Özel İdaresi" },
    { code: "5393", count: 2, name: "Belediye Kanunu" },
    { code: "5442", count: 2, name: "İl İdaresi Kanunu" },
    { code: "CBK-1", count: 4, name: "CB Kararnamesi (Genel+Bakanlık)" }, // 3 Genel + 1 Bakanlık
    { code: "657", count: 6, name: "Devlet Memurları Kanunu" },
    { code: "LANG_01", count: 2, name: "Türkçe Dil Bilgisi" },
    { code: "PR_01", count: 1, name: "Halkla İlişkiler" },
    { code: "ETHIC_01", count: 1, name: "Etik İlkeler" },
    { code: "5235", count: 2, name: "Adli Yargı Kanunu" },
    { code: "2576", count: 2, name: "İdari Yargı Kanunu" },
    { code: "YONETMELIK_YAZI", count: 0, name: "Yazı İşleri Yön. (Ortak)" }, // Ortak konularda soru sayısı 0 görünüyor ama eklenebilir
    { code: "UYAP_01", count: 1, name: "UYAP" },
    { code: "5018", count: 1, name: "Mali Yönetim" },
    // ALAN BİLGİSİ
    { code: "YONETMELIK_KOMISYON", count: 1, name: "Komisyonlar" },
    { code: "5070", count: 2, name: "E-İmza" },
    { code: "YONETMELIK_SEGBIS", count: 1, name: "SEGBİS" },
    { code: "YONETMELIK_YAZISMA", count: 6, name: "Resmi Yazışma" },
    { code: "7201", count: 2, name: "Tebligat Kanunu" },
    { code: "YONETMELIK_TEBLIGAT", count: 2, name: "Tebligat Yön." },
    { code: "YONETMELIK_ETEBLIGAT", count: 1, name: "E-Tebligat" },
    { code: "4982", count: 1, name: "Bilgi Edinme" },
    { code: "3071", count: 1, name: "Dilekçe Hakkı" },
    { code: "YONETMELIK_DISIPLIN", count: 2, name: "Disiplin Yön." },
    { code: "YONETMELIK_GYS", count: 1, name: "GYS Yön." },
    { code: "YONETMELIK_ATAMA", count: 2, name: "Atama Yön." },
    { code: "492", count: 1, name: "Harçlar Kanunu" },
    { code: "YONETMELIK_ADLI", count: 4, name: "Adli Yazı İşleri" },
    { code: "YONETMELIK_IDARI", count: 4, name: "İdari Yazı İşleri" },
    { code: "5271", count: 3, name: "CMK" },
    { code: "6100", count: 3, name: "HMK" },
    { code: "2577", count: 2, name: "İYUK" },
    { code: "5275", count: 2, name: "İnfaz Kanunu" }
];

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

    // Load default duration
    getConfigPublic().then(config => {
        const durationInput = document.getElementById('inpDuration');
        if (durationInput && config.examRules?.defaultDuration) {
            durationInput.value = config.examRules.defaultDuration;
        }
    });
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
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));
        const allQuestions = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        logArea.innerHTML += `📦 ${allQuestions.length} aktif soru tarandı.<br>----------------<br>`;

        // 2. Blueprint'e Göre Seçim Yap
        for (const rule of EXAM_BLUEPRINT) {
            if (rule.count === 0) continue;

            // Bu kanuna ait soruları filtrele (legislationRef.code ile)
            const candidates = allQuestions.filter(q => q.legislationRef?.code === rule.code);

            if (candidates.length < rule.count) {
                logArea.innerHTML += `<span class="text-danger">⚠️ ${rule.name}: ${candidates.length}/${rule.count} (Eksik)</span><br>`;
            } else {
                logArea.innerHTML += `<span class="text-success">✅ ${rule.name}: ${rule.count} OK</span><br>`;
            }

            // Rastgele Karıştır ve Seç
            const selected = candidates.sort(() => 0.5 - Math.random()).slice(0, rule.count);
            generatedQuestionsCache = generatedQuestionsCache.concat(selected);
        }

        // 3. Eksikleri Tamamla
        const config = await getConfigPublic();
        const targetDesc = config.examRules?.targetQuestionCount || 80;

        if (generatedQuestionsCache.length < targetDesc) {
            const needed = targetDesc - generatedQuestionsCache.length;
            logArea.innerHTML += `----------------<br>ℹ️ Hedef ${targetDesc} için ${needed} rastgele soru ekleniyor...<br>`;

            // Seçilmemiş sorulardan bir havuz oluştur
            const selectedIds = new Set(generatedQuestionsCache.map(q => q.id));
            const remainingPool = allQuestions.filter(q => !selectedIds.has(q.id));

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

    if (!title) {
        showToast("Lütfen bir başlık girin.", "info");
        return;
    }

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
        showToast("Deneme başarıyla yayınlandı.", "success");
        document.getElementById('examWizard').style.display = 'none';
        loadExams();
    } catch (e) {
        showToast(`Yayınlama sırasında hata oluştu: ${e.message}`, "error");
    }
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
    const shouldDelete = await showConfirm("Bu denemeyi silmek istediğinize emin misiniz?", {
        title: "Denemeyi Sil",
        confirmText: "Sil",
        cancelText: "Vazgeç",
        tone: "error"
    });
    if (!shouldDelete) return;

    await deleteDoc(doc(db, "exams", id));
    loadExams();
    showToast("Deneme silindi.", "success");
};
