import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- GLOBAL DEĞİŞKENLER ---
let modalElement = null;
let currentLessons = [];
let currentMaterials = [];
let currentTestQuestions = [];
let activeLessonId = null;
let activeLessonType = 'lesson'; // 'lesson' | 'test'
let allTopicsCache = [];

// --- BAŞLATMA ---
export function initTopicsPage() {
    console.log("Topics Module Initialized");
    renderTopicsInterface();
    // Global fonksiyonları dışarıya aç (HTML onclick için şart)
    exposeGlobals();
    bindEvents();
    loadTopics();
}

// --- GLOBAL FONKSİYONLARI TANIMLA ---
function exposeGlobals() {
    window.openTopicEditor = openTopicEditor;
    window.showTopicSettings = showTopicSettings;
    window.addNewContentUI = addNewContentUI;
    window.selectContent = selectContent;
    window.deleteCurrentContent = deleteCurrentContent;
    window.saveCurrentContent = saveCurrentContent;
    window.addMaterial = addMaterial;
    window.removeMaterial = removeMaterial;
    window.softDeleteTopic = softDeleteTopic;
    window.openTrashModal = openTrashModal;
    window.restoreItem = restoreItem;
    window.permanentDelete = permanentDelete;

    // Test Sihirbazı Fonksiyonları
    window.renderHeatmap = renderHeatmap;
    window.runSmartQuery = runSmartQuery;
    window.addQuestionToTest = addQuestionToTest;
    window.removeQuestionFromTest = removeQuestionFromTest;
}

