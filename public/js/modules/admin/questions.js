import { db } from "../../firebase-config.js";
import { collection, addDoc, getDocs, doc, deleteDoc, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Bu modül Admin Paneli > Soru Bankası sekmesini yönetir.

export function initQuestionsPage() {
    renderInterface();
    loadQuestions();
}

function renderInterface() {
    const container = document.getElementById('section-questions');
    if(!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Soru Bankası</h2>
                <p class="text-muted">Sisteme yüklü tüm soruları buradan yönetin.</p>
            </div>
            <div class="btn-group">
                <button class="btn btn-primary" onclick="window.toggleBulkImport()">📥 Toplu Yükle (JSON)</button>
            </div>
        </div>

        <div id="bulkImportArea" class="card p-4 mb-4 border-primary" style="display:none; background:#f8f9fa;">
            <h5>📦 JSON Formatında Soru Yükle</h5>
            <p class="small text-muted">Aşağıdaki alana hazırladığınız JSON verisini yapıştırın. "dayanak", "analiz", "tuzak", "hap" alanlarını içerebilir.</p>
            <textarea id="jsonInput" class="form-control" rows="8" style="font-family:monospace; font-size:0.9rem;" placeholder='[
  {
    "text": "Soru metni...",
    "category": "CMK",
    "options": [{"id":"A", "text":"Şık A"}],
    "correctAnswer": "A",
    "solution": {
       "analiz": "Detaylı açıklama...",
       "tuzak": "Dikkat edilmesi gereken...",
       "hap": "Özet bilgi..."
    }
  }
]'></textarea>
            <div class="mt-3 text-right">
                <button class="btn btn-secondary" onclick="window.toggleBulkImport()">İptal</button>
                <button class="btn btn-success" onclick="window.processBulkImport()">🚀 Veritabanına Yükle</button>
            </div>
        </div>

        <div class="card">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Kategori</th>
                            <th>Soru Metni (Özet)</th>
                            <th>Tip</th>
                            <th>İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="questionsTableBody">
                        <tr><td colspan="4" class="text-center">Yükleniyor...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadQuestions() {
    const tbody = document.getElementById('questionsTableBody');
    if(!tbody) return;

    try {
        // En son eklenen 50 soruyu getir
        const q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(50));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Hiç soru bulunamadı. Yukarıdan ekleyin.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const textSummary = data.text ? data.text.substring(0, 60) + "..." : "(Metin yok)";
            const typeLabel = data.type === 'oncullu' ? '<span class="badge warning">Öncüllü</span>' : '<span class="badge">Standart</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.category || '-'}</td>
                <td>${textSummary}</td>
                <td>${typeLabel}</td>
                <td>
                    <button class="btn-icon delete-btn" onclick="window.deleteQuestion('${docSnap.id}')" title="Sil">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

// GLOBAL FONKSİYONLAR
window.toggleBulkImport = () => {
    const el = document.getElementById('bulkImportArea');
    if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.processBulkImport = async () => {
    const jsonText = document.getElementById('jsonInput').value;
    if(!jsonText) return alert("Lütfen JSON verisi girin.");

    try {
        const questions = JSON.parse(jsonText);
        if(!Array.isArray(questions)) throw new Error("Veri bir liste [...] formatında olmalıdır.");

        if(!confirm(`${questions.length} adet soru yüklenecek. Onaylıyor musunuz?`)) return;

        // Tek tek ekleyelim (Batch de kullanılabilir ama şimdilik basit olsun)
        let count = 0;
        for (const q of questions) {
            await addDoc(collection(db, "questions"), {
                ...q,
                createdAt: serverTimestamp(),
                isActive: true
            });
            count++;
        }

        alert(`✅ ${count} soru başarıyla eklendi!`);
        document.getElementById('jsonInput').value = '';
        window.toggleBulkImport();
        loadQuestions(); // Listeyi yenile

    } catch (e) {
        alert("JSON Hatası: " + e.message);
    }
};

window.deleteQuestion = async (id) => {
    if(confirm("Bu soruyu silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "questions", id));
        loadQuestions();
    }
};