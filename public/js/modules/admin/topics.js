import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let modalElement = null;
let topicForm = null;
let currentLessons = [];
let currentMaterials = []; // Seçili dersin materyalleri
let activeLessonId = null; // Hangi dersi düzenliyoruz?

export function initTopicsPage() {
    console.log("Profesyonel CMS Başlatılıyor...");
    renderTopicsInterface();
    loadTopics(); // Varsayılan: Tümü
}

function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Dersleri yönetin, içerik ekleyin ve müfredatı düzenleyin.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
                <button id="btnNewTopic" class="btn btn-primary">➕ Yeni Ana Konu</button>
            </div>
        </div>
        
        <!-- Filtreleme ve Arama -->
        <div class="card mb-4 p-3">
            <div class="row align-items-center">
                <div class="col-md-4">
                    <input type="text" id="searchTopic" class="form-control" placeholder="Konu Ara...">
                </div>
                <div class="col-md-3">
                    <select id="filterCategory" class="form-control">
                        <option value="all">Tüm Kategoriler</option>
                        <option value="ortak">Ortak Konular</option>
                        <option value="alan">Alan Konuları</option>
                    </select>
                </div>
                <div class="col-md-5 text-right">
                    <small class="text-muted" id="topicCountBadge">0 Konu Listelendi</small>
                </div>
            </div>
        </div>

        <div class="card mb-4">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>Ders Sayısı</th>
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

        <!-- Konu Düzenleme Modalı (Genişletilmiş) -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 1100px; height: 95vh;">
                <div class="modal-header">
                    <h3 id="topicModalTitle">Konu Düzenle</h3>
                    <button id="btnCloseTopicModal" class="close-btn">&times;</button>
                </div>
                
                <div class="modal-body-scroll" style="display: grid; grid-template-columns: 300px 1fr; gap: 0; padding:0;">
                    
                    <!-- SOL KOLON: Ders Listesi -->
                    <div class="lessons-sidebar" style="border-right: 1px solid var(--border-color); background: var(--bg-body); padding: 20px; overflow-y: auto;">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0">Dersler</h5>
                            <button class="btn btn-sm btn-outline-primary" onclick="addNewLessonUI()">+ Ekle</button>
                        </div>
                        <div id="lessonsListContainer" class="lessons-nav">
                            <!-- Ders listesi buraya -->
                        </div>
                    </div>

                    <!-- SAĞ KOLON: Editör Alanı -->
                    <div class="editor-area" style="padding: 20px; overflow-y: auto;">
                        
                        <!-- Ana Konu Meta Formu (Varsayılan Görünüm) -->
                        <div id="topicMetaPanel">
                            <h4 class="mb-4 border-bottom pb-2">Ana Konu Ayarları</h4>
                            <form id="topicMetaForm">
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
                                        <label>Durum</label>
                                        <select id="inpTopicStatus" class="form-control">
                                            <option value="true">✅ Aktif</option>
                                            <option value="false">❌ Pasif</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Açıklama</label>
                                    <textarea id="inpTopicDesc" class="form-control" rows="3"></textarea>
                                </div>
                                <div class="text-right">
                                    <button type="button" id="btnSaveMeta" class="btn btn-success">💾 Ana Konuyu Kaydet</button>
                                </div>
                            </form>
                        </div>

                        <!-- Ders İçerik Editörü (Ders seçilince görünür) -->
                        <div id="lessonEditorPanel" style="display:none;">
                            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
                                <h4 class="mb-0">Ders İçeriği Düzenle</h4>
                                <div>
                                    <button class="btn btn-sm btn-danger" onclick="deleteCurrentLesson()">🗑️ Dersi Sil</button>
                                    <button class="btn btn-sm btn-success" onclick="saveCurrentLesson()">💾 Dersi Kaydet</button>
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Ders Başlığı</label>
                                <input type="text" id="inpLessonTitle" class="form-control">
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6 form-group">
                                    <label>Sıra No</label>
                                    <input type="number" id="inpLessonOrder" class="form-control">
                                </div>
                                <div class="col-md-6 form-group">
                                    <label>Durum</label>
                                    <select id="inpLessonStatus" class="form-control">
                                        <option value="true">✅ Aktif</option>
                                        <option value="false">❌ Pasif</option>
                                    </select>
                                </div>
                            </div>

                            <hr class="border-subtle my-4">
                            
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <label class="mb-0 font-weight-bold">Materyaller (Çoklu Ekleme)</label>
                                <div class="btn-group">
                                    <button class="btn btn-sm btn-secondary" onclick="addMaterial('pdf')">+ PDF</button>
                                    <button class="btn btn-sm btn-secondary" onclick="addMaterial('video')">+ Video</button>
                                    <button class="btn btn-sm btn-secondary" onclick="addMaterial('podcast')">+ Podcast</button>
                                    <button class="btn btn-sm btn-secondary" onclick="addMaterial('html')">+ Not</button>
                                </div>
                            </div>

                            <div id="materialsList" class="materials-container">
                                <!-- Materyaller buraya -->
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <!-- Çöp Kutusu Modalı -->
        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                <div class="modal-header">
                    <h3>🗑️ Geri Dönüşüm Kutusu</h3>
                    <button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <table class="admin-table">
                        <thead><tr><th>Tür</th><th>Başlık</th><th>Silinme Tarihi</th><th>İşlem</th></tr></thead>
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .lessons-nav .nav-item {
            padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 5px;
            border: 1px solid transparent; transition: all 0.2s;
        }
        .lessons-nav .nav-item:hover { background: var(--bg-hover); }
        .lessons-nav .nav-item.active { background: rgba(212, 175, 55, 0.1); border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
        
        .material-row {
            background: var(--bg-body); border: 1px solid var(--border-color);
            padding: 15px; border-radius: 8px; margin-bottom: 10px;
            display: grid; grid-template-columns: 40px 1fr auto; gap: 15px; align-items: start;
        }
    `;
    document.head.appendChild(style);

    modalElement = document.getElementById('topicModal');
    topicForm = document.getElementById('topicMetaForm');

    // Event Listeners
    document.getElementById('btnNewTopic').addEventListener('click', () => openTopicEditor());
    document.getElementById('btnCloseTopicModal').addEventListener('click', closeTopicModal);
    document.getElementById('btnSaveMeta').addEventListener('click', handleSaveTopicMeta);

    // Arama ve Filtreleme
    document.getElementById('searchTopic').addEventListener('input', filterTopics);
    document.getElementById('filterCategory').addEventListener('change', filterTopics);

    // Global Fonksiyonlar
    window.openTopicEditor = openTopicEditor;
    window.closeTopicModal = closeTopicModal;
    window.softDeleteTopic = softDeleteTopic;
    window.addNewLessonUI = addNewLessonUI;
    window.selectLesson = selectLesson;
    window.saveCurrentLesson = saveCurrentLesson;
    window.deleteCurrentLesson = deleteCurrentLesson;
    window.addMaterial = addMaterial;
    window.removeMaterial = removeMaterial;
    window.openTrashModal = openTrashModal;
    window.restoreItem = restoreItem;
    window.permanentDelete = permanentDelete;
}

// --- LİSTELEME VE FİLTRELEME ---

let allTopicsCache = [];

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    try {
        // Sadece silinmemiş (isActive !== 'deleted') konuları getir
        // Not: Firestore'da 'deleted' statusu kullanacağız
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        allTopicsCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'deleted') {
                allTopicsCache.push({ id: doc.id, ...data });
            }
        });

        filterTopics(); // Listeyi çiz

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

function filterTopics() {
    const search = document.getElementById('searchTopic').value.toLowerCase();
    const category = document.getElementById('filterCategory').value;
    const tbody = document.getElementById('topicsTableBody');
    const badge = document.getElementById('topicCountBadge');

    const filtered = allTopicsCache.filter(t => {
        const matchSearch = t.title.toLowerCase().includes(search);
        const matchCat = category === 'all' || t.category === category;
        return matchSearch && matchCat;
    });

    badge.innerText = `${filtered.length} Konu Listelendi`;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Kayıt bulunamadı.</td></tr>';
        return;
    }

    filtered.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge badge-${t.category}">${t.category === 'ortak' ? 'Ortak' : 'Alan'}</span></td>
            <td>${t.lessonCount || 0} Ders</td>
            <td>${t.isActive ? '✅ Aktif' : '❌ Pasif'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="window.openTopicEditor('${t.id}')">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="window.softDeleteTopic('${t.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- EDİTÖR İŞLEMLERİ ---

async function openTopicEditor(id = null) {
    modalElement.style.display = 'flex';
    topicForm.reset();
    document.getElementById('lessonsListContainer').innerHTML = '';
    document.getElementById('lessonEditorPanel').style.display = 'none';
    document.getElementById('topicMetaPanel').style.display = 'block';

    if (id) {
        document.getElementById('topicModalTitle').innerText = "Konu Düzenle";
        document.getElementById('editTopicId').value = id;

        const topic = allTopicsCache.find(t => t.id === id);
        if (topic) {
            document.getElementById('inpTopicTitle').value = topic.title;
            document.getElementById('inpTopicOrder').value = topic.order;
            document.getElementById('inpTopicCategory').value = topic.category;
            document.getElementById('inpTopicStatus').value = topic.isActive.toString();
            document.getElementById('inpTopicDesc').value = topic.description || '';

            loadLessons(id);
        }
    } else {
        document.getElementById('topicModalTitle').innerText = "Yeni Konu Ekle";
        document.getElementById('editTopicId').value = "";
    }
}

async function handleSaveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const data = {
        title: document.getElementById('inpTopicTitle').value,
        order: parseInt(document.getElementById('inpTopicOrder').value),
        category: document.getElementById('inpTopicCategory').value,
        isActive: document.getElementById('inpTopicStatus').value === 'true',
        description: document.getElementById('inpTopicDesc').value,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "topics", id), data);
        } else {
            data.createdAt = serverTimestamp();
            data.lessonCount = 0;
            data.status = 'active';
            const ref = await addDoc(collection(db, "topics"), data);
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Ana konu kaydedildi.");
        loadTopics();
    } catch (e) { alert("Hata: " + e.message); }
}

// --- DERS YÖNETİMİ ---

async function loadLessons(topicId) {
    const container = document.getElementById('lessonsListContainer');
    container.innerHTML = '<div class="text-center p-2">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    container.innerHTML = '';
    currentLessons = [];

    snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        currentLessons.push(data);

        const div = document.createElement('div');
        div.className = 'nav-item';
        div.innerText = `${data.order}. ${data.title}`;
        div.onclick = () => selectLesson(data.id);
        container.appendChild(div);
    });
}

function selectLesson(lessonId) {
    activeLessonId = lessonId;
    const lesson = currentLessons.find(l => l.id === lessonId);

    // UI Güncelle
    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('lessonEditorPanel').style.display = 'block';

    // Formu Doldur
    document.getElementById('inpLessonTitle').value = lesson.title;
    document.getElementById('inpLessonOrder').value = lesson.order;
    document.getElementById('inpLessonStatus').value = lesson.isActive.toString();

    // Materyalleri Yükle
    currentMaterials = lesson.materials || [];
    renderMaterials();
}

function addNewLessonUI() {
    const topicId = document.getElementById('editTopicId').value;
    if (!topicId) return alert("Önce ana konuyu kaydedin.");

    activeLessonId = null; // Yeni kayıt
    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('lessonEditorPanel').style.display = 'block';

    // Formu Temizle
    document.getElementById('inpLessonTitle').value = "";
    document.getElementById('inpLessonOrder').value = currentLessons.length + 1;
    currentMaterials = [];
    renderMaterials();
}

function addMaterial(type) {
    currentMaterials.push({
        id: Date.now(),
        type: type,
        title: '',
        url: '',
        desc: ''
    });
    renderMaterials();
}

function removeMaterial(id) {
    currentMaterials = currentMaterials.filter(m => m.id !== id);
    renderMaterials();
}

function renderMaterials() {
    const container = document.getElementById('materialsList');
    container.innerHTML = '';

    currentMaterials.forEach(mat => {
        const div = document.createElement('div');
        div.className = 'material-row';

        let icon = '📄';
        if (mat.type === 'video') icon = '▶️';
        if (mat.type === 'podcast') icon = '🎧';
        if (mat.type === 'html') icon = '📝';

        let preview = '';
        if (mat.type === 'video') preview = `<span class="text-primary small">Video Önizleme Aktif</span>`;
        if (mat.type === 'pdf') preview = `<span class="text-danger small">PDF Dosyası</span>`;

        let placeholder = 'URL';
        if (mat.type === 'video') placeholder = 'YouTube Linki (Örn: https://youtu.be/...)';

        div.innerHTML = `
            <div class="mat-icon" style="font-size:1.5rem;">${icon}</div>
            <div class="mat-content d-grid gap-2">
                <div class="d-flex justify-content-between">
                    <input type="text" class="form-control form-control-sm mat-title" placeholder="Başlık" value="${mat.title}">
                    ${preview}
                </div>
                ${mat.type === 'html'
                ? `<textarea class="form-control form-control-sm mat-url" rows="3" placeholder="İçerik...">${mat.url}</textarea>`
                : `<input type="text" class="form-control form-control-sm mat-url" placeholder="${placeholder}" value="${mat.url}">`
            }
            </div>
            <button class="btn btn-sm btn-danger" onclick="removeMaterial(${mat.id})">X</button>
        `;

        // Binding
        div.querySelector('.mat-title').addEventListener('input', (e) => mat.title = e.target.value);
        div.querySelector('.mat-url').addEventListener('input', (e) => mat.url = e.target.value);

        container.appendChild(div);
    });
}

// --- EKSİK OLAN FONKSİYONLAR ---

async function deleteCurrentLesson() {
    if (!activeLessonId) return alert("Silinecek ders seçilmedi.");

    if (confirm("Bu dersi silmek istediğinize emin misiniz?")) {
        const topicId = document.getElementById('editTopicId').value;
        try {
            await deleteDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId));
            alert("Ders silindi.");

            // UI Temizle
            document.getElementById('lessonEditorPanel').style.display = 'none';
            document.getElementById('topicMetaPanel').style.display = 'block';
            activeLessonId = null;

            // Listeyi Yenile
            loadLessons(topicId);
        } catch (e) {
            alert("Silme hatası: " + e.message);
        }
    }
}

async function saveCurrentLesson() {
    const topicId = document.getElementById('editTopicId').value;
    if (!topicId) return alert("Ana konu ID bulunamadı.");

    const data = {
        title: document.getElementById('inpLessonTitle').value,
        order: parseInt(document.getElementById('inpLessonOrder').value) || 0,
        isActive: document.getElementById('inpLessonStatus').value === 'true',
        materials: currentMaterials, // Global değişkenden al
        updatedAt: serverTimestamp()
    };

    try {
        if (activeLessonId) {
            // Güncelleme
            await updateDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId), data);
        } else {
            // Yeni Kayıt
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${topicId}/lessons`), data);
        }
        alert("Ders başarıyla kaydedildi.");
        loadLessons(topicId); // Listeyi yenile
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

