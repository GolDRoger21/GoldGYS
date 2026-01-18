import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- GLOBAL DEĞİŞKENLER ---
let modalElement = null;
let currentContents = []; // Dersler ve Testler
let activeContentId = null; // Düzenlenen içerik ID'si
let selectedQuestions = []; // O anki testin soruları
let currentMaterials = []; // O anki dersin materyalleri
let allTopicsCache = []; // Konu listesi cache

export function initTopicsPage() {
    renderTopicsInterface();
    loadTopics();
}

// --- ARAYÜZ (HTML) ---
function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Eğitim materyallerini, testleri ve konu yapılarını buradan yönetin.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-warning text-dark" onclick="window.openTrashModal()">
                    <span class="material-icons align-middle" style="font-size:18px;">delete</span> Çöp Kutusu
                </button>
                <button id="btnNewTopic" class="btn btn-primary">
                    <span class="material-icons align-middle" style="font-size:18px;">add</span> Yeni Ana Konu
                </button>
            </div>
        </div>
        
        <!-- Filtreleme -->
        <div class="card mb-4 border-0 shadow-sm">
            <div class="card-body">
                <div class="row align-items-center g-3">
                    <div class="col-md-4">
                        <div class="input-group">
                            <span class="input-group-text bg-white border-end-0"><span class="material-icons text-muted">search</span></span>
                            <input type="text" id="searchTopic" class="form-control border-start-0" placeholder="Konu başlığı ara...">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <select id="filterCategory" class="form-select">
                            <option value="all">Tüm Kategoriler</option>
                            <option value="ortak">Ortak Konular</option>
                            <option value="alan">Alan Konuları</option>
                        </select>
                    </div>
                    <div class="col-md-5 text-end">
                        <span class="badge bg-light text-dark border" id="topicCountBadge">Yükleniyor...</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Konu Listesi -->
        <div class="card border-0 shadow-sm">
            <div class="table-responsive">
                <table class="admin-table align-middle">
                    <thead class="bg-light">
                        <tr>
                            <th style="width:50px">Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>İçerik</th>
                            <th>Durum</th>
                            <th style="width:150px">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <!-- ANA EDİTÖR MODALI -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 1200px; height: 95vh; display:flex; flex-direction:column; padding:0; overflow:hidden;">
                
                <!-- Modal Header -->
                <div class="modal-header bg-white border-bottom p-3 d-flex justify-content-between align-items-center">
                    <h5 class="m-0 fw-bold text-primary"><span class="material-icons align-middle me-2">edit_note</span>İçerik Stüdyosu</h5>
                    <button id="btnCloseTopicModal" class="btn-close"></button>
                </div>
                
                <div class="modal-body p-0" style="flex:1; display: grid; grid-template-columns: 300px 1fr; gap: 0; overflow:hidden;">
                    
                    <!-- SOL KOLON: İçerik Ağacı -->
                    <div class="lessons-sidebar bg-light border-end d-flex flex-column" style="height:100%;">
                        <div class="p-3 border-bottom d-flex justify-content-between align-items-center bg-white">
                            <span class="fw-bold small text-uppercase text-muted">İçerik Ağacı</span>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                    + Ekle
                                </button>
                                <ul class="dropdown-menu shadow">
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('lesson')"><span class="material-icons align-middle fs-6 me-2">article</span>Ders Notu</a></li>
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('test')"><span class="material-icons align-middle fs-6 me-2">quiz</span>Test / Sınav</a></li>
                                </ul>
                            </div>
                        </div>
                        <div id="lessonsListContainer" class="lessons-nav sortable-list p-2" style="overflow-y: auto; flex:1;"></div>
                        <div class="p-3 border-top bg-white text-center">
                            <button class="btn btn-sm btn-outline-secondary w-100" onclick="openTopicEditor(document.getElementById('editTopicId').value)">
                                <span class="material-icons align-middle fs-6">settings</span> Ana Konu Ayarları
                            </button>
                        </div>
                    </div>

                    <!-- SAĞ KOLON: Editör Alanı -->
                    <div class="editor-area bg-white" style="padding: 30px; overflow-y: auto;">
                        
                        <!-- 1. Ana Konu Ayarları (Varsayılan) -->
                        <div id="topicMetaPanel">
                            <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
                                <h4 class="mb-0">Ana Konu Ayarları</h4>
                                <button type="button" id="btnSaveMeta" class="btn btn-success px-4">
                                    <span class="material-icons align-middle fs-6 me-1">save</span> Kaydet
                                </button>
                            </div>
                            
                            <form id="topicMetaForm">
                                <input type="hidden" id="editTopicId">
                                <div class="row g-4">
                                    <div class="col-md-9">
                                        <label class="form-label fw-bold">Konu Başlığı</label>
                                        <input type="text" id="inpTopicTitle" class="form-control form-control-lg" placeholder="Örn: Anayasa Hukuku" required>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label fw-bold">Sıra No</label>
                                        <input type="number" id="inpTopicOrder" class="form-control form-control-lg" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">Kategori</label>
                                        <select id="inpTopicCategory" class="form-select">
                                            <option value="ortak">Ortak Konular</option>
                                            <option value="alan">Alan Konuları</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">Durum</label>
                                        <select id="inpTopicStatus" class="form-select">
                                            <option value="true">✅ Aktif</option>
                                            <option value="false">❌ Pasif</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-bold">Açıklama</label>
                                        <textarea id="inpTopicDesc" class="form-control" rows="4" placeholder="Konu hakkında kısa bilgi..."></textarea>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <!-- 2. İçerik Editörü (Ders/Test) -->
                        <div id="contentEditorPanel" style="display:none;">
                            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
                                <div>
                                    <span class="badge bg-secondary mb-1" id="contentTypeBadge">DERS</span>
                                    <h4 class="mb-0" id="editorTitle">İçerik Düzenle</h4>
                                </div>
                                <div>
                                    <button class="btn btn-outline-danger me-2" onclick="deleteCurrentContent()">
                                        <span class="material-icons align-middle">delete</span>
                                    </button>
                                    <button class="btn btn-success px-4" onclick="saveCurrentContent()">
                                        <span class="material-icons align-middle me-1">save</span> Kaydet
                                    </button>
                                </div>
                            </div>

                            <div class="mb-4">
                                <label class="form-label fw-bold">İçerik Başlığı</label>
                                <input type="text" id="inpContentTitle" class="form-control form-control-lg" placeholder="Örn: Giriş ve Temel Kavramlar">
                                <input type="hidden" id="inpContentType">
                            </div>

                            <!-- TEST EDİTÖRÜ -->
                            <div id="testEditorArea" style="display:none;">
                                <!-- Sihirbaz Paneli -->
                                <div class="card bg-light border-primary mb-4 shadow-sm">
                                    <div class="card-body">
                                        <div class="d-flex align-items-center mb-3">
                                            <span class="material-icons text-primary me-2">auto_fix_high</span>
                                            <h6 class="card-title text-primary m-0 fw-bold">Otomatik Test Sihirbazı</h6>
                                        </div>
                                        
                                        <div class="row g-2 align-items-end">
                                            <div class="col-md-3">
                                                <label class="small text-muted fw-bold">Kanun No</label>
                                                <input type="text" id="wizLegCode" class="form-control" placeholder="Örn: 5271">
                                            </div>
                                            <div class="col-md-2">
                                                <label class="small text-muted fw-bold">Başlangıç Md.</label>
                                                <input type="number" id="wizStartArt" class="form-control">
                                            </div>
                                            <div class="col-md-2">
                                                <label class="small text-muted fw-bold">Bitiş Md.</label>
                                                <input type="number" id="wizEndArt" class="form-control">
                                            </div>
                                            <div class="col-md-2">
                                                <label class="small text-muted fw-bold">Soru Sayısı</label>
                                                <input type="number" id="wizLimit" class="form-control" value="15">
                                            </div>
                                            <div class="col-md-3">
                                                <button class="btn btn-primary w-100" onclick="runTestWizard()">
                                                    <span class="material-icons align-middle fs-6">search</span> Soruları Getir
                                                </button>
                                            </div>
                                        </div>
                                        <small class="text-muted mt-2 d-block fst-italic">* Belirtilen aralıktaki soruları bulur ve madde sırasına göre dizer.</small>
                                    </div>
                                </div>

                                <!-- Soru Listesi -->
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="m-0 fw-bold">Test Soruları (<span id="qCount">0</span>)</h6>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="openQuestionSelector()">
                                        <span class="material-icons align-middle fs-6">add</span> Manuel Soru Ekle
                                    </button>
                                </div>
                                <div id="selectedQuestionsList" class="list-group sortable-list border bg-white shadow-sm" style="min-height: 100px;">
                                    <!-- Sorular buraya -->
                                </div>
                            </div>

                            <!-- DERS NOTU EDİTÖRÜ -->
                            <div id="lessonEditorArea" style="display:none;">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <label class="fw-bold mb-0">Materyaller</label>
                                    <div class="btn-group shadow-sm">
                                        <button class="btn btn-sm btn-white border" onclick="addMaterial('pdf')"><span class="material-icons align-middle fs-6 text-danger">picture_as_pdf</span> PDF</button>
                                        <button class="btn btn-sm btn-white border" onclick="addMaterial('video')"><span class="material-icons align-middle fs-6 text-primary">play_circle</span> Video</button>
                                        <button class="btn btn-sm btn-white border" onclick="addMaterial('podcast')"><span class="material-icons align-middle fs-6 text-success">headset</span> Podcast</button>
                                        <button class="btn btn-sm btn-white border" onclick="addMaterial('html')"><span class="material-icons align-middle fs-6 text-warning">article</span> Not</button>
                                    </div>
                                </div>
                                <div id="materialsList" class="materials-container d-grid gap-3"></div>
                            </div>

                        </div>

                    </div>
                </div>
            </div>
        </div>

        <!-- MANUEL SORU SEÇİCİ MODALI -->
        <div id="questionSelectorModal" class="modal-overlay" style="display:none; z-index: 2100;">
            <div class="modal-content admin-modal-content" style="max-width: 800px; height: 80vh;">
                <div class="modal-header">
                    <h3>Soru Havuzu</h3>
                    <button onclick="document.getElementById('questionSelectorModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <div class="input-group mb-3">
                        <input type="text" id="searchPool" class="form-control" placeholder="Soru metni veya Kanun No ara...">
                        <button class="btn btn-outline-secondary" onclick="filterQuestionPool()">Ara</button>
                    </div>
                    <div id="poolList" class="list-group"></div>
                </div>
            </div>
        </div>

        <!-- ÇÖP KUTUSU MODALI -->
        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                <div class="modal-header">
                    <h3>🗑️ Geri Dönüşüm Kutusu</h3>
                    <button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <table class="admin-table">
                        <thead><tr><th>Başlık</th><th>Silinme Tarihi</th><th>İşlem</th></tr></thead>
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .lessons-nav .nav-item { padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom: 8px; border: 1px solid transparent; transition: all 0.2s; background: #fff; display:flex; align-items:center; justify-content:space-between; }
        .lessons-nav .nav-item:hover { background: var(--bg-hover); border-color: var(--border-color); transform:translateX(3px); }
        .lessons-nav .nav-item.active { background: rgba(212, 175, 55, 0.1); border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
        
        .material-row { background: #fff; border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; display: grid; grid-template-columns: 50px 1fr auto; gap: 20px; align-items: start; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition:transform 0.2s; }
        .material-row:hover { transform:translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        
        .q-item { cursor: grab; transition: background 0.2s; }
        .q-item:hover { background: #f8f9fa; }
        .q-item:active { cursor: grabbing; }
        
        .btn-white { background: white; color: #333; }
        .btn-white:hover { background: #f8f9fa; }
    `;
    document.head.appendChild(style);

    bindEvents();
}

function bindEvents() {
    modalElement = document.getElementById('topicModal');

    document.getElementById('btnNewTopic').addEventListener('click', () => openTopicEditor());
    document.getElementById('btnCloseTopicModal').addEventListener('click', () => modalElement.style.display = 'none');
    document.getElementById('btnSaveMeta').addEventListener('click', handleSaveTopicMeta);

    document.getElementById('searchTopic').addEventListener('input', filterTopics);
    document.getElementById('filterCategory').addEventListener('change', filterTopics);
    document.getElementById('searchPool').addEventListener('input', filterQuestionPool);

    // Global Fonksiyonlar
    window.openTopicEditor = openTopicEditor;
    window.addNewContentUI = addNewContentUI;
    window.selectContent = selectContent;
    window.saveCurrentContent = saveCurrentContent;
    window.deleteCurrentContent = deleteCurrentContent;
    window.openQuestionSelector = openQuestionSelector;
    window.addQuestionToTest = addQuestionToTest;
    window.removeQuestionFromTest = removeQuestionFromTest;
    window.addMaterial = addMaterial;
    window.removeMaterial = removeMaterial;
    window.openTrashModal = openTrashModal;
    window.restoreItem = restoreItem;
    window.permanentDelete = permanentDelete;
    window.softDeleteTopic = softDeleteTopic;
    window.runTestWizard = runTestWizard;
    window.filterQuestionPool = filterQuestionPool;
}

// --- LİSTELEME ---
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        allTopicsCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'deleted') {
                allTopicsCache.push({ id: doc.id, ...data });
            }
        });

        filterTopics();

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Hata: ${error.message}</td></tr>`;
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
            <td><span class="badge bg-light text-dark border">${t.order}</span></td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge bg-secondary">${t.category}</span></td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? '<span class="text-success">● Aktif</span>' : '<span class="text-danger">● Pasif</span>'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="window.openTopicEditor('${t.id}')"><span class="material-icons align-middle" style="font-size:16px;">edit</span></button>
                <button class="btn btn-sm btn-outline-danger" onclick="window.softDeleteTopic('${t.id}')"><span class="material-icons align-middle" style="font-size:16px;">delete</span></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- EDİTÖR ---
async function openTopicEditor(id = null) {
    modalElement.style.display = 'flex';
    document.getElementById('lessonsListContainer').innerHTML = '';
    document.getElementById('contentEditorPanel').style.display = 'none';
    document.getElementById('topicMetaPanel').style.display = 'block';

    if (id) {
        document.getElementById('editTopicId').value = id;
        const topic = allTopicsCache.find(t => t.id === id);

        if (topic) {
            document.getElementById('inpTopicTitle').value = topic.title;
            document.getElementById('inpTopicOrder').value = topic.order;
            document.getElementById('inpTopicCategory').value = topic.category;
            document.getElementById('inpTopicStatus').value = topic.isActive.toString();
            document.getElementById('inpTopicDesc').value = topic.description || '';
            loadContents(id);
        }
    } else {
        document.getElementById('editTopicId').value = "";
        document.getElementById('topicMetaForm').reset();
    }
}

async function loadContents(topicId) {
    const container = document.getElementById('lessonsListContainer');
    container.innerHTML = '<div class="text-center p-2 text-muted">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    container.innerHTML = '';
    currentContents = [];

    snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        currentContents.push(data);

        let icon = 'article';
        let color = 'text-muted';
        if (data.type === 'test') { icon = 'quiz'; color = 'text-primary'; }

        const div = document.createElement('div');
        div.className = 'nav-item';
        div.innerHTML = `
            <div class="d-flex align-items-center">
                <span class="material-icons ${color} me-2">${icon}</span>
                <span class="text-truncate" style="max-width:180px;">${data.title}</span>
            </div>
            <span class="badge bg-light text-dark border">#${data.order}</span>
        `;
        div.onclick = () => selectContent(data.id);
        container.appendChild(div);
    });

    if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
            animation: 150,
            ghostClass: 'bg-light',
            onEnd: function (evt) { console.log("Sıralama değişti"); }
        });
    }
}

function selectContent(id) {
    activeContentId = id;
    const content = currentContents.find(c => c.id === id);

    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('contentEditorPanel').style.display = 'block';

    document.getElementById('inpContentTitle').value = content.title;
    document.getElementById('inpContentType').value = content.type || 'lesson';

    // Badge Güncelle
    const badge = document.getElementById('contentTypeBadge');
    badge.innerText = content.type === 'test' ? 'TEST / SINAV' : 'DERS NOTU';
    badge.className = content.type === 'test' ? 'badge bg-primary mb-1' : 'badge bg-success mb-1';

    if (content.type === 'test') {
        document.getElementById('testEditorArea').style.display = 'block';
        document.getElementById('lessonEditorArea').style.display = 'none';
        selectedQuestions = content.questions || [];
        renderSelectedQuestions();
    } else {
        document.getElementById('testEditorArea').style.display = 'none';
        document.getElementById('lessonEditorArea').style.display = 'block';
        currentMaterials = content.materials || [];
        renderMaterials();
    }
}

function addNewContentUI(type) {
    activeContentId = null;
    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('contentEditorPanel').style.display = 'block';

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentType').value = type;

    const badge = document.getElementById('contentTypeBadge');
    badge.innerText = type === 'test' ? 'YENİ TEST' : 'YENİ DERS NOTU';
    badge.className = 'badge bg-warning text-dark mb-1';

    if (type === 'test') {
        document.getElementById('testEditorArea').style.display = 'block';
        document.getElementById('lessonEditorArea').style.display = 'none';
        selectedQuestions = [];
        renderSelectedQuestions();
    } else {
        document.getElementById('testEditorArea').style.display = 'none';
        document.getElementById('lessonEditorArea').style.display = 'block';
        currentMaterials = [];
        renderMaterials();
    }
}

// --- MATERYAL YÖNETİMİ (PODCAST EKLENDİ) ---
function addMaterial(type) {
    currentMaterials.push({ id: Date.now(), type, title: '', url: '' });
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

        let icon = 'article';
        let color = 'text-muted';
        let placeholder = 'URL';

        if (mat.type === 'video') { icon = 'play_circle'; color = 'text-primary'; placeholder = 'YouTube Linki'; }
        else if (mat.type === 'pdf') { icon = 'picture_as_pdf'; color = 'text-danger'; placeholder = 'PDF Linki'; }
        else if (mat.type === 'podcast') { icon = 'headset'; color = 'text-success'; placeholder = 'Ses Dosyası Linki (MP3)'; }
        else if (mat.type === 'html') { icon = 'code'; color = 'text-warning'; placeholder = 'HTML İçerik'; }

        div.innerHTML = `
            <div class="d-flex align-items-center justify-content-center h-100">
                <span class="material-icons ${color}" style="font-size:2rem;">${icon}</span>
            </div>
            <div class="d-grid gap-2">
                <input type="text" class="form-control form-control-sm mat-title fw-bold" placeholder="Materyal Başlığı" value="${mat.title}">
                ${mat.type === 'html'
                ? `<textarea class="form-control form-control-sm mat-url" rows="3" placeholder="HTML İçerik...">${mat.url}</textarea>`
                : `<input type="text" class="form-control form-control-sm mat-url" placeholder="${placeholder}" value="${mat.url}">`
            }
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="removeMaterial(${mat.id})">
                <span class="material-icons">close</span>
            </button>
        `;

        div.querySelector('.mat-title').addEventListener('input', (e) => mat.title = e.target.value);
        div.querySelector('.mat-url').addEventListener('input', (e) => mat.url = e.target.value);
        container.appendChild(div);
    });
}

