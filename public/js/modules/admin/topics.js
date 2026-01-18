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
let activeTab = 'general'; // general | content

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
                <p class="text-muted">Konuları yönetin, test sihirbazı ile hızlıca sınav oluşturun.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-warning" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
                <button id="btnNewTopic" class="btn btn-primary">➕ Yeni Ana Konu</button>
            </div>
        </div>
        
        <!-- Filtreleme -->
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
                <div class="col-md-5 text-end">
                    <small class="text-muted" id="topicCountBadge">Yükleniyor...</small>
                </div>
            </div>
        </div>

        <!-- Konu Listesi -->
        <div class="card mb-4">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
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
            <div class="modal-content admin-modal-content" style="max-width: 1200px; height: 95vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h3 id="topicModalTitle">Konu Düzenle</h3>
                    <button id="btnCloseTopicModal" class="close-btn">&times;</button>
                </div>
                
                <div class="modal-body-scroll" style="flex:1; display: grid; grid-template-columns: 320px 1fr; gap: 0; padding:0; overflow:hidden;">
                    
                    <!-- SOL KOLON: İçerik Ağacı -->
                    <div class="lessons-sidebar" style="border-right: 1px solid var(--border-color); background: var(--bg-body); padding: 20px; overflow-y: auto;">
                        <button class="btn btn-outline-secondary w-100 mb-3" onclick="showTopicSettings()">⚙️ Ana Konu Ayarları</button>

                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="mb-0 fw-bold">İçerik Listesi</h6>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-outline-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">+ Ekle</button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('lesson')">📄 Ders Notu</a></li>
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('test')">📝 Test / Sınav</a></li>
                                </ul>
                            </div>
                        </div>
                        <div id="lessonsListContainer" class="lessons-nav sortable-list"></div>
                    </div>

                    <!-- SAĞ KOLON: Editör Alanı -->
                    <div class="editor-area" style="padding: 0; overflow-y: auto; background: #fff;">
                        
                        <!-- 1. Ana Konu Ayarları (Varsayılan) -->
                        <div id="topicMetaPanel" class="p-4">
                            <h5 class="mb-4 pb-2 border-bottom text-primary">Ana Konu Ayarları</h5>
                            <form id="topicMetaForm">
                                <input type="hidden" id="editTopicId">
                                <div class="row g-3">
                                    <div class="col-md-9">
                                        <label class="form-label">Konu Başlığı</label>
                                        <input type="text" id="inpTopicTitle" class="form-control" required>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Sıra No</label>
                                        <input type="number" id="inpTopicOrder" class="form-control" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Kategori</label>
                                        <select id="inpTopicCategory" class="form-control">
                                            <option value="ortak">Ortak Konular</option>
                                            <option value="alan">Alan Konuları</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Durum</label>
                                        <select id="inpTopicStatus" class="form-control">
                                            <option value="true">✅ Aktif</option>
                                            <option value="false">❌ Pasif</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label">Açıklama</label>
                                        <textarea id="inpTopicDesc" class="form-control" rows="3"></textarea>
                                    </div>
                                </div>
                                <div class="mt-4 text-end">
                                    <button type="button" id="btnSaveMeta" class="btn btn-success px-4">Ana Konuyu Kaydet</button>
                                </div>
                            </form>
                        </div>

                        <!-- 2. İçerik Editörü (Ders/Test) -->
                        <div id="contentEditorPanel" style="display:none; height:100%; display:flex; flex-direction:column;">
                            
                            <!-- Tab Header -->
                            <div class="px-4 pt-3 bg-light border-bottom d-flex justify-content-between align-items-center">
                                <ul class="nav nav-tabs border-bottom-0">
                                    <li class="nav-item">
                                        <a class="nav-link active" id="tab-general" href="#" onclick="switchTab('general')">Genel Bilgiler</a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" id="tab-content" href="#" onclick="switchTab('content')">İçerik & Medya</a>
                                    </li>
                                </ul>
                                <div>
                                    <button class="btn btn-sm btn-outline-danger me-2" onclick="deleteCurrentContent()">🗑️ Sil</button>
                                    <button class="btn btn-sm btn-success" onclick="saveCurrentContent()">💾 Kaydet</button>
                                </div>
                            </div>

                            <!-- Tab Content -->
                            <div class="p-4" style="flex:1; overflow-y:auto;">
                                
                                <!-- TAB 1: GENEL -->
                                <div id="panel-general" class="tab-panel">
                                    <h5 class="mb-3 text-primary" id="editorTitle">İçerik Düzenle</h5>
                                    <div class="row g-3">
                                        <div class="col-md-9">
                                            <label class="form-label">Başlık</label>
                                            <input type="text" id="inpContentTitle" class="form-control" placeholder="Örn: Anayasa Madde 1-20">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">Tür</label>
                                            <input type="text" id="inpContentType" class="form-control" disabled>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">Sıra No</label>
                                            <input type="number" id="inpContentOrder" class="form-control">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">Durum</label>
                                            <select id="inpContentStatus" class="form-control">
                                                <option value="true">✅ Aktif</option>
                                                <option value="false">❌ Pasif</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">Süre (dk)</label>
                                            <input type="number" id="inpContentDuration" class="form-control" placeholder="Örn: 20">
                                        </div>
                                        <div class="col-md-12">
                                            <label class="form-label">Etiketler (Virgülle ayır)</label>
                                            <input type="text" id="inpContentTags" class="form-control" placeholder="anayasa, temel, giriş">
                                        </div>
                                        <div class="col-12">
                                            <label class="form-label">Özet / Açıklama</label>
                                            <textarea id="inpContentSummary" class="form-control" rows="2"></textarea>
                                        </div>
                                    </div>
                                </div>

                                <!-- TAB 2: İÇERİK -->
                                <div id="panel-content" class="tab-panel" style="display:none;">
                                    
                                    <!-- Test Editörü -->
                                    <div id="testEditorArea" style="display:none;">
                                        <div class="card bg-light border-primary mb-4">
                                            <div class="card-body">
                                                <h6 class="card-title text-primary mb-3">⚡ Otomatik Test Sihirbazı</h6>
                                                <div class="row g-2 align-items-end">
                                                    <div class="col-md-3">
                                                        <label class="small text-muted">Kanun No</label>
                                                        <input type="text" id="wizLegCode" class="form-control form-control-sm" placeholder="Örn: 5271">
                                                    </div>
                                                    <div class="col-md-2">
                                                        <label class="small text-muted">Başlangıç Md.</label>
                                                        <input type="number" id="wizStartArt" class="form-control form-control-sm">
                                                    </div>
                                                    <div class="col-md-2">
                                                        <label class="small text-muted">Bitiş Md.</label>
                                                        <input type="number" id="wizEndArt" class="form-control form-control-sm">
                                                    </div>
                                                    <div class="col-md-2">
                                                        <label class="small text-muted">Soru Sayısı</label>
                                                        <input type="number" id="wizLimit" class="form-control form-control-sm" value="15">
                                                    </div>
                                                    <div class="col-md-3">
                                                        <button class="btn btn-sm btn-primary w-100" onclick="runTestWizard()">Soruları Getir</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="d-flex justify-content-between align-items-center mb-2">
                                            <h6 class="m-0">Seçilen Sorular (<span id="qCount">0</span>)</h6>
                                            <button class="btn btn-sm btn-outline-secondary" onclick="openQuestionSelector()">+ Manuel Ekle</button>
                                        </div>
                                        <div id="selectedQuestionsList" class="list-group sortable-list border bg-white" style="min-height: 100px;"></div>
                                    </div>

                                    <!-- Ders Editörü -->
                                    <div id="lessonEditorArea" style="display:none;">
                                        <div class="d-flex justify-content-between align-items-center mb-3">
                                            <h6 class="fw-bold m-0">Medya ve Materyaller</h6>
                                            <div class="btn-group">
                                                <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('html')">+ Not</button>
                                                <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('pdf')">+ PDF</button>
                                                <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('video')">+ Video</button>
                                                <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('podcast')">+ Podcast</button>
                                            </div>
                                        </div>
                                        <div id="materialsList" class="materials-container"></div>
                                    </div>
                                </div>

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
                        <input type="text" id="searchPool" class="form-control" placeholder="Ara...">
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
                        <thead><tr><th>Başlık</th><th>Tarih</th><th>İşlem</th></tr></thead>
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .lessons-nav .nav-item { padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 5px; border: 1px solid transparent; transition: all 0.2s; background: #fff; }
        .lessons-nav .nav-item:hover { background: var(--bg-hover); border-color: var(--border-color); }
        .lessons-nav .nav-item.active { background: rgba(212, 175, 55, 0.1); border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
        .material-row { background: #fff; border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; margin-bottom: 15px; }
        .q-item { cursor: grab; }
        .nav-tabs .nav-link { cursor: pointer; color: #555; }
        .nav-tabs .nav-link.active { color: var(--color-primary); font-weight: 600; }
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

    window.openTopicEditor = openTopicEditor;
    window.addNewContentUI = addNewContentUI;
    window.selectContent = selectContent;
    window.saveCurrentContent = saveCurrentContent;
    window.deleteCurrentContent = deleteCurrentContent;
    window.openQuestionSelector = openQuestionSelector;

    window.removeQuestionFromTest = removeQuestionFromTest;
    window.addMaterial = addMaterial;
    window.removeMaterial = removeMaterial;
    window.openTrashModal = openTrashModal;
    window.restoreItem = restoreItem;
    window.permanentDelete = permanentDelete;
    window.softDeleteTopic = softDeleteTopic;
    window.runTestWizard = runTestWizard;
    window.filterQuestionPool = filterQuestionPool;
    window.switchTab = switchTab;
    window.showTopicSettings = showTopicSettings;
}

// --- TAB YÖNETİMİ ---
function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`panel-${tabName}`).style.display = 'block';
}

function showTopicSettings() {
    document.getElementById('contentEditorPanel').style.display = 'none';
    document.getElementById('topicMetaPanel').style.display = 'block';
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
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge bg-secondary">${t.category}</span></td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? '✅' : '❌'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="window.openTopicEditor('${t.id}')">Düzenle</button>
                <button class="btn btn-sm btn-danger" onclick="window.softDeleteTopic('${t.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- EDİTÖR ---
async function openTopicEditor(id = null) {
    modalElement.style.display = 'flex';
    document.getElementById('lessonsListContainer').innerHTML = '';
    showTopicSettings();

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
    container.innerHTML = '<div class="text-center p-2">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    container.innerHTML = '';
    currentContents = [];

    snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        currentContents.push(data);

        const icon = data.type === 'test' ? '📝' : '📄';
        const badge = data.isActive === false ? '<span class="text-danger ms-auto small">Pasif</span>' : '';

        const div = document.createElement('div');
        div.className = 'nav-item d-flex align-items-center p-2 border-bottom';
        div.innerHTML = `
            <div class="me-2">${icon}</div>
            <div style="flex:1;">
                <div class="fw-bold" style="font-size:0.9rem;">${data.title}</div>
                <small class="text-muted">#${data.order || '-'}</small>
            </div>
            ${badge}
        `;
        div.onclick = () => selectContent(data.id);
        container.appendChild(div);
    });

    if (typeof Sortable !== 'undefined') {
        new Sortable(container, { animation: 150 });
    }
}