// --- ARAYÜZ (HTML & CSS) ---
function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    // CSS: Modal ve Grid yapısını düzelten stiller
    const style = document.createElement('style');
    style.innerHTML = `
        /* Modal Düzeni */
        .admin-modal-content { display: flex; flex-direction: column; overflow: hidden; }
        .modal-body-scroll { flex: 1; overflow: hidden; display: flex; flex-direction: row; }
        
        /* Sidebar ve İçerik Alanı */
        .lessons-sidebar { width: 300px; background: #f8f9fa; border-right: 1px solid #dee2e6; display: flex; flex-direction: column; overflow-y: auto; padding: 15px; }
        .editor-area { flex: 1; background: #fff; overflow-y: auto; position: relative; display: flex; flex-direction: column; }
        
        /* Liste Elemanları */
        .lessons-nav .nav-item { padding: 12px; border: 1px solid #e9ecef; border-left: 4px solid transparent; background: #fff; margin-bottom: 8px; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
        .lessons-nav .nav-item:hover { background: #f1f3f5; transform: translateX(2px); }
        .lessons-nav .nav-item.active { border-left-color: var(--color-primary, #d4af37); background: #fff8e1; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

        /* Test Editörü Grid Yapısı */
        #testWorkspace { display: grid; grid-template-columns: 350px 1fr; height: 100%; overflow: hidden; }
        .scrollable-workspace { height: 100%; overflow-y: auto; padding: 20px; }
        
        /* Heatmap Bar */
        .heatmap-container { height: 12px; background: #e9ecef; border-radius: 6px; overflow: hidden; margin-top: 5px; cursor: crosshair; }
        .heatmap-track { display: flex; width: 100%; height: 100%; }
        .heatmap-segment { height: 100%; transition: opacity 0.2s; }
        .heatmap-segment:hover { opacity: 0.6; }

        /* Soru Kartları */
        .pool-item { font-size: 0.9rem; padding: 10px; border: 1px solid #dee2e6; margin-bottom: 5px; background: #fff; border-radius: 4px; cursor: pointer; }
        .pool-item:hover { border-color: var(--color-primary, #d4af37); background: #fdfdfd; }
        .paper-item { display: flex; gap: 10px; padding: 10px; border-bottom: 1px solid #eee; align-items: flex-start; }
        .paper-index { font-weight: bold; color: #555; min-width: 25px; }
    `;
    // Eski stili temizle ve yenisini ekle
    const oldStyle = document.getElementById('topics-dynamic-style');
    if (oldStyle) oldStyle.remove();
    style.id = 'topics-dynamic-style';
    document.head.appendChild(style);

    container.innerHTML = `
        <div class="section-header d-flex justify-content-between align-items-center mb-4">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Ders notları, videolar ve <span class="text-primary fw-bold">Test Sihirbazı</span> ile sınav yönetimi.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-warning text-dark" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
                <button id="btnNewTopic" class="btn btn-primary">➕ Yeni Ana Konu</button>
            </div>
        </div>
        
        <div class="card mb-4 p-3 shadow-sm">
            <div class="row align-items-center g-3">
                <div class="col-md-4">
                    <input type="text" id="searchTopic" class="form-control" placeholder="Konu başlığı ara...">
                </div>
                <div class="col-md-3">
                    <select id="filterCategory" class="form-select">
                        <option value="all">Tüm Kategoriler</option>
                        <option value="ortak">Ortak Konular</option>
                        <option value="alan">Alan Konuları</option>
                    </select>
                </div>
                <div class="col-md-5 text-end">
                    <span class="badge bg-secondary" id="topicCountBadge">Yükleniyor...</span>
                </div>
            </div>
        </div>

        <div class="card shadow-sm border-0">
            <div class="table-responsive">
                <table class="admin-table table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th style="width:60px">Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>İçerik</th>
                            <th>Durum</th>
                            <th style="width:140px" class="text-end">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <div id="topicModal" class="modal-overlay" style="display:none; z-index: 1050;">
            <div class="modal-content admin-modal-content" style="width: 95%; height: 90vh; max-width: 1400px;">
                
                <div class="modal-header border-bottom d-flex justify-content-between align-items-center p-3 bg-light">
                    <h4 class="m-0" id="topicModalTitle">İçerik Stüdyosu</h4>
                    <button id="btnCloseTopicModal" class="btn-close" style="font-size: 1.2rem; cursor:pointer;">&times;</button>
                </div>
                
                <div class="modal-body-scroll">
                    
                    <div class="lessons-sidebar">
                        <button class="btn btn-outline-dark w-100 mb-3 btn-sm" onclick="showTopicSettings()">⚙️ Ana Konu Ayarları</button>
                        
                        <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                            <span class="fw-bold text-muted small">İÇERİKLER</span>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">+ Ekle</button>
                                <ul class="dropdown-menu shadow">
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('lesson')">📄 Ders Notu</a></li>
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('test')">📝 Sınav / Test</a></li>
                                </ul>
                            </div>
                        </div>
                        <div id="lessonsListContainer" class="lessons-nav"></div>
                    </div>

                    <div class="editor-area">
                        
                        <div id="topicMetaPanel" class="p-4" style="max-width: 800px;">
                            <h5 class="mb-4 pb-2 border-bottom text-primary">Ana Konu Bilgileri</h5>
                            <form id="topicMetaForm" onsubmit="return false;">
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
                                        <select id="inpTopicCategory" class="form-select">
                                            <option value="ortak">Ortak Konular</option>
                                            <option value="alan">Alan Konuları</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Durum</label>
                                        <select id="inpTopicStatus" class="form-select">
                                            <option value="true">Aktif</option>
                                            <option value="false">Pasif</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label">Açıklama</label>
                                        <textarea id="inpTopicDesc" class="form-control" rows="3"></textarea>
                                    </div>
                                    <div class="col-12 text-end mt-4">
                                        <button type="button" id="btnSaveMeta" class="btn btn-success px-4">✓ Değişiklikleri Kaydet</button>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div id="contentEditorPanel" style="display:none; flex:1; flex-direction:column; height:100%;">
                            
                            <div class="p-3 border-bottom bg-light d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center gap-3" style="flex:1;">
                                    <span class="badge bg-secondary fs-6" id="contentTypeBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="form-control fw-bold" placeholder="İçerik Başlığı Giriniz..." style="font-size:1.1rem;">
                                </div>
                                <div class="d-flex gap-2 ms-4 align-items-center">
                                    <input type="number" id="inpContentOrder" class="form-control" placeholder="Sıra" style="width:70px;" title="Sıralama">
                                    <select id="inpContentStatus" class="form-select" style="width:100px;"><option value="true">Aktif</option><option value="false">Pasif</option></select>
                                    <div class="vr mx-2"></div>
                                    <button class="btn btn-outline-danger" onclick="deleteCurrentContent()" title="Sil">🗑️</button>
                                    <button class="btn btn-success" onclick="saveCurrentContent()">💾 Kaydet</button>
                                </div>
                            </div>

                            <div id="lessonWorkspace" class="scrollable-workspace">
                                <div class="alert alert-info py-2 small d-flex align-items-center">
                                    ℹ️ Bu alana PDF dosyaları, YouTube videoları veya HTML metin notları ekleyebilirsiniz.
                                </div>
                                <div class="card p-3 bg-light border-0 mb-3">
                                    <div class="d-flex gap-2">
                                        <button class="btn btn-sm btn-outline-dark bg-white" type="button" onclick="addMaterial('html')">📝 Metin Ekle</button>
                                        <button class="btn btn-sm btn-outline-danger bg-white" type="button" onclick="addMaterial('pdf')">📄 PDF Ekle</button>
                                        <button class="btn btn-sm btn-outline-danger bg-white" type="button" onclick="addMaterial('video')">▶️ Video Ekle</button>
                                    </div>
                                </div>
                                <div id="materialsList"></div>
                            </div>

                            <div id="testWorkspace" style="display:none;">
                                
                                <div class="d-flex flex-column border-end bg-light" style="overflow:hidden;">
                                    <div class="p-3 border-bottom">
                                        <label class="small fw-bold text-muted mb-1">KAYNAK SEÇİMİ</label>
                                        <select id="wizLegislation" class="form-select form-select-sm mb-2" onchange="renderHeatmap(this.value)">
                                            <option value="">Mevzuat Seçiniz...</option>
                                            <option value="2709">T.C. Anayasası (2709)</option>
                                            <option value="657">Devlet Memurları K. (657)</option>
                                            <option value="5271">Ceza Muhakemesi K. (5271)</option>
                                            <option value="5237">Türk Ceza Kanunu (5237)</option>
                                            <option value="2577">İYUK (2577)</option>
                                            <option value="4483">Memurlar Yargılanma K. (4483)</option>
                                        </select>
                                        
                                        <div class="heatmap-container mb-3" title="Koyu renkli alanlarda daha çok soru var">
                                            <div id="legislationHeatmap" class="heatmap-track"></div>
                                        </div>

                                        <div class="row g-1">
                                            <div class="col-4"><input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Baş Md."></div>
                                            <div class="col-4"><input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Son Md."></div>
                                            <div class="col-4"><button class="btn btn-primary btn-sm w-100" onclick="runSmartQuery()">🔍 Getir</button></div>
                                        </div>
                                    </div>
                                    
                                    <div id="questionPoolList" class="flex-1 p-2 scrollable-workspace" style="background:#e9ecef;">
                                        <div class="text-center text-muted small mt-4 p-3">
                                            Yukarıdan mevzuat ve madde aralığı seçip 'Getir' butonuna basınız.
                                        </div>
                                    </div>
                                </div>

                                <div class="d-flex flex-column bg-white" style="overflow:hidden;">
                                    <div class="p-2 border-bottom bg-light d-flex justify-content-between align-items-center">
                                        <span class="fw-bold text-primary px-2">📝 OLUŞTURULAN TEST</span>
                                        <span class="badge bg-primary me-2"><span id="testQCount">0</span> Soru</span>
                                    </div>
                                    <div id="testPaperList" class="flex-1 p-3 scrollable-workspace"></div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="trashModal" class="modal-overlay" style="display:none; z-index: 1060;">
            <div class="modal-content admin-modal-content" style="max-width: 800px; height: 70vh;">
                <div class="modal-header border-bottom p-3 bg-light d-flex justify-content-between">
                    <h5 class="m-0">🗑️ Geri Dönüşüm Kutusu</h5>
                    <button onclick="document.getElementById('trashModal').style.display='none'" class="btn-close"></button>
                </div>
                <div class="modal-body-scroll p-0">
                    <table class="table table-hover mb-0 w-100">
                        <thead class="table-light sticky-top"><tr><th>Başlık</th><th>Silinme Tarihi</th><th class="text-end">İşlem</th></tr></thead>
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function bindEvents() {
    modalElement = document.getElementById('topicModal');

    // Güvenli Event Listener Ekleme
    const btnNew = document.getElementById('btnNewTopic');
    if (btnNew) btnNew.addEventListener('click', () => openTopicEditor());

    const btnClose = document.getElementById('btnCloseTopicModal');
    if (btnClose) btnClose.addEventListener('click', () => modalElement.style.display = 'none');

    const btnSaveMeta = document.getElementById('btnSaveMeta');
    if (btnSaveMeta) btnSaveMeta.addEventListener('click', handleSaveTopicMeta);

    const searchInput = document.getElementById('searchTopic');
    if (searchInput) searchInput.addEventListener('input', filterTopics);

    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) filterSelect.addEventListener('change', filterTopics);
}
// ==========================================
// --- PART 2: MANTIK VE VERİTABANI ---
// ==========================================

// --- KONU LİSTELEME VE FİLTRELEME ---
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3 text-muted">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        allTopicsCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Sadece silinmemişleri listeye al
            if (data.status !== 'deleted') {
                allTopicsCache.push({ id: doc.id, ...data });
            }
        });

        filterTopics();
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Veri yüklenemedi: ${error.message}</td></tr>`;
    }
}

