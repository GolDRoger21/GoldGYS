import { db } from "../../firebase-config.js";
import { 
    collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// PDF'teki Dağılım Tablosu (Sistemin Beyni)
const YAZI_ISLERI_SABLON = [
    // --- ORTAK KONULAR (32 Soru) ---
    { title: "T.C. Anayasası", count: 6, tags: ["anayasa", "genel esaslar", "temel haklar"] },
    { title: "Atatürk İlkeleri ve İnkılap Tarihi", count: 2, tags: ["atatürk", "inkılap"] },
    { title: "Devlet Teşkilatı Mevzuatı", count: 9, tags: ["5302", "5393", "5442", "cbk-1"] },
    { title: "657 DMK ve Mevzuat", count: 6, tags: ["657", "etik", "halkla ilişkiler"] },
    { title: "Türkçe ve Yazışma", count: 2, tags: ["türkçe", "yazışma"] },
    { title: "Adli/İdari Yargı Örgütü (Ortak)", count: 2, tags: ["yargı örgütü", "5235", "2576"] },
    { title: "UYAP ve Bilişim", count: 1, tags: ["uyap", "segbi̇s", "hmk-445"] },
    { title: "5018 Kamu Mali Yönetimi", count: 1, tags: ["5018", "mali yönetim"] },
    
    // --- ALAN BİLGİSİ (48 Soru) ---
    { title: "Bakanlık Teşkilatı", count: 3, tags: ["bakanlık teşkilatı", "cbk-1-altıncı"] },
    { title: "Komisyonlar ve Yargı Örgütü", count: 5, tags: ["komisyon", "yargı örgütü detay"] }, // 1+4 birleştirildi
    { title: "Elektronik İmza ve SEGBİS", count: 3, tags: ["imza", "5070", "segbi̇s"] },
    { title: "Resmi Yazışma Kuralları", count: 6, tags: ["resmi yazışma", "yönetmelik"] },
    { title: "Tebligat Hukuku", count: 5, tags: ["tebligat", "7201"] },
    { title: "Memur Mevzuatı (Özel)", count: 7, tags: ["4982", "3071", "disiplin", "atama"] },
    { title: "Yazı İşleri ve Harçlar", count: 9, tags: ["492", "harçlar", "yazı işleri yönetmelik"] },
    { title: "Ceza Muhakemesi (CMK)", count: 3, tags: ["cmk", "5271"] },
    { title: "Hukuk Muhakemeleri (HMK)", count: 3, tags: ["hmk", "6100"] },
    { title: "İdari Yargılama (İYUK)", count: 2, tags: ["iyuk", "2577"] },
    { title: "İnfaz Kanunu", count: 2, tags: ["infaz", "5275"] }
];

let generatedQuestionsCache = []; // Oluşturulan taslak soruları tutar

export function initExamsPage() {
    console.log("Sınav Yönetimi Modülü Başlatıldı");
    renderInterface();
    loadExams();
}

function renderInterface() {
    const container = document.getElementById('section-content'); // Veya ayrı bir section
    // Mevcut içeriği temizle (Admin sayfa yapısına göre burayı ayarlayabilirsiniz)
    // Eğer ayrı bir sayfa/tab yapacaksanız 'section-exams' ID'li bir div kullanın.
    // Ben şimdilik content alanına basıyorum:
    
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📝 Deneme Sınavı Yönetimi</h2>
                <p class="text-muted">Yazı İşleri Müdürü şablonuna uygun otomatik deneme oluşturun.</p>
            </div>
            <button id="btnCreateExam" class="btn btn-primary">⚡ Otomatik Deneme Oluştur</button>
        </div>

        <div id="examWizard" class="card mb-4" style="display:none; border: 2px solid var(--gold-primary);">
            <div class="card-header bg-dark text-white d-flex justify-content-between">
                <h4 class="mb-0">Yeni Deneme Sınavı Oluşturuluyor...</h4>
                <button class="btn btn-sm btn-danger" onclick="document.getElementById('examWizard').style.display='none'">İptal</button>
            </div>
            <div class="card-body">
                <div class="row mb-3">
                    <div class="col-md-6">
                        <label>Deneme Adı</label>
                        <input type="text" id="inpExamTitle" class="form-control" placeholder="Örn: 2025 Genel Deneme - 1">
                    </div>
                    <div class="col-md-3">
                        <label>Süre (Dakika)</label>
                        <input type="number" id="inpDuration" class="form-control" value="120">
                    </div>
                    <div class="col-md-3">
                        <label>Şablon</label>
                        <select class="form-control" disabled><option>Yazı İşleri Müdürü (80 Soru)</option></select>
                    </div>
                </div>

                <div id="generationStatus" class="alert alert-info">
                    Soru havuzu taranıyor...
                </div>

                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-sm table-hover">
                        <thead>
                            <tr>
                                <th style="width:50px">No</th>
                                <th>Konu / Kategori</th>
                                <th>Soru Özeti</th>
                                <th style="width:100px">İşlem</th>
                            </tr>
                        </thead>
                        <tbody id="previewQuestionsBody"></tbody>
                    </table>
                </div>

                <div class="mt-3 text-right">
                    <button id="btnSaveExam" class="btn btn-success" disabled>✅ Denemeyi Yayınla</button>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h4>Yayınlanmış Denemeler</h4>
            </div>
            <div id="examsList" class="p-3">
                Yükleniyor...
            </div>
        </div>
    `;

    document.getElementById('btnCreateExam').addEventListener('click', startExamGeneration);
    document.getElementById('btnSaveExam').addEventListener('click', saveExamToFirestore);
}

// 1. OTOMATİK SORU SEÇİM ALGORİTMASI
async function startExamGeneration() {
    document.getElementById('examWizard').style.display = 'block';
    const statusEl = document.getElementById('generationStatus');
    const tbody = document.getElementById('previewQuestionsBody');
    const saveBtn = document.getElementById('btnSaveExam');
    
    tbody.innerHTML = '';
    generatedQuestionsCache = [];
    saveBtn.disabled = true;
    statusEl.className = 'alert alert-info';
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sorular analiz ediliyor ve seçiliyor...';

    try {
        // Tüm soruları çek (Gerçek hayatta bu kadar veri çekilmez, cloud function daha iyidir ama şimdilik client-side yapıyoruz)
        // Optimizasyon: Sadece aktif soruları çek
        const qSnapshot = await getDocs(query(collection(db, "questions"), where("isActive", "==", true)));
        const allQuestions = [];
        qSnapshot.forEach(doc => allQuestions.push({ id: doc.id, ...doc.data() }));

        if (allQuestions.length < 80) {
            throw new Error(`Yeterli soru yok! Havuzda ${allQuestions.length} soru var, en az 80 gerekli.`);
        }

        let selectedQuestions = [];
        let missingTopics = [];

        // Şablondaki her kural için döngü
        for (const rule of YAZI_ISLERI_SABLON) {
            // Etiketlere (tags) veya kategoriye göre filtrele
            // Not: Soruları yüklerken 'tags' alanına PDF'teki başlıkları veya anahtar kelimeleri eklediğinizi varsayıyoruz.
            // Eğer etiket yoksa kategoriye veya metne bakarız.
            
            const candidates = allQuestions.filter(q => {
                // Soru daha önce seçilmediyse VE (Etiket uyuyorsa VEYA Kategori uyuyorsa)
                const isNotSelected = !selectedQuestions.some(sq => sq.id === q.id);
                
                // Eşleşme kontrolü (Basit metin eşleşmesi)
                const textMatch = rule.tags.some(tag => 
                    (q.category && q.category.toLowerCase().includes(tag)) || 
                    (q.tags && q.tags.some(t => t.includes(tag))) ||
                    (q.legislationRef?.name && q.legislationRef.name.toLowerCase().includes(tag))
                );

                return isNotSelected && textMatch;
            });

            if (candidates.length < rule.count) {
                missingTopics.push(`${rule.title} (İstenen: ${rule.count}, Bulunan: ${candidates.length})`);
                // Eksik de olsa bulduklarını ekle
                candidates.forEach(q => selectedQuestions.push({ ...q, _ruleTitle: rule.title }));
            } else {
                // Rastgele 'count' kadar seç (Fisher-Yates Shuffle benzeri)
                const shuffled = candidates.sort(() => 0.5 - Math.random());
                const selected = shuffled.slice(0, rule.count);
                selected.forEach(q => selectedQuestions.push({ ...q, _ruleTitle: rule.title }));
            }
        }

        // Sonuçları Göster
        generatedQuestionsCache = selectedQuestions;
        renderPreviewTable();

        if (missingTopics.length > 0) {
            statusEl.className = 'alert alert-warning';
            statusEl.innerHTML = `<strong>Dikkat:</strong> Bazı konularda yeterli soru bulunamadı. Toplam ${selectedQuestions.length}/80 soru seçildi.<br><small>Eksikler: ${missingTopics.join(', ')}</small>`;
        } else {
            statusEl.className = 'alert alert-success';
            statusEl.innerHTML = `✅ Mükemmel! 80 soru başarıyla seçildi ve dağılım tam uyumlu.`;
        }
        
        saveBtn.disabled = false;

    } catch (error) {
        console.error(error);
        statusEl.className = 'alert alert-danger';
        statusEl.innerText = 'Hata: ' + error.message;
    }
}

function renderPreviewTable() {
    const tbody = document.getElementById('previewQuestionsBody');
    tbody.innerHTML = '';
    
    generatedQuestionsCache.forEach((q, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><span class="badge secondary">${q._ruleTitle || 'Genel'}</span></td>
            <td><div class="text-truncate" style="max-width: 300px;">${q.text}</div></td>
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="alert('Değiştirme özelliği yakında eklenecek.')">🔄</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 2. DENEMEYİ KAYDET
async function saveExamToFirestore() {
    const title = document.getElementById('inpExamTitle').value;
    const duration = document.getElementById('inpDuration').value;
    const btn = document.getElementById('btnSaveExam');

    if(!title) return alert("Lütfen deneme sınavına bir isim verin.");

    btn.disabled = true;
    btn.innerText = "Kaydediliyor...";

    try {
        const examData = {
            title: title,
            slug: title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, ''),
            duration: parseInt(duration),
            totalQuestions: generatedQuestionsCache.length,
            questionIds: generatedQuestionsCache.map(q => q.id), // Sadece ID'leri tutuyoruz
            questionsSnapshot: generatedQuestionsCache.map(q => ({
    id: q.id,
    text: q.text,
    type: q.type || 'standard', // Soru tipi eklendi
    options: q.options,
    correctOption: q.correctOption,
    // KRİTİK EKLEME: Çözüm ve Öncül verileri
    solution: q.solution || { analiz: "Çözüm yüklenemedi." }, 
    onculler: q.onculler || [],
    questionRoot: q.questionRoot || null,
    category: q._ruleTitle || q.category,
    legislationRef: q.legislationRef || {}
})),
            role: "Yazı İşleri Müdürü",
            isActive: true,
            createdAt: serverTimestamp(),
            stats: { attempts: 0, avgScore: 0 }
        };

        await addDoc(collection(db, "exams"), examData);
        
        alert("Deneme Sınavı Başarıyla Yayınlandı! 🎉");
        document.getElementById('examWizard').style.display = 'none';
        loadExams();

    } catch (error) {
        alert("Hata: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "✅ Denemeyi Yayınla";
    }
}

// 3. MEVCUT DENEMELERİ LİSTELE
async function loadExams() {
    const listEl = document.getElementById('examsList');
    listEl.innerHTML = 'Yükleniyor...';

    try {
        const q = query(collection(db, "exams")); // orderBy eklenebilir
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listEl.innerHTML = '<p class="text-muted">Henüz yayınlanmış bir deneme yok.</p>';
            return;
        }

        listEl.innerHTML = '';
        snapshot.forEach(docSnap => {
            const exam = docSnap.data();
            const div = document.createElement('div');
            div.className = 'card mb-2 p-3';
            div.style.borderLeft = '4px solid var(--accent)';
            div.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h5>${exam.title}</h5>
                        <small class="text-muted">${exam.totalQuestions} Soru | ${exam.duration} Dakika | ${exam.role}</small>
                    </div>
                    <div>
                        <span class="badge ${exam.isActive ? 'success' : 'danger'}">${exam.isActive ? 'Yayında' : 'Pasif'}</span>
                        <button class="btn btn-sm btn-danger ml-2" onclick="window.deleteExamInternal('${docSnap.id}')">Sil</button>
                    </div>
                </div>
            `;
            listEl.appendChild(div);
        });

        // Silme fonksiyonunu window'a bağla
        window.deleteExamInternal = async (id) => {
            if(confirm("Bu denemeyi silmek istediğinize emin misiniz?")) {
                await deleteDoc(doc(db, "exams", id));
                loadExams();
            }
        };

    } catch (error) {
        listEl.innerHTML = `<div class="text-danger">Hata: ${error.message}</div>`;
    }
}