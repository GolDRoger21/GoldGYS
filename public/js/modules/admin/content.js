// Dosya: public/js/modules/admin/content.js

import { db } from "../../firebase-config.js";
import { 
    collection, getDocs, addDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global Değişkenler
let currentTopicId = null;
let currentSubTopicId = null;

export function initContentPage() {
    console.log("İçerik Yönetimi Başlatıldı (PDF, Video, HTML, Test)");
    renderContentInterface();
    loadTopicsForSelect();
}

// 1. ARAYÜZ OLUŞTURMA
function renderContentInterface() {
    const container = document.getElementById('section-content'); // Admin panelindeki ilgili div
    if(!container) return;

    container.innerHTML = `
        <div class="card p-4 shadow-sm">
            <h2 class="mb-4">📚 Ders İçeriği Yönetimi</h2>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <label>Ana Konu Seçin:</label>
                    <select id="selectTopic" class="form-control">
                        <option value="">-- Konu Seçiniz --</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label>Alt Başlık Seçin:</label>
                    <select id="selectSubTopic" class="form-control" disabled>
                        <option value="">-- Önce Ana Konu Seçin --</option>
                    </select>
                </div>
            </div>

            <div id="actionButtons" style="display:none;" class="mb-4 p-3 bg-light border rounded">
                <h5 class="mb-3">➕ Bu Konuya Ne Eklemek İstersiniz?</h5>
                <div class="btn-group flex-wrap gap-2">
                    <button class="btn btn-outline-primary" onclick="window.showAddModal('video')">🎥 Video</button>
                    <button class="btn btn-outline-danger" onclick="window.showAddModal('pdf')">📄 PDF Doküman</button>
                    <button class="btn btn-outline-success" onclick="window.showAddModal('html')">📝 HTML Ders Notu</button>
                    <button class="btn btn-outline-warning" onclick="window.showAddModal('podcast')">🎧 Podcast</button>
                    <button class="btn btn-outline-dark" onclick="window.showAddModal('quiz')">✅ Test / Deneme</button>
                </div>
            </div>

            <div id="contentsList" class="list-group">
                <div class="text-center text-muted p-5">İçerikleri görmek için yukarıdan konu seçiniz.</div>
            </div>
        </div>

        <div id="contentModal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000;">
            <div class="modal-dialog" style="max-width:600px; margin:50px auto; background:white; padding:20px; border-radius:10px;">
                <div class="modal-content">
                    <div class="modal-header d-flex justify-content-between">
                        <h5 id="modalTitle">İçerik Ekle</h5>
                        <button type="button" class="btn-close" onclick="document.getElementById('contentModal').style.display='none'">X</button>
                    </div>
                    <div class="modal-body mt-3">
                        <input type="hidden" id="inpContentType">
                        
                        <div class="mb-3">
                            <label>Başlık (Öğrenci bunu görecek)</label>
                            <input type="text" id="inpTitle" class="form-control" placeholder="Örn: Ders 1 - Giriş">
                        </div>

                        <div class="mb-3">
                            <label>Sıra No</label>
                            <input type="number" id="inpOrder" class="form-control" value="1">
                        </div>

                        <div id="dynamicFields"></div>

                        <button onclick="window.saveContent()" class="btn btn-success w-100 mt-3">Kaydet</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('selectTopic').addEventListener('change', handleTopicChange);
    document.getElementById('selectSubTopic').addEventListener('change', loadContents);
}

// 2. VERİ YÖNETİMİ
async function loadTopicsForSelect() {
    const select = document.getElementById('selectTopic');
    const q = query(collection(db, "topics"), orderBy("order"));
    const snapshot = await getDocs(q);
    
    // Global window nesnesine konuları sakla (Alt başlıkları bulmak için)
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
        loadContents(); // Ana konu seçilince de içerikleri getir
    }
}

async function loadContents() {
    if (!currentTopicId) return;
    
    currentSubTopicId = document.getElementById('selectSubTopic').value;
    const listDiv = document.getElementById('contentsList');
    listDiv.innerHTML = 'Yükleniyor...';

    // Sorgu oluştur: Konuya göre filtrele, sıraya göre diz
    let constraints = [
        where("topicId", "==", currentTopicId),
        orderBy("order")
    ];

    // Eğer alt başlık seçiliyse onu da filtreye ekle
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
                'video': 'primary', 'pdf': 'danger', 'html': 'success', 'quiz': 'dark', 'podcast': 'warning'
            }[item.type] || 'secondary';

            const div = document.createElement('div');
            div.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            div.innerHTML = `
                <div>
                    <span class="badge bg-${badgeColor} me-2">${item.type.toUpperCase()}</span>
                    <strong>${item.order}. ${item.title}</strong>
                    <br><small class="text-muted">${item.subTopicId || 'Genel'}</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="window.deleteContent('${doc.id}')">Sil</button>
            `;
            listDiv.appendChild(div);
        });
    } catch (error) {
        // İndex hatası olursa konsola yaz (Firebase bazen composite index ister)
        console.error(error);
        if(error.message.includes("index")) {
            listDiv.innerHTML = `<div class="alert alert-danger">Veritabanı indeksi oluşturuluyor... Lütfen biraz bekleyip sayfayı yenileyin.<br>Hata: ${error.message}</div>`;
        } else {
            listDiv.innerHTML = `<div class="alert alert-danger">Hata: ${error.message}</div>`;
        }
    }
}

// 3. EKLEME İŞLEMLERİ (MODAL YÖNETİMİ)
window.showAddModal = (type) => {
    document.getElementById('contentModal').style.display = 'flex';
    document.getElementById('inpContentType').value = type;
    document.getElementById('modalTitle').innerText = `Yeni ${type.toUpperCase()} Ekle`;
    
    const container = document.getElementById('dynamicFields');
    container.innerHTML = '';

    // Türe göre inputları değiştir
    if(type === 'video') {
        container.innerHTML = `
            <label>Video URL / Embed Kodu</label>
            <input type="text" id="inpData1" class="form-control" placeholder="https://youtube.com/...">
        `;
    } else if(type === 'html') {
        container.innerHTML = `
            <label>HTML İçerik (Ders Notları)</label>
            <textarea id="inpData1" class="form-control" rows="10" placeholder="<h1>Başlık</h1><p>İçerik...</p>"></textarea>
            <small class="text-muted">Buraya HTML kodlarınızı yapıştırın.</small>
        `;
    } else if(type === 'pdf') {
        container.innerHTML = `
            <label>PDF Linki (Storage URL)</label>
            <input type="text" id="inpData1" class="form-control" placeholder="https://firebasestorage...">
        `;
    } else if(type === 'quiz') {
        container.innerHTML = `
            <label>Test ID (Exams Koleksiyonundaki ID)</label>
            <input type="text" id="inpData1" class="form-control" placeholder="Test ID'sini yapıştırın">
            <label class="mt-2">Soru Sayısı</label>
            <input type="number" id="inpData2" class="form-control" value="10">
        `;
    }
};

window.saveContent = async () => {
    const type = document.getElementById('inpContentType').value;
    const title = document.getElementById('inpTitle').value;
    const order = Number(document.getElementById('inpOrder').value);
    const data1 = document.getElementById('inpData1').value;
    
    if(!title || !data1) return alert("Lütfen zorunlu alanları doldurun!");

    let contentData = {};
    if(type === 'html') contentData = { content: data1 };
    else if(type === 'video' || type === 'pdf' || type === 'podcast') contentData = { url: data1 };
    else if(type === 'quiz') contentData = { examId: data1, questionCount: document.getElementById('inpData2').value };

    try {
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
        alert("İçerik başarıyla eklendi!");
    } catch (e) {
        alert("Hata: " + e.message);
    }
};

window.deleteContent = async (id) => {
    if(confirm("Bu içeriği silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "contents", id));
        loadContents();
    }
};