function filterTopics() {
    const search = document.getElementById('searchTopic')?.value.toLowerCase() || '';
    const cat = document.getElementById('filterCategory')?.value || 'all';
    const tbody = document.getElementById('topicsTableBody');
    const badge = document.getElementById('topicCountBadge');

    if (!tbody) return;

    const filtered = allTopicsCache.filter(t =>
        (cat === 'all' || t.category === cat) &&
        (t.title || '').toLowerCase().includes(search)
    );

    if (badge) badge.innerText = `${filtered.length} Konu`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Kriterlere uygun konu bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td><span class="fw-bold text-muted">${t.order}</span></td>
            <td>
                <div class="fw-bold text-dark">${t.title}</div>
                <small class="text-muted d-block text-truncate" style="max-width:250px">${t.description || ''}</small>
            </td>
            <td><span class="badge bg-light text-dark border">${t.category === 'ortak' ? 'Ortak' : 'Alan'}</span></td>
            <td><span class="badge bg-info text-dark">${t.lessonCount || 0} İçerik</span></td>
            <td>${t.isActive ? '<span class="text-success">● Aktif</span>' : '<span class="text-muted">○ Pasif</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary" onclick="window.openTopicEditor('${t.id}')">Düzenle</button>
                <button class="btn btn-sm btn-outline-danger" onclick="window.softDeleteTopic('${t.id}')">Sil</button>
            </td>
        </tr>
    `).join('');
}

// --- EDİTÖR AÇMA VE VERİ YÜKLEME ---

async function openTopicEditor(id = null) {
    if (!modalElement) modalElement = document.getElementById('topicModal');
    modalElement.style.display = 'flex';

    // UI Sıfırla
    document.getElementById('lessonsListContainer').innerHTML = '';
    showTopicSettings();

    if (id) {
        // Mevcut Konu Düzenleme
        document.getElementById('editTopicId').value = id;
        document.getElementById('topicModalTitle').innerText = "Konu Düzenle";

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
        // Yeni Konu Ekleme
        document.getElementById('topicModalTitle').innerText = "Yeni Konu Oluştur";
        document.getElementById('editTopicId').value = "";
        document.getElementById('topicMetaForm').reset();
        // Varsayılan değerler
        document.getElementById('inpTopicOrder').value = allTopicsCache.length + 1;
        document.getElementById('inpTopicStatus').value = "true";
    }
}

async function loadContents(topicId) {
    const list = document.getElementById('lessonsListContainer');
    list.innerHTML = '<div class="text-center p-3 text-muted">Yükleniyor...</div>';

    try {
        const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
        const snap = await getDocs(q);

        list.innerHTML = '';
        currentLessons = [];

        if (snap.empty) {
            list.innerHTML = '<div class="text-center p-3 small text-muted">Henüz içerik eklenmemiş.</div>';
            return;
        }

        snap.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            currentLessons.push(data);

            const icon = data.type === 'test' ? '📝' : '📄';
            const statusClass = data.isActive ? '' : 'text-decoration-line-through text-muted';

            const div = document.createElement('div');
            div.className = 'nav-item';
            div.innerHTML = `
                <div class="d-flex justify-content-between align-items-center ${statusClass}">
                    <span>${icon} <span class="fw-bold ms-1" style="font-size:0.9rem;">${data.title}</span></span>
                    <small class="text-muted">#${data.order}</small>
                </div>
            `;
            div.onclick = () => selectContent(data.id);
            list.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-danger p-2">Hata oluştu.</div>';
    }
}

// --- İÇERİK SEÇİMİ VE YENİ İÇERİK EKLEME ---

function showTopicSettings() {
    document.getElementById('topicMetaPanel').style.display = 'block';
    document.getElementById('contentEditorPanel').style.display = 'none';
    // Sidebar seçimini temizle
    document.querySelectorAll('.lessons-nav .nav-item').forEach(el => el.classList.remove('active'));
}

function selectContent(id) {
    activeLessonId = id;
    const content = currentLessons.find(c => c.id === id);
    if (!content) return;

    activeLessonType = content.type || 'lesson'; // Varsayılan: lesson

    // Sidebar'da aktifi işaretle
    // (Basitçe tümünü temizleyip tekrar render etmek yerine, class yönetimi yapılabilir ama şimdilik pass)

    renderEditorUI();

    // Formu Doldur
    document.getElementById('inpContentTitle').value = content.title;
    document.getElementById('inpContentOrder').value = content.order;
    document.getElementById('inpContentStatus').value = content.isActive.toString();

    if (activeLessonType === 'test') {
        currentTestQuestions = content.questions || [];
        renderTestPaper();
    } else {
        currentMaterials = content.materials || [];
        renderMaterials();
    }
}

function addNewContentUI(type) {
    const topicId = document.getElementById('editTopicId').value;
    if (!topicId) return alert("Lütfen önce ana konuyu kaydedin.");

    activeLessonId = null;
    activeLessonType = type;

    renderEditorUI();

    // Boş Form
    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentTitle').focus();
    document.getElementById('inpContentOrder').value = currentLessons.length + 1;
    document.getElementById('inpContentStatus').value = "true";

    if (type === 'test') {
        currentTestQuestions = [];
        renderTestPaper();
    } else {
        currentMaterials = [];
        renderMaterials();
    }
}

function renderEditorUI() {
    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('contentEditorPanel').style.display = 'flex';

    const badge = document.getElementById('contentTypeBadge');
    const lessonWS = document.getElementById('lessonWorkspace');
    const testWS = document.getElementById('testWorkspace');

    if (activeLessonType === 'test') {
        badge.innerText = "SINAV";
        badge.className = "badge bg-warning text-dark fs-6";
        lessonWS.style.display = 'none';
        testWS.style.display = 'grid'; // Grid layout
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-secondary fs-6";
        lessonWS.style.display = 'block';
        testWS.style.display = 'none';
    }
}

// --- KAYDETME İŞLEMLERİ ---

async function saveCurrentContent() {
    const topicId = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpContentTitle').value;

    if (!topicId) return alert("Ana konu bulunamadı.");
    if (!title) return alert("Lütfen bir başlık giriniz.");

    const data = {
        title,
        type: activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value) || 0,
        isActive: document.getElementById('inpContentStatus').value === 'true',
        updatedAt: serverTimestamp()
    };

    if (activeLessonType === 'test') {
        data.questions = currentTestQuestions;
        data.questionCount = currentTestQuestions.length;
    } else {
        data.materials = currentMaterials;
    }

    try {
        if (activeLessonId) {
            await updateDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${topicId}/lessons`), data);
        }

        // Başarılı
        const btn = document.querySelector('#contentEditorPanel .btn-success');
        const oldText = btn.innerText;
        btn.innerText = "✓ Kaydedildi";
        setTimeout(() => btn.innerText = oldText, 2000);

        loadContents(topicId); // Listeyi yenile
    } catch (e) {
        console.error(e);
        alert("Kaydetme hatası: " + e.message);
    }
}