// --- ÇÖP KUTUSU (SOFT DELETE) ---

async function softDeleteTopic(id) {
    if (!confirm("Bu konuyu çöp kutusuna taşımak istiyor musunuz?")) return;
    try {
        await updateDoc(doc(db, "topics", id), {
            status: 'deleted',
            deletedAt: serverTimestamp()
        });
        loadTopics();
    } catch (e) { alert("Hata: " + e.message); }
}

async function openTrashModal() {
    const modal = document.getElementById('trashModal');
    const tbody = document.getElementById('trashTableBody');
    modal.style.display = 'flex';
    tbody.innerHTML = '<tr><td colspan="4">Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snapshot = await getDocs(q);

    tbody.innerHTML = '';
    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="4">Çöp kutusu boş.</td></tr>';
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Konu</td>
            <td>${data.title}</td>
            <td>${data.deletedAt ? new Date(data.deletedAt.seconds * 1000).toLocaleDateString() : '-'}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick="window.restoreItem('${doc.id}')">Geri Yükle</button>
                <button class="btn btn-sm btn-danger" onclick="window.permanentDelete('${doc.id}')">Kalıcı Sil</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function restoreItem(id) {
    await updateDoc(doc(db, "topics", id), { status: 'active', deletedAt: null });
    openTrashModal(); // Listeyi yenile
    loadTopics(); // Ana listeyi yenile
}

async function permanentDelete(id) {
    if (confirm("BU İŞLEM GERİ ALINAMAZ! Kalıcı olarak silinsin mi?")) {
        await deleteDoc(doc(db, "topics", id));
        openTrashModal();
    }
}

function closeTopicModal() {
    modalElement.style.display = 'none';
}