// --- TEST SİHİRBAZI ---
async function runTestWizard() {
    const code = document.getElementById('wizLegCode').value.trim();
    const start = parseInt(document.getElementById('wizStartArt').value);
    const end = parseInt(document.getElementById('wizEndArt').value);
    const limitVal = parseInt(document.getElementById('wizLimit').value) || 15;

    if (!code) return alert("Lütfen Kanun No giriniz.");

    try {
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), where("isActive", "==", true));
        const snapshot = await getDocs(q);

        let candidates = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const artNo = parseInt(data.legislationRef?.article);

            if (!isNaN(artNo)) {
                if ((!start || artNo >= start) && (!end || artNo <= end)) {
                    candidates.push({ id: doc.id, ...data, articleNo: artNo });
                }
            }
        });

        candidates.sort((a, b) => a.articleNo - b.articleNo);
        const selected = candidates.slice(0, limitVal);

        if (selected.length === 0) return alert("Kriterlere uygun soru bulunamadı.");

        selectedQuestions = [...selectedQuestions, ...selected];
        renderSelectedQuestions();
        alert(`${selected.length} soru eklendi.`);

    } catch (e) {
        console.error(e);
        alert("Hata: " + e.message);
    }
}

// --- SORU YÖNETİMİ ---
async function openQuestionSelector() {
    document.getElementById('questionSelectorModal').style.display = 'flex';
    filterQuestionPool();
}

