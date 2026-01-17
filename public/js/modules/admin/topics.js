import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let modalElement = null;
let topicForm = null;

export function initTopicsPage() {
    console.log("Konu Yönetimi Modülü Başlatılıyor...");
    renderTopicsInterface();
    loadTopics();
}

function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Konu Yönetimi</h2>
                <p class="text-muted">Sınav konularını, ders notlarını ve medya içeriklerini yönetin.</p>
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
                            <th>Soru Hedefi</th>
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

        <!-- Konu Düzenleme Modalı -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                <div class="modal-header">
                    <h3 id="topicModalTitle">Konu Düzenle</h3>
                    <button id="btnCloseTopicModal" class="close-btn">&times;</button>
                </div>
                
                <form id="topicForm" class="modal-body-scroll">
                    <input type="hidden" id="editTopicId">

                    <div class="row">
                        <div class="col-md-8 form-group">
                            <label>Konu Başlığı</label>
                            <input type="text" id="inpTopicTitle" class="form-control" required>
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
                            <label>Soru Hedefi (Adet)</label>
                            <input type="number" id="inpTopicTarget" class="form-control" value="0">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Açıklama / Notlar</label>
                        <textarea id="inpTopicDesc" class="form-control" rows="3"></textarea>
                    </div>

                    <div class="form-group">
                        <label>İçerik Linkleri (PDF, Video vb.)</label>
                        <div id="contentLinksContainer">
                            <!-- Dinamik link alanları buraya gelecek -->
                        </div>
                        <button type="button" id="btnAddLink" class="btn btn-sm btn-secondary mt-2">+ Link Ekle</button>
                    </div>

                    <div class="form-actions mt-4 text-right">
                        <button type="button" class="btn btn-secondary" onclick="closeTopicModal()">İptal</button>
                        <button type="submit" class="btn btn-success">💾 Kaydet</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    modalElement = document.getElementById('topicModal');
    topicForm = document.getElementById('topicForm');

    document.getElementById('btnNewTopic').addEventListener('click', () => openTopicEditor());
    document.getElementById('btnCloseTopicModal').addEventListener('click', closeTopicModal);
    document.getElementById('btnAddLink').addEventListener('click', addLinkInput);
    topicForm.addEventListener('submit', handleSaveTopic);

    // Global fonksiyonlar
    window.openTopicEditor = openTopicEditor;
    window.closeTopicModal = closeTopicModal;
    window.deleteTopic = deleteTopic;
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
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.order || '-'}</td>
                <td><strong>${data.title}</strong><br><small class="text-muted">${data.description || ''}</small></td>
                <td><span class="badge badge-${data.category}">${data.category === 'ortak' ? 'Ortak' : 'Alan'}</span></td>
                <td>${data.totalQuestionTarget || 0}</td>
                <td>${data.isActive ? '✅ Aktif' : '❌ Pasif'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.openTopicEditor('${docSnap.id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteTopic('${docSnap.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Konular yüklenirken hata:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

async function openTopicEditor(id = null) {
    modalElement.style.display = 'flex';
    topicForm.reset();
    document.getElementById('contentLinksContainer').innerHTML = '';

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

                if (data.contentLinks && Array.isArray(data.contentLinks)) {
                    data.contentLinks.forEach(link => addLinkInput(link));
                }
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

function addLinkInput(data = { title: '', url: '', type: 'pdf' }) {
    const container = document.getElementById('contentLinksContainer');
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-2 align-items-center link-row';
    div.innerHTML = `
        <select class="form-control link-type" style="width: 100px;">
            <option value="pdf" ${data.type === 'pdf' ? 'selected' : ''}>PDF</option>
            <option value="video" ${data.type === 'video' ? 'selected' : ''}>Video</option>
            <option value="podcast" ${data.type === 'podcast' ? 'selected' : ''}>Podcast</option>
        </select>
        <input type="text" class="form-control link-title" placeholder="Başlık" value="${data.title || ''}">
        <input type="text" class="form-control link-url" placeholder="URL (https://...)" value="${data.url || ''}">
        <button type="button" class="btn btn-sm btn-danger remove-link">X</button>
    `;

    div.querySelector('.remove-link').addEventListener('click', () => div.remove());
    container.appendChild(div);
}

async function handleSaveTopic(e) {
    e.preventDefault();
    const id = document.getElementById('editTopicId').value;

    // Linkleri topla
    const links = [];
    document.querySelectorAll('.link-row').forEach(row => {
        links.push({
            type: row.querySelector('.link-type').value,
            title: row.querySelector('.link-title').value,
            url: row.querySelector('.link-url').value
        });
    });

    const data = {
        title: document.getElementById('inpTopicTitle').value,
        order: parseInt(document.getElementById('inpTopicOrder').value),
        category: document.getElementById('inpTopicCategory').value,
        totalQuestionTarget: parseInt(document.getElementById('inpTopicTarget').value),
        description: document.getElementById('inpTopicDesc').value,
        contentLinks: links,
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
        alert("Konu başarıyla kaydedildi.");
    } catch (error) {
        alert("Hata: " + error.message);
    }
}

async function deleteTopic(id) {
    if (confirm("Bu konuyu silmek istediğinize emin misiniz?")) {
        try {
            await deleteDoc(doc(db, "topics", id));
            loadTopics();
        } catch (e) { alert("Silme hatası: " + e.message); }
    }
}