async function handleSaveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;

    if (!title) return alert("Konu başlığı zorunludur.");

    const data = {
        title: title,
        order: parseInt(document.getElementById('inpTopicOrder').value) || 0,
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
            data.status = 'active'; // Silinmemiş
            const ref = await addDoc(collection(db, "topics"), data);
            document.getElementById('editTopicId').value = ref.id;
        }

        alert("Ana konu bilgileri kaydedildi. Şimdi içerik ekleyebilirsiniz.");
        loadTopics(); // Ana tabloyu yenile
    } catch (e) { alert("Hata: " + e.message); }
}

async function deleteCurrentContent() {
    if (!activeLessonId) return;
    if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;

    const topicId = document.getElementById('editTopicId').value;
    try {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId));
        showTopicSettings();
        loadContents(topicId);
    } catch (e) { alert(e.message); }
}

// --- DERS MATERYAL YARDIMCILARI ---
function addMaterial(type) {
    currentMaterials.push({ id: Date.now(), type, title: '', url: '' });
    renderMaterials();
}

function removeMaterial(id) {
    currentMaterials = currentMaterials.filter(m => m.id !== id);
    renderMaterials();
}

function renderMaterials() {
    const list = document.getElementById('materialsList');
    if (!list) return;

    list.innerHTML = currentMaterials.map(m => `
        <div class="card p-3 mb-2 border">
            <div class="d-flex justify-content-between mb-2">
                <span class="badge bg-light text-dark border">${m.type.toUpperCase()}</span>
                <button class="btn btn-sm btn-outline-danger py-0" onclick="removeMaterial(${m.id})">&times;</button>
            </div>
            <div class="row g-2">
                <div class="col-12">
                    <input type="text" class="form-control form-control-sm" placeholder="Materyal Başlığı (Örn: Ders Notu PDF)" 
                        value="${m.title}" oninput="currentMaterials.find(x=>x.id==${m.id}).title=this.value">
                </div>
                <div class="col-12">
                     ${m.type === 'html'
            ? `<textarea class="form-control form-control-sm" rows="3" placeholder="HTML İçerik veya Düz Metin..." oninput="currentMaterials.find(x=>x.id==${m.id}).url=this.value">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm" placeholder="URL / Dosya Linki" value="${m.url}" oninput="currentMaterials.find(x=>x.id==${m.id}).url=this.value">`
        }
                </div>
            </div>
        </div>
    `).join('');
}


// ==========================================
// --- AKILLI TEST SİHİRBAZI (ENGINE) ---
// ==========================================

// 1. Heatmap: Mevzuat Yoğunluk Analizi
async function renderHeatmap(legCode) {
    if (!legCode) return;
    const container = document.getElementById('legislationHeatmap');
    if (!container) return;

    container.innerHTML = '<div class="text-center w-100 text-muted" style="font-size:10px;">Veri analiz ediliyor...</div>';

    try {
        // Not: Gerçekte bu sorguyu 'question_stats' gibi ayrı bir koleksiyondan çekmek performanslıdır.
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", legCode));
        const snap = await getDocs(q);

        const counts = {};
        let maxArt = 0;

        snap.forEach(d => {
            const art = parseInt(d.data().legislationRef?.article);
            if (!isNaN(art)) {
                counts[art] = (counts[art] || 0) + 1;
                if (art > maxArt) maxArt = art;
            }
        });

        container.innerHTML = '';
        const range = maxArt || 100;
        const totalSegments = 40; // Bar sayısı
        const step = Math.ceil(range / totalSegments);

        for (let i = 1; i <= range; i += step) {
            let total = 0;
            // O aralıktaki toplam soru sayısı
            for (let j = 0; j < step; j++) total += (counts[i + j] || 0);

            const div = document.createElement('div');
            div.className = 'heatmap-segment';
            div.style.flex = '1';
            div.style.marginRight = '1px';

            // Renk Skalası
            if (total === 0) div.style.background = '#e9ecef'; // Gri (Yok)
            else if (total < 3) div.style.background = '#ffe8a1'; // Sarı (Az)
            else if (total < 6) div.style.background = '#ffc107'; // Turuncu (Orta)
            else div.style.background = '#198754'; // Yeşil (Çok)

            div.title = `Md. ${i}-${i + step - 1}: ${total} Soru`;
            div.onclick = () => {
                document.getElementById('wizStart').value = i;
                document.getElementById('wizEnd').value = i + step - 1;
            };
            container.appendChild(div);
        }
    } catch (e) {
        console.error("Heatmap hatası:", e);
        container.innerHTML = '<small class="text-danger">Analiz hatası</small>';
    }
}

// 2. Soru Getirme (Query)
async function runSmartQuery() {
    const code = document.getElementById('wizLegislation').value;
    const start = parseInt(document.getElementById('wizStart').value);
    const end = parseInt(document.getElementById('wizEnd').value);

    if (!code) return alert("Lütfen bir mevzuat seçiniz.");

    const list = document.getElementById('questionPoolList');
    list.innerHTML = '<div class="text-center p-3 text-muted">Sorular havuzdan getiriliyor...</div>';

    try {
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), limit(100));
        const snap = await getDocs(q);

        const candidates = [];
        snap.forEach(doc => {
            const d = doc.data();
            // Silinmişleri hariç tut
            if (d.isDeleted) return;

            const art = parseInt(d.legislationRef?.article);

            // Client-side filtreleme (Firestore range filter kısıtlamaları nedeniyle)
            if (!isNaN(art)) {
                if ((!start || art >= start) && (!end || art <= end)) {
                    candidates.push({ id: doc.id, ...d, artNo: art });
                }
            }
        });

        // Sıralama: Madde numarasına göre
        candidates.sort((a, b) => a.artNo - b.artNo);

        list.innerHTML = '';
        if (candidates.length === 0) {
            list.innerHTML = '<div class="text-center p-3 text-muted">Kriterlere uygun soru bulunamadı.</div>';
            return;
        }

        candidates.forEach(q => {
            const isAdded = currentTestQuestions.some(x => x.id === q.id);
            const opacity = isAdded ? '0.5' : '1';
            const icon = isAdded ? '✅' : '➕';

            const div = document.createElement('div');
            div.className = 'pool-item';
            div.style.opacity = opacity;
            div.innerHTML = `
                <div class="d-flex justify-content-between mb-1">
                    <span class="fw-bold text-primary">Madde ${q.artNo}</span>
                    <span class="badge bg-light text-dark border">Zorluk: ${q.difficulty || 3}</span>
                </div>
                <div class="text-dark small mb-1">${q.text.substring(0, 80)}...</div>
                <div class="text-end text-muted" style="font-size:10px;">ID: ${q.id.substring(0, 5)}</div>
            `;
            div.onclick = () => addQuestionToTest(q);
            list.appendChild(div);
        });

    } catch (e) {
        console.error(e);
        list.innerHTML = `<div class="text-danger p-3">Hata: ${e.message}</div>`;
    }
}

// 3. Test Kağıdını Yönetme
function addQuestionToTest(q) {
    // Mükerrer kontrolü
    if (currentTestQuestions.some(item => item.id === q.id)) return;

    currentTestQuestions.push({
        id: q.id,
        text: q.text,
        options: q.options,
        correctOption: q.correctOption,
        solution: q.solution,
        legislationRef: q.legislationRef
    });

    renderTestPaper();
    // Havuzdaki görünümü güncelle (Opaklık için)
    runSmartQuery(); // veya sadece DOM güncellemesi yapılabilir
}

function removeQuestionFromTest(index) {
    currentTestQuestions.splice(index, 1);
    renderTestPaper();
    // Havuzu güncelle
    runSmartQuery();
}

function renderTestPaper() {
    const list = document.getElementById('testPaperList');
    const countBadge = document.getElementById('testQCount');

    if (countBadge) countBadge.innerText = currentTestQuestions.length;

    if (currentTestQuestions.length === 0) {
        list.innerHTML = '<div class="text-center p-5 text-muted">Test kağıdı boş.<br>Soldan soru ekleyiniz.</div>';
        return;
    }

    list.innerHTML = currentTestQuestions.map((q, i) => `
        <div class="paper-item">
            <div class="paper-index">${i + 1}.</div>
            <div style="flex:1">
                <div class="small fw-bold text-primary mb-1">
                    ${q.legislationRef?.code} / Md. ${q.legislationRef?.article}
                </div>
                <div class="text-dark small">${q.text.substring(0, 120)}...</div>
            </div>
            <button class="btn btn-sm text-danger" onclick="removeQuestionFromTest(${i})" title="Çıkar">
                &times;
            </button>
        </div>
    `).join('');
}


// --- ÇÖP KUTUSU ---

async function softDeleteTopic(id) {
    if (!confirm("Bu konuyu çöp kutusuna taşımak istiyor musunuz?")) return;
    try {
        await updateDoc(doc(db, "topics", id), {
            status: 'deleted',
            deletedAt: serverTimestamp(),
            isActive: false
        });
        loadTopics();
    } catch (e) { alert("Hata: " + e.message); }
}

async function openTrashModal() {
    const modal = document.getElementById('trashModal');
    const tbody = document.getElementById('trashTableBody');
    if (!modal || !tbody) return;

    modal.style.display = 'flex';
    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-3">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), where("status", "==", "deleted"));
        const snapshot = await getDocs(q);

        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-3 text-muted">Çöp kutusu boş.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const dateStr = data.deletedAt ? new Date(data.deletedAt.seconds * 1000).toLocaleDateString() : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.title}</td>
                <td>${dateStr}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-success me-1" onclick="window.restoreItem('${doc.id}')">Geri Al</button>
                    <button class="btn btn-sm btn-danger" onclick="window.permanentDelete('${doc.id}')">Yok Et</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function restoreItem(id) {
    await updateDoc(doc(db, "topics", id), { status: 'active', deletedAt: null });
    openTrashModal();
    loadTopics();
}

async function permanentDelete(id) {
    if (confirm("DİKKAT: Bu işlem geri alınamaz! Konu tamamen silinecek.")) {
        await deleteDoc(doc(db, "topics", id));
        openTrashModal();
    }
}