async function filterQuestionPool() {
    const list = document.getElementById('poolList');
    const search = document.getElementById('searchPool').value.toLowerCase();
    list.innerHTML = '<div class="text-center p-3">Yükleniyor...</div>';

    let q = query(collection(db, "questions"), where("isActive", "==", true), limit(50));
    const snap = await getDocs(q);

    questionPool = [];
    snap.forEach(doc => questionPool.push({ id: doc.id, ...doc.data() }));

    list.innerHTML = '';
    questionPool.forEach(q => {
        if (search && !q.text.toLowerCase().includes(search) && !q.legislationRef?.code?.includes(search)) return;

        const isSelected = selectedQuestions.some(sq => sq.id === q.id);

        const item = document.createElement('button');
        item.className = `list-group-item list-group-item-action ${isSelected ? 'disabled' : ''}`;
        item.innerHTML = `
            <div class="d-flex justify-content-between">
                <small class="fw-bold text-primary">${q.legislationRef?.code || 'Genel'} / Md.${q.legislationRef?.article || '-'}</small>
                <small class="text-muted">${q.category}</small>
            </div>
            <div class="text-truncate mt-1">${q.text}</div>
        `;
        if (!isSelected) item.onclick = () => addQuestionToTest(q);
        list.appendChild(item);
    });
}

