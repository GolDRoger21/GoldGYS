import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let modalElement = null;
let topicForm = null;
let contentMaterials = []; // Materyalleri hafızada tutmak için

export function initTopicsPage() {
    console.log("Gelişmiş Konu Yönetimi Başlatılıyor...");
    renderTopicsInterface();
    loadTopics();
}

function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Konu ve İçerik Yönetimi</h2>
                <p class="text-muted">Ders notları, videolar ve podcast'leri buradan yönetin.</p>
            </div>
            <button id="btnNewTopic" class="btn btn-primary">➕ Yeni Konu Ekle</button>
        </div>
        
        <div class="card mb-4">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>İçerik Sayısı</th>
                            <th>Durum</th>
                            <th>İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody">
                        <tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Gelişmiş Konu Modal -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3 id="topicModalTitle">Konu Düzenle</h3>
                    <button id="btnCloseTopicModal" class="close-btn">&times;</button>
                </div>
                
                <form id="topicForm" class="modal-body-scroll">
                    <input type="hidden" id="editTopicId">

                    <!-- Temel Bilgiler -->
                    <div class="row">
                        <div class="col-md-8 form-group">
                            <label>Konu Başlığı</label>
                            <input type="text" id="inpTopicTitle" class="form-control" placeholder="Örn: Anayasa Hukuku" required>
                        </div>
                        <div class="col-md-4 form-group">
                            <label>Sıra No</label>
                            <input type="number" id="inpTopicOrder" class="form-control" required>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6 form-group">
                            <label>Kategori</label>
                            <select id="inpTopicCategory" class="form-control">
                                <option value="ortak">Ortak Konular</option>
                                <option value="alan">Alan Konuları</option>
                            </select>
                        </div>
                        <div class="col-md-6 form-group">
                            <label>Soru Hedefi</label>
                            <input type="number" id="inpTopicTarget" class="form-control" value="0">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Kısa Açıklama (Özet)</label>
                        <textarea id="inpTopicDesc" class="form-control" rows="2" placeholder="Konu hakkında kısa bilgi..."></textarea>
                    </div>

                    <hr class="border-subtle my-4">

                    <!-- İçerik Yönetimi (Materyaller) -->
                    <div class="form-group">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <label class="mb-0" style="font-size:1.1rem; color:var(--color-primary);">📂 Ders Materyalleri</label>
                            <div class="btn-group">
                                <button type="button" class="btn btn-sm btn-secondary" onclick="addMaterialInput('pdf')">📄 PDF</button>
                                <button type="button" class="btn btn-sm btn-secondary" onclick="addMaterialInput('video')">▶️ Video</button>
                                <button type="button" class="btn btn-sm btn-secondary" onclick="addMaterialInput('podcast')">🎧 Podcast</button>
                                <button type="button" class="btn btn-sm btn-secondary" onclick="addMaterialInput('html')">📝 Not</button>
                            </div>
                        </div>
                        
                        <div id="materialsContainer" class="materials-list">
                            <!-- Dinamik materyaller buraya gelecek -->
                            <div class="text-center text-muted p-3 border rounded bg-hover" id="emptyMaterialsMsg">
                                Henüz materyal eklenmemiş. Yukarıdaki butonları kullanın.
                            </div>
                        </div>
                    </div>

                    <div class="form-actions mt-4 text-right sticky-bottom bg-surface pt-3 border-top">
                        <button type="button" class="btn btn-secondary" onclick="closeTopicModal()">İptal</button>
                        <button type="submit" class="btn btn-success">💾 Kaydet ve Yayınla</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // CSS Ekleme (Dinamik)
    const style = document.createElement('style');
    style.innerHTML = `
        .material-item {
            background: var(--bg-body);
            border: 1px solid var(--border-color);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 10px;
            display: grid;
            grid-template-columns: 40px 1fr auto;
            gap: 15px;
            align-items: start;
            animation: fadeIn 0.3s ease;
        }
        .mat-icon { font-size: 1.5rem; display: flex; align-items: center; justify-content: center; height: 100%; }
        .mat-content { display: grid; gap: 8px; }
        .mat-actions { display: flex; gap: 5px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);

    modalElement = document.getElementById('topicModal');
    topicForm = document.getElementById('topicForm');

    document.getElementById('btnNewTopic').addEventListener('click', () => openTopicEditor());
    document.getElementById('btnCloseTopicModal').addEventListener('click', closeTopicModal);
    topicForm.addEventListener('submit', handleSaveTopic);

    // Global fonksiyonlar
    window.openTopicEditor = openTopicEditor;
    window.closeTopicModal = closeTopicModal;
    window.deleteTopic = deleteTopic;
    window.addMaterialInput = addMaterialInput;
    window.removeMaterial = removeMaterial;
}

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    if (!tbody) return;

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Henüz konu eklenmemiş.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const matCount = data.materials ? data.materials.length : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.order || '-'}</td>
                <td><strong>${data.title}</strong></td>
                <td><span class="badge badge-${data.category}">${data.category === 'ortak' ? 'Ortak' : 'Alan'}</span></td>
                <td>${matCount} Materyal</td>
                <td>${data.isActive ? '✅ Aktif' : '❌ Pasif'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.openTopicEditor('${docSnap.id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteTopic('${docSnap.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Hata:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

async function openTopicEditor(id = null) {
    modalElement.style.display = 'flex';
    topicForm.reset();
    contentMaterials = [];
    renderMaterials();

    if (id) {
        document.getElementById('topicModalTitle').innerText = "Konu Düzenle";
        document.getElementById('editTopicId').value = id;

        try {
            const docSnap = await getDoc(doc(db, "topics", id));
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('inpTopicTitle').value = data.title;
                document.getElementById('inpTopicOrder').value = data.order;
                document.getElementById('inpTopicCategory').value = data.category;
                document.getElementById('inpTopicTarget').value = data.totalQuestionTarget;
                document.getElementById('inpTopicDesc').value = data.description || '';

                // Eski 'contentLinks' yapısını yeni 'materials' yapısına dönüştür (Geriye dönük uyumluluk)
                if (data.materials) {
                    contentMaterials = data.materials;
                } else if (data.contentLinks) {
                    contentMaterials = data.contentLinks.map(l => ({
                        id: Date.now() + Math.random(),
                        type: l.type,
                        title: l.title,
                        url: l.url,
                        desc: ''
                    }));
                }
                renderMaterials();
            }
        } catch (e) { console.error(e); }
    } else {
        document.getElementById('topicModalTitle').innerText = "Yeni Konu Ekle";
        document.getElementById('editTopicId').value = "";
    }
}

function closeTopicModal() {
    modalElement.style.display = 'none';
}

function addMaterialInput(type) {
    const newMat = {
        id: Date.now(),
        type: type,
        title: '',
        url: '', // Video/PDF için URL, HTML için içerik
        desc: ''
    };
    contentMaterials.push(newMat);
    renderMaterials();
}

function removeMaterial(id) {
    contentMaterials = contentMaterials.filter(m => m.id != id);
    renderMaterials();
}

function renderMaterials() {
    const container = document.getElementById('materialsContainer');
    const emptyMsg = document.getElementById('emptyMaterialsMsg');

    if (contentMaterials.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyMsg);
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';
    container.innerHTML = ''; // Temizle ve yeniden çiz (State yönetimi)

    contentMaterials.forEach((mat, index) => {
        const div = document.createElement('div');
        div.className = 'material-item';

        let icon = '📄';
        let placeholder = 'PDF Linki (Drive/Storage)';
        if (mat.type === 'video') { icon = '▶️'; placeholder = 'Video Embed Linki (YouTube)'; }
        if (mat.type === 'podcast') { icon = '🎧'; placeholder = 'Ses Dosyası Linki'; }
        if (mat.type === 'html') { icon = '📝'; placeholder = 'HTML İçerik / Not'; }

        div.innerHTML = `
            <div class="mat-icon">${icon}</div>
            <div class="mat-content">
                <input type="text" class="form-control form-control-sm mat-title" placeholder="Başlık (Örn: Ders Notu 1)" value="${mat.title}">
                ${mat.type === 'html'
                ? `<textarea class="form-control form-control-sm mat-url" rows="3" placeholder="İçerik metni buraya...">${mat.url}</textarea>`
                : `<input type="text" class="form-control form-control-sm mat-url" placeholder="${placeholder}" value="${mat.url}">`
            }
                <input type="text" class="form-control form-control-sm mat-desc" placeholder="Kısa açıklama (Opsiyonel)" value="${mat.desc || ''}">
            </div>
            <div class="mat-actions">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeMaterial(${mat.id})">🗑️</button>
            </div>
        `;

        // Input değişikliklerini state'e yansıt
        div.querySelector('.mat-title').addEventListener('input', (e) => mat.title = e.target.value);
        div.querySelector('.mat-url').addEventListener('input', (e) => mat.url = e.target.value);
        div.querySelector('.mat-desc').addEventListener('input', (e) => mat.desc = e.target.value);

        container.appendChild(div);
    });
}

async function handleSaveTopic(e) {
    e.preventDefault();
    const id = document.getElementById('editTopicId').value;

    const data = {
        title: document.getElementById('inpTopicTitle').value,
        order: parseInt(document.getElementById('inpTopicOrder').value),
        category: document.getElementById('inpTopicCategory').value,
        totalQuestionTarget: parseInt(document.getElementById('inpTopicTarget').value),
        description: document.getElementById('inpTopicDesc').value,
        materials: contentMaterials, // Yeni yapı
        isActive: true,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "topics", id), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "topics"), data);
        }
        closeTopicModal();
        loadTopics();
        alert("Konu ve materyaller başarıyla kaydedildi.");
    } catch (error) {
        alert("Hata: " + error.message);
    }
}

async function deleteTopic(id) {
    if (confirm("Bu konuyu ve tüm materyallerini silmek istediğinize emin misiniz?")) {
        try {
            await deleteDoc(doc(db, "topics", id));
            loadTopics();
        } catch (e) { alert("Silme hatası: " + e.message); }
    }
}
