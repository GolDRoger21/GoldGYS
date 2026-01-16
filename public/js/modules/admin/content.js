// Dosya: public/js/modules/admin/content.js

import { db } from "../../firebase-config.js";
import { 
    collection, getDocs, addDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global Değişkenler
let currentTopicId = null;
let currentSubTopicId = null;

export function initContentPage() {
    console.log("İçerik Yönetimi Başlatıldı (Entegre Test Sistemi)");
    renderContentInterface();
    loadTopicsForSelect();
}

// 1. ARAYÜZ OLUŞTURMA
function renderContentInterface() {
    const container = document.getElementById('section-content'); 
    if(!container) return;

    container.innerHTML = `
        <div class="card p-4 shadow-sm">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2 class="mb-0">📚 Ders İçeriği Yönetimi</h2>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <label class="form-label fw-bold">Ana Konu Seçin:</label>
                    <select id="selectTopic" class="form-control form-select-lg">
                        <option value="">-- Konu Seçiniz --</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label class="form-label fw-bold">Alt Başlık Seçin:</label>
                    <select id="selectSubTopic" class="form-control form-select-lg" disabled>
                        <option value="">-- Önce Ana Konu Seçin --</option>
                    </select>
                </div>
            </div>

            <div id="actionButtons" style="display:none;" class="mb-4 p-3 bg-white border rounded shadow-sm">
                <h5 class="mb-3 text-primary">➕ Bu Konuya Ne Eklemek İstersiniz?</h5>
                <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-outline-primary" onclick="window.showAddModal('video')">
                        <i class="bi bi-camera-video"></i> Video Ders
                    </button>
                    <button class="btn btn-outline-danger" onclick="window.showAddModal('pdf')">
                        <i class="bi bi-file-pdf"></i> PDF Doküman
                    </button>
                    <button class="btn btn-outline-success" onclick="window.showAddModal('html')">
                        <i class="bi bi-code-slash"></i> HTML Ders Notu
                    </button>
                    <button class="btn btn-outline-dark" onclick="window.showAddModal('quiz')">
                        <i class="bi bi-check2-square"></i> <b>Konu Tarama Testi</b>
                    </button>
                </div>
            </div>

            <div id="contentsList" class="list-group">
                <div class="text-center text-muted p-5 bg-light rounded">
                    İçerikleri görmek ve düzenlemek için yukarıdan bir konu seçiniz.
                </div>
            </div>
        </div>

        <div id="contentModal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; align-items:center; justify-content:center;">
            <div class="modal-dialog bg-white rounded shadow-lg" style="width:90%; max-width:800px; max-height:90vh; overflow-y:auto; padding:25px;">
                <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                    <h4 id="modalTitle" class="mb-0">İçerik Ekle</h4>
                    <button type="button" class="btn-close" onclick="document.getElementById('contentModal').style.display='none'">X</button>
                </div>
                
                <div class="modal-body">
                    <input type="hidden" id="inpContentType">
                    
                    <div class="mb-3">
                        <label class="form-label fw-bold">Başlık (Öğrenci bunu görecek)</label>
                        <input type="text" id="inpTitle" class="form-control" placeholder="Örn: Ders 1 - Giriş">
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Sıra No</label>
                        <input type="number" id="inpOrder" class="form-control" value="1" style="max-width:100px;">
                    </div>

                    <div id="dynamicFields" class="mb-3 p-3 bg-light rounded border"></div>

                    <div class="d-grid gap-2">
                        <button onclick="window.saveContent()" class="btn btn-success btn-lg">Kaydet ve Yayınla</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('selectTopic').addEventListener('change', handleTopicChange);
    document.getElementById('selectSubTopic').addEventListener('change', loadContents);
}

// 2. VERİ YÖNETİMİ (Konuları Çekme)
async function loadTopicsForSelect() {
    const select = document.getElementById('selectTopic');
    const q = query(collection(db, "topics"), orderBy("order"));
    const snapshot = await getDocs(q);
    
    window.allTopicsData = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        window.allTopicsData.push({ id: doc.id, ...data });
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.innerText = `${data.title} (${data.category === 'ortak' ? 'Ortak' : 'Alan'})`;
        select.appendChild(opt);
    });
}

function handleTopicChange(e) {
    const topicId = e.target.value;
    currentTopicId = topicId;
    
    const subSelect = document.getElementById('selectSubTopic');
    subSelect.innerHTML = '<option value="">-- Tümü --</option>';
    subSelect.disabled = !topicId;
    
    document.getElementById('actionButtons').style.display = topicId ? 'block' : 'none';

    if (topicId) {
        const topicData = window.allTopicsData.find(t => t.id === topicId);
        if (topicData && topicData.subTopics) {
            topicData.subTopics.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub.id;
                opt.innerText = sub.title;
                subSelect.appendChild(opt);
            });
        }
        loadContents();
    }
}

// 3. İÇERİKLERİ LİSTELEME
async function loadContents() {
    if (!currentTopicId) return;
    
    currentSubTopicId = document.getElementById('selectSubTopic').value;
    const listDiv = document.getElementById('contentsList');
    listDiv.innerHTML = '<div class="text-center p-3">Yükleniyor...</div>';

    let constraints = [
        where("topicId", "==", currentTopicId),
        orderBy("order")
    ];

    if (currentSubTopicId) {
        constraints.splice(1, 0, where("subTopicId", "==", currentSubTopicId));
    }

    try {
        const q = query(collection(db, "contents"), ...constraints);
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listDiv.innerHTML = '<div class="alert alert-warning">Bu konuda henüz içerik yok.</div>';
            return;
        }

        listDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            const badgeColor = {
                'video': 'primary', 'pdf': 'danger', 'html': 'success', 'quiz': 'dark'
            }[item.type] || 'secondary';

            const typeLabel = item.type === 'quiz' ? 'TEST' : item.type.toUpperCase();

            const div = document.createElement('div');
            div.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center mb-2 shadow-sm border rounded';
            div.innerHTML = `
                <div class="d-flex align-items-center">
                    <span class="badge bg-${badgeColor} me-3 p-2">${typeLabel}</span>
                    <div>
                        <h5 class="mb-0">${item.order}. ${item.title}</h5>
                        <small class="text-muted">${item.subTopicId ? 'Alt Başlık: ' + item.subTopicId : 'Genel'}</small>
                        ${item.type === 'quiz' ? `<br><small class="text-success">Soru Sayısı: ${item.data.questionCount || 0}</small>` : ''}
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.deleteContent('${doc.id}')">Sil</button>
                </div>
            `;
            listDiv.appendChild(div);
        });
    } catch (error) {
        console.error(error);
        listDiv.innerHTML = `<div class="alert alert-danger">Hata: ${error.message} (Index gerekebilir)</div>`;
    }
}

// 4. MODAL VE EKLEME MANTIĞI
window.showAddModal = (type) => {
    const modal = document.getElementById('contentModal');
    modal.style.display = 'flex';
    document.getElementById('inpContentType').value = type;
    document.getElementById('modalTitle').innerText = `Yeni ${type === 'quiz' ? 'Test' : type.toUpperCase()} Ekle`;
    
    const container = document.getElementById('dynamicFields');
    container.innerHTML = '';

    if(type === 'video') {
        container.innerHTML = `
            <label class="form-label">Video URL / Embed Kodu</label>
            <input type="text" id="inpData1" class="form-control" placeholder="https://youtube.com/...">
            <small class="text-muted">Youtube embed linkini yapıştırın.</small>
        `;
    } else if(type === 'html') {
        container.innerHTML = `
            <label class="form-label">HTML İçerik (Ders Notları)</label>
            <textarea id="inpData1" class="form-control font-monospace" rows="10" placeholder="<h1>Başlık</h1><p>İçerik...</p>"></textarea>
        `;
    } else if(type === 'pdf') {
        container.innerHTML = `
            <label class="form-label">PDF Linki (Storage URL)</label>
            <input type="text" id="inpData1" class="form-control" placeholder="https://firebasestorage...">
        `;
    } else if(type === 'quiz') {
        // İŞTE BURASI SENİN İSTEDİĞİN YER: JSON İLE TEST EKLEME
        container.innerHTML = `
            <div class="alert alert-info border-info">
                <strong>📝 Nasıl Çalışır?</strong><br>
                Aşağıya hazırladığınız soruları JSON formatında yapıştırın. Sistem bu soruları:
                <ol class="mb-0 ps-3">
                    <li>Soru Bankasına tek tek ekler.</li>
                    <li>Bir sınav paketi oluşturur.</li>
                    <li>Bu konunun altına test olarak ekler.</li>
                </ol>
            </div>
            <label class="form-label fw-bold">Soru Listesi (JSON)</label>
            <textarea id="inpData1" class="form-control font-monospace" rows="12" placeholder='[
  {
    "text": "Soru metni...",
    "options": {"A":"...", "B":"..."},
    "correct": "A",
    "solution": "Çözüm..."
  }
]'></textarea>
        `;
    }
};

window.saveContent = async () => {
    const type = document.getElementById('inpContentType').value;
    const title = document.getElementById('inpTitle').value;
    const order = Number(document.getElementById('inpOrder').value);
    const dataInput = document.getElementById('inpData1').value;
    
    if(!title || !dataInput) return alert("Lütfen zorunlu alanları doldurun!");

    const btn = document.querySelector('#contentModal .btn-success');
    const originalBtnText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "⏳ İşleniyor...";

    try {
        let contentData = {};

        // 1. VİDEO, PDF, HTML İSE BASİT EKLEME
        if(type === 'html') contentData = { content: dataInput };
        else if(type === 'video' || type === 'pdf') contentData = { url: dataInput };
        
        // 2. TEST (QUIZ) İSE KARMAŞIK İŞLEM
        else if(type === 'quiz') {
            try {
                const questions = JSON.parse(dataInput);
                if(!Array.isArray(questions)) throw new Error("JSON formatı hatalı: Bir liste [...] olmalı.");

                // A) Soruları 'questions' koleksiyonuna (Soru Bankasına) ekle
                const batch = writeBatch(db);
                // Not: Soruları tek tek ekleyip ID'lerini topluyoruz (Batch ile)
                // Firestore batch limiti 500'dür.
                
                // Hızlı işlem için soruları olduğu gibi pakete gömeceğiz (Denormalization)
                // Ama aynı zamanda soru bankasında da olsun istiyoruz.
                
                // Soruları bankaya ekle (Promise.all ile paralel)
                const questionPromises = questions.map(q => {
                    return addDoc(collection(db, "questions"), {
                        ...q,
                        topicId: currentTopicId, // Hangi konudan geldiğini bilelim
                        createdAt: serverTimestamp(),
                        isActive: true
                    });
                });

                await Promise.all(questionPromises); // Hepsinin bankaya girmesini bekle

                // B) Soruları bir paket (Quiz) olarak kaydet
                const quizRef = await addDoc(collection(db, "quizzes"), {
                    title: title,
                    questions: questions, // Soruları paketin içine gömüyoruz (Performans için)
                    createdAt: serverTimestamp(),
                    type: "subject_test"
                });

                // C) Quiz'i Content'e bağla
                contentData = { 
                    quizId: quizRef.id, 
                    questionCount: questions.length 
                };

            } catch (jsonErr) {
                throw new Error("JSON Hatası: " + jsonErr.message);
            }
        }

        // 3. NİHAİ 'CONTENTS' KAYDI (Konuya Bağlama)
        await addDoc(collection(db, "contents"), {
            topicId: currentTopicId,
            subTopicId: document.getElementById('selectSubTopic').value || null,
            type,
            title,
            data: contentData,
            order,
            createdAt: serverTimestamp()
        });
        
        document.getElementById('contentModal').style.display = 'none';
        loadContents();
        alert("✅ Başarıyla Eklendi!");

    } catch (e) {
        alert("Hata: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalBtnText;
    }
};

window.deleteContent = async (id) => {
    if(confirm("Bu içeriği silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "contents", id));
        loadContents();
    }
};