function addQuestionToTest(question) {
    selectedQuestions.push(question);
    renderSelectedQuestions();
    document.getElementById('questionSelectorModal').style.display = 'none';
}

function removeQuestionFromTest(index) {
    selectedQuestions.splice(index, 1);
    renderSelectedQuestions();
}

function renderSelectedQuestions() {
    const list = document.getElementById('selectedQuestionsList');
    document.getElementById('qCount').innerText = selectedQuestions.length;

    list.innerHTML = '';
    selectedQuestions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'list-group-item d-flex justify-content-between align-items-center q-item';
        div.innerHTML = `
            <div class="text-truncate me-2">
                <span class="fw-bold me-2 text-primary">${i + 1}.</span>
                <span class="badge bg-light text-dark border me-2">Md.${q.legislationRef?.article || '?'}</span>
                ${q.text}
            </div>
            <button class="btn btn-sm btn-outline-danger border-0" onclick="removeQuestionFromTest(${i})">
                <span class="material-icons">close</span>
            </button>
        `;
        list.appendChild(div);
    });

    if (typeof Sortable !== 'undefined') {
        new Sortable(list, {
            animation: 150,
            handle: '.q-item',
            onEnd: function (evt) { }
        });
    }
}

// --- KAYDETME VE SİLME ---
async function saveCurrentContent() {
    const topicId = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpContentTitle').value;
    const type = document.getElementById('inpContentType').value;

    if (!topicId || !title) return alert("Başlık gerekli.");

    const data = {
        title,
        type,
        order: currentContents.length + 1,
        isActive: true,
        updatedAt: serverTimestamp()
    };

    if (type === 'test') {
        data.questions = selectedQuestions.map(q => ({
            id: q.id,
            text: q.text,
            options: q.options,
            correctOption: q.correctOption,
            solution: q.solution,
            legislationRef: q.legislationRef
        }));
        data.qCount = selectedQuestions.length;
    } else {
        data.materials = currentMaterials;
    }

    try {
        if (activeContentId) {
            await updateDoc(doc(db, `topics/${topicId}/lessons`, activeContentId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${topicId}/lessons`), data);
        }
        alert("Kaydedildi.");
        loadContents(topicId);
    } catch (e) { alert("Hata: " + e.message); }
}

async function deleteCurrentContent() {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    const topicId = document.getElementById('editTopicId').value;
    try {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, activeContentId));
        loadContents(topicId);
        document.getElementById('contentEditorPanel').style.display = 'none';
        document.getElementById('topicMetaPanel').style.display = 'block';
    } catch (e) { alert("Hata: " + e.message); }
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

// --- ÇÖP KUTUSU ---
async function softDeleteTopic(id) {
    if (!confirm("Bu konuyu çöp kutusuna taşımak istiyor musunuz?")) return;
    try {
        await updateDoc(doc(db, "topics", id), { status: 'deleted', deletedAt: serverTimestamp() });
        loadTopics();
    } catch (e) { alert("Hata: " + e.message); }
}

async function openTrashModal() {
    const modal = document.getElementById('trashModal');
    const tbody = document.getElementById('trashTableBody');
    modal.style.display = 'flex';
    tbody.innerHTML = '<tr><td colspan="3">Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snapshot = await getDocs(q);

    tbody.innerHTML = '';
    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="3">Çöp kutusu boş.</td></tr>';
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
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
    openTrashModal();
    loadTopics();
}

async function permanentDelete(id) {
    if (confirm("BU İŞLEM GERİ ALINAMAZ! Kalıcı olarak silinsin mi?")) {
        await deleteDoc(doc(db, "topics", id));
        openTrashModal();
    }
}