function selectContent(id) {
    activeContentId = id;
    const content = currentContents.find(c => c.id === id);

    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('contentEditorPanel').style.display = 'flex'; // Flex for layout
    switchTab('general');

    document.getElementById('inpContentTitle').value = content.title;
    document.getElementById('inpContentType').value = content.type || 'lesson';
    document.getElementById('inpContentOrder').value = content.order || '';
    document.getElementById('inpContentStatus').value = content.isActive === false ? 'false' : 'true';
    document.getElementById('inpContentDuration').value = content.duration || '';
    document.getElementById('inpContentTags').value = Array.isArray(content.tags) ? content.tags.join(', ') : (content.tags || '');
    document.getElementById('inpContentSummary').value = content.summary || '';

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
    document.getElementById('contentEditorPanel').style.display = 'flex';
    switchTab('general');

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentType').value = type;
    document.getElementById('inpContentOrder').value = currentContents.length + 1;
    document.getElementById('inpContentStatus').value = 'true';
    document.getElementById('inpContentDuration').value = '';
    document.getElementById('inpContentTags').value = '';
    document.getElementById('inpContentSummary').value = '';

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

// --- MATERYAL YÖNETİMİ ---
function addMaterial(type) {
    currentMaterials.push({ id: Date.now(), type, title: '', url: '', duration: '', description: '' });
    renderMaterials();
    switchTab('content'); // İçerik sekmesine zıpla
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

        let icon = '📝';
        let color = '#6c757d';
        let label = 'Materyal';

        if (mat.type === 'video') { icon = '▶️'; color = '#d35400'; label = 'Video İçeriği'; }
        else if (mat.type === 'pdf') { icon = '📄'; color = '#e74c3c'; label = 'PDF Dokümanı'; }
        else if (mat.type === 'podcast') { icon = '🎧'; color = '#8e44ad'; label = 'Podcast / Ses'; }
        else if (mat.type === 'html') { icon = '📰'; color = '#27ae60'; label = 'HTML Okuma'; }

        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                <strong style="color:${color};"><span class="me-2" style="font-size:1.2rem;">${icon}</span> ${label}</strong>
                <button class="btn btn-sm btn-outline-danger" onclick="removeMaterial(${mat.id})">Sil</button>
            </div>
            <div class="row g-2">
                <div class="col-md-8">
                    <label class="small text-muted">Başlık</label>
                    <input type="text" class="form-control form-control-sm mat-title" value="${mat.title}">
                </div>
                <div class="col-md-4">
                    <label class="small text-muted">Süre (Dk)</label>
                    <input type="number" class="form-control form-control-sm mat-duration" value="${mat.duration || ''}">
                </div>
                <div class="col-12">
                    <label class="small text-muted">İçerik / URL</label>
                    ${mat.type === 'html'
                ? `<textarea class="form-control form-control-sm mat-url" rows="3">${mat.url}</textarea>`
                : `<input type="text" class="form-control form-control-sm mat-url" value="${mat.url}" placeholder="https://...">`
            }
                </div>
                <div class="col-12">
                    <label class="small text-muted">Kısa Açıklama</label>
                    <input type="text" class="form-control form-control-sm mat-desc" value="${mat.description || ''}">
                </div>
            </div>
        `;

        div.querySelector('.mat-title').addEventListener('input', (e) => mat.title = e.target.value);
        div.querySelector('.mat-url').addEventListener('input', (e) => mat.url = e.target.value);
        div.querySelector('.mat-duration').addEventListener('input', (e) => mat.duration = e.target.value);
        div.querySelector('.mat-desc').addEventListener('input', (e) => mat.description = e.target.value);
        container.appendChild(div);
    });
}

// --- KAYDETME & SİHİRBAZ & DİĞERLERİ ---
// (Bu kısımlar önceki temel logic ile aynıdır, sadece referansları güncelledim)

async function runTestWizard() {
    // ... Eski kodun aynısı ...
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
        if (selected.length === 0) return alert("Soru bulunamadı.");

        selectedQuestions = [...selectedQuestions, ...selected];
        renderSelectedQuestions();
        alert(`${selected.length} soru eklendi.`);
    } catch (e) { console.error(e); alert(e.message); }
}

async function saveCurrentContent() {
    const topicId = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpContentTitle').value;
    const type = document.getElementById('inpContentType').value;
    const orderInput = parseInt(document.getElementById('inpContentOrder').value);
    const existing = currentContents.find(c => c.id === activeContentId);

    if (!topicId || !title) return alert("Başlık gerekli.");

    const data = {
        title, type,
        order: Number.isNaN(orderInput) ? (existing?.order ?? currentContents.length + 1) : orderInput,
        isActive: document.getElementById('inpContentStatus').value === 'true',
        duration: document.getElementById('inpContentDuration').value || '',
        summary: document.getElementById('inpContentSummary').value || '',
        tags: document.getElementById('inpContentTags').value.split(',').map(s => s.trim()).filter(Boolean),
        updatedAt: serverTimestamp()
    };

    if (type === 'test') {
        data.questions = selectedQuestions.map(q => ({
            id: q.id, text: q.text, options: q.options, correctOption: q.correctOption,
            solution: q.solution, legislationRef: q.legislationRef
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
    if (!confirm("Emin misiniz?")) return;
    const topicId = document.getElementById('editTopicId').value;
    try {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, activeContentId));
        loadContents(topicId);
        showTopicSettings();
    } catch (e) { alert(e.message); }
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
        if (id) await updateDoc(doc(db, "topics", id), data);
        else {
            data.createdAt = serverTimestamp();
            data.lessonCount = 0;
            data.status = 'active';
            const ref = await addDoc(collection(db, "topics"), data);
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Ana konu kaydedildi.");
        loadTopics();
    } catch (e) { alert(e.message); }
}

// --- SORU PICKER & TRASH (Minified) ---
async function openQuestionSelector() {
    document.getElementById('questionSelectorModal').style.display = 'flex';
    filterQuestionPool();
}
async function filterQuestionPool() {
    const list = document.getElementById('poolList');
    const search = document.getElementById('searchPool').value.toLowerCase();
    list.innerHTML = 'Yükleniyor...';
    let q = query(collection(db, "questions"), where("isActive", "==", true), limit(50));
    const snap = await getDocs(q);
    list.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        if (search && !(d.text + d.legislationRef?.code).toLowerCase().includes(search)) return;
        const btn = document.createElement('button');
        btn.className = 'list-group-item list-group-item-action';
        btn.innerHTML = `<small class="fw-bold">${d.legislationRef?.code || ''}</small> ${d.text.substring(0, 80)}...`;
        btn.onclick = () => {
            selectedQuestions.push({ id: doc.id, ...d });
            renderSelectedQuestions();
            document.getElementById('questionSelectorModal').style.display = 'none';
        };
        list.appendChild(btn);
    });
}
function renderSelectedQuestions() {
    const list = document.getElementById('selectedQuestionsList');
    document.getElementById('qCount').innerText = selectedQuestions.length;
    list.innerHTML = selectedQuestions.map((q, i) => `
        <div class="list-group-item d-flex justify-content-between">
            <div><strong>${i + 1}.</strong> ${q.text.substring(0, 60)}...</div>
            <button class="btn btn-sm btn-danger" onclick="window.removeQuestionFromTest(${i})">x</button>
        </div>`).join('');
}
function removeQuestionFromTest(i) { selectedQuestions.splice(i, 1); renderSelectedQuestions(); }

async function softDeleteTopic(id) {
    if (confirm("Çöp kutusuna?")) { await updateDoc(doc(db, "topics", id), { status: 'deleted', deletedAt: serverTimestamp() }); loadTopics(); }
}
async function openTrashModal() {
    document.getElementById('trashModal').style.display = 'flex';
    const tbody = document.getElementById('trashTableBody');
    tbody.innerHTML = '...';
    const s = await getDocs(query(collection(db, "topics"), where("status", "==", "deleted")));
    tbody.innerHTML = '';
    s.forEach(d => {
        tbody.innerHTML += `<tr><td>${d.data().title}</td><td>-</td><td><button onclick="window.restoreItem('${d.id}')">Geri Al</button></td></tr>`;
    });
}
async function restoreItem(id) { await updateDoc(doc(db, "topics", id), { status: 'active' }); openTrashModal(); loadTopics(); }
async function permanentDelete(id) { if (confirm("Kalıcı sil?")) { await deleteDoc(doc(db, "topics", id)); openTrashModal(); } }
