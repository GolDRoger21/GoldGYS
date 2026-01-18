import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, writeBatch, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let modalElement = null;
let topicForm = null;
let currentLessons = []; // Dersler ve Testler karışık
let activeLessonId = null;
let questionPool = []; // Soru havuzu
let selectedQuestions = []; // Test soruları
let currentMaterials = []; // Ders materyalleri
let allTopicsCache = []; // Filtreleme için cache

export function initTopicsPage() {
    renderTopicsInterface();
    loadTopics();
}

// --- ARAYÜZ ---
function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Konuları, dersleri, testleri ve materyalleri yönetin.</p>
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
                    <small class="text-muted" id="topicCountBadge">0 Konu Listelendi</small>
                </div>
            </div>
        </div>

        <!-- Konu Listesi -->
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
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <!-- EDİTÖR MODALI -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 1200px; height: 95vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h3 id="topicModalTitle">Konu Düzenle</h3>
                    <button id="btnCloseTopicModal" class="close-btn">&times;</button>
                </div>
                
                <div class="modal-body-scroll" style="flex:1; display: grid; grid-template-columns: 300px 1fr; gap: 0; padding:0; overflow:hidden;">
                    
                    <!-- SOL KOLON: İçerik Ağacı -->
                    <div class="lessons-sidebar" style="border-right: 1px solid var(--border-color); background: var(--bg-body); padding: 20px; overflow-y: auto;">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0">İçerikler</h5>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-outline-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">+ Ekle</button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('lesson')">📄 Ders Notu</a></li>
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('test')">📝 Test</a></li>
                                </ul>
                            </div>
                        </div>
                        <div id="lessonsListContainer" class="lessons-nav sortable-list"></div>
                    </div>

                    <!-- SAĞ KOLON: Editör -->
                    <div class="editor-area" style="padding: 20px; overflow-y: auto;">
                        
                        <!-- 1. Ana Konu Ayarları -->
                        <div id="topicMetaPanel">
                            <h4 class="mb-4 border-bottom pb-2">Ana Konu Ayarları</h4>
                            <form id="topicMetaForm">
                                <input type="hidden" id="editTopicId">
                                <div class="row">
                                    <div class="col-md-8 mb-3"><label>Başlık</label><input type="text" id="inpTopicTitle" class="form-control"></div>
                                    <div class="col-md-4 mb-3"><label>Sıra</label><input type="number" id="inpTopicOrder" class="form-control"></div>
                                    <div class="col-md-6 mb-3"><label>Kategori</label><select id="inpTopicCategory" class="form-control"><option value="ortak">Ortak</option><option value="alan">Alan</option></select></div>
                                    <div class="col-md-6 mb-3"><label>Durum</label><select id="inpTopicStatus" class="form-control"><option value="true">Aktif</option><option value="false">Pasif</option></select></div>
                                    <div class="col-12 mb-3"><label>Açıklama</label><textarea id="inpTopicDesc" class="form-control" rows="3"></textarea></div>
                                </div>
                                <button type="button" id="btnSaveMeta" class="btn btn-success float-end">Kaydet</button>
                            </form>
                        </div>

                        <!-- 2. Ders/Test Editörü -->
                        <div id="lessonEditorPanel" style="display:none;">
                            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
                                <h4 class="mb-0" id="editorTitle">İçerik Düzenle</h4>
                                <div>
                                    <button class="btn btn-sm btn-danger" onclick="deleteCurrentContent()">Sil</button>
                                    <button class="btn btn-sm btn-success" onclick="saveCurrentContent()">Kaydet</button>
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-8"><label>Başlık</label><input type="text" id="inpLessonTitle" class="form-control"></div>
                                <div class="col-md-4"><label>Tür</label><input type="text" id="inpLessonType" class="form-control" disabled></div>
                            </div>

                            <!-- TEST ÖZEL ALANI -->
                            <div id="testQuestionsArea" style="display:none;">
                                <div class="card bg-light p-3 mb-3">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <h6 class="m-0">Test Soruları (<span id="qCount">0</span>)</h6>
                                        <button class="btn btn-sm btn-primary" onclick="openQuestionSelector()">+ Soru Seç</button>
                                    </div>
                                    <div id="selectedQuestionsList" class="sortable-list bg-white border rounded p-2" style="min-height:100px;"></div>
                                </div>
                            </div>

                            <!-- DERS ÖZEL ALANI (MATERYALLER) -->
                            <div id="lessonMaterialsArea" style="display:none;">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <label class="mb-0 font-weight-bold">Materyaller</label>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-secondary" onclick="addMaterial('pdf')">+ PDF</button>
                                        <button class="btn btn-sm btn-secondary" onclick="addMaterial('video')">+ Video</button>
                                        <button class="btn btn-sm btn-secondary" onclick="addMaterial('podcast')">+ Podcast</button>
                                        <button class="btn btn-sm btn-secondary" onclick="addMaterial('html')">+ Not</button>
                                    </div>
                                </div>
                                <div id="materialsList" class="materials-container"></div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <!-- SORU SEÇİCİ MODALI -->
        <div id="questionSelectorModal" class="modal-overlay" style="display:none; z-index: 2100;">
            <div class="modal-content admin-modal-content" style="max-width: 800px; height: 80vh;">
                <div class="modal-header">
                    <h3>Soru Havuzu</h3>
                    <button onclick="document.getElementById('questionSelectorModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <input type="text" id="searchPool" class="form-control mb-3" placeholder="Soru ara...">
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

    // CSS Ekle
    const style = document.createElement('style');
    style.innerHTML = `
        .lessons-nav .nav-item { padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 5px; border: 1px solid transparent; transition: all 0.2s; }
        .lessons-nav .nav-item:hover { background: var(--bg-hover); }
        .lessons-nav .nav-item.active { background: rgba(212, 175, 55, 0.1); border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
        .material-row { background: var(--bg-body); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; margin-bottom: 10px; display: grid; grid-template-columns: 40px 1fr auto; gap: 15px; align-items: start; }
    `;
    document.head.appendChild(style);

    bindEvents();
}

function bindEvents() {
    modalElement = document.getElementById('topicModal');
    topicForm = document.getElementById('topicMetaForm');

    document.getElementById('btnNewTopic').addEventListener('click', () => openTopicEditor());
    document.getElementById('btnCloseTopicModal').addEventListener('click', () => modalElement.style.display = 'none');
    document.getElementById('btnSaveMeta').addEventListener('click', handleSaveTopicMeta);

    // Arama ve Filtreleme
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
}

// --- LİSTELEME VE FİLTRELEME ---
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        allTopicsCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'deleted') { // Çöp kutusundakileri gösterme
                allTopicsCache.push({ id: doc.id, ...data });
            }
        });

        filterTopics();

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
    document.getElementById('lessonEditorPanel').style.display = 'none';
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
        topicForm.reset();
    }
}

async function loadContents(topicId) {
    const container = document.getElementById('lessonsListContainer');
    container.innerHTML = 'Yükleniyor...';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    container.innerHTML = '';
    currentLessons = [];

    snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        currentLessons.push(data);

        const icon = data.type === 'test' ? '📝' : '📄';
        const div = document.createElement('div');
        div.className = 'nav-item d-flex justify-content-between align-items-center p-2 border-bottom';
        div.innerHTML = `<span>${icon} ${data.title}</span> <small class="text-muted">#${data.order}</small>`;
        div.onclick = () => selectContent(data.id);
        container.appendChild(div);
    });

    // SortableJS
    if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
            animation: 150,
            onEnd: function (evt) { console.log("Sıralama değişti"); }
        });
    }
}

function selectContent(id) {
    activeLessonId = id;
    const content = currentLessons.find(c => c.id === id);

    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('lessonEditorPanel').style.display = 'block';

    document.getElementById('inpLessonTitle').value = content.title;
    document.getElementById('inpLessonType').value = content.type || 'lesson';

    if (content.type === 'test') {
        document.getElementById('testQuestionsArea').style.display = 'block';
        document.getElementById('lessonMaterialsArea').style.display = 'none';
        selectedQuestions = content.questions || [];
        renderSelectedQuestions();
    } else {
        document.getElementById('testQuestionsArea').style.display = 'none';
        document.getElementById('lessonMaterialsArea').style.display = 'block';
        currentMaterials = content.materials || [];
        renderMaterials();
    }
}

function addNewContentUI(type) {
    activeLessonId = null;
    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('lessonEditorPanel').style.display = 'block';

    document.getElementById('inpLessonTitle').value = "";
    document.getElementById('inpLessonType').value = type;

    if (type === 'test') {
        document.getElementById('testQuestionsArea').style.display = 'block';
        document.getElementById('lessonMaterialsArea').style.display = 'none';
        selectedQuestions = [];
        renderSelectedQuestions();
    } else {
        document.getElementById('testQuestionsArea').style.display = 'none';
        document.getElementById('lessonMaterialsArea').style.display = 'block';
        currentMaterials = [];
        renderMaterials();
    }
}

// --- MATERYAL YÖNETİMİ (DERS İÇİN) ---
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

        let placeholder = 'URL';
        if (mat.type === 'video') placeholder = 'YouTube Linki';

        div.innerHTML = `
            <div class="mat-icon" style="font-size:1.5rem;">${icon}</div>
            <div class="mat-content d-grid gap-2">
                <div class="d-flex justify-content-between">
                    <input type="text" class="form-control form-control-sm mat-title" placeholder="Başlık" value="${mat.title}">
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

// --- SORU YÖNETİMİ (TEST İÇİN) ---
async function openQuestionSelector() {
    document.getElementById('questionSelectorModal').style.display = 'flex';
    const list = document.getElementById('poolList');
    list.innerHTML = 'Yükleniyor...';

    const q = query(collection(db, "questions"), where("isActive", "==", true), limit(50));
    const snap = await getDocs(q);

    questionPool = [];
    snap.forEach(doc => questionPool.push({ id: doc.id, ...doc.data() }));

    renderQuestionPool();
}

function renderQuestionPool() {
    const list = document.getElementById('poolList');
    const search = document.getElementById('searchPool').value.toLowerCase();

    list.innerHTML = '';
    questionPool.forEach(q => {
        if (search && !q.text.toLowerCase().includes(search)) return;

        const isSelected = selectedQuestions.some(sq => sq.id === q.id);

        const item = document.createElement('button');
        item.className = `list-group-item list-group-item-action ${isSelected ? 'disabled' : ''}`;
        item.innerHTML = `
            <div class="d-flex justify-content-between">
                <small>${q.category}</small>
                <small>${q.legislationRef?.code || ''}</small>
            </div>
            <div>${q.text.substring(0, 60)}...</div>
        `;
        if (!isSelected) item.onclick = () => addQuestionToTest(q);
        list.appendChild(item);
    });
}

function filterQuestionPool() { renderQuestionPool(); }

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
        div.className = 'd-flex justify-content-between align-items-center p-2 border-bottom bg-white mb-1';
        div.innerHTML = `
            <span>${i + 1}. ${q.text.substring(0, 40)}...</span>
            <button class="btn btn-sm btn-danger py-0" onclick="removeQuestionFromTest(${i})">×</button>
        `;
        list.appendChild(div);
    });
}

// --- KAYDETME VE SİLME ---
async function saveCurrentContent() {
    const topicId = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpLessonTitle').value;
    const type = document.getElementById('inpLessonType').value;

    if (!topicId || !title) return alert("Başlık gerekli.");

    const data = {
        title,
        type,
        order: currentLessons.length + 1,
        isActive: true,
        updatedAt: serverTimestamp()
    };

    if (type === 'test') {
        data.questions = selectedQuestions.map(q => ({
            id: q.id,
            text: q.text,
            options: q.options,
            correctOption: q.correctOption,
            solution: q.solution
        }));
        data.qCount = selectedQuestions.length;
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
        alert("Kaydedildi.");
        loadContents(topicId);
    } catch (e) { alert("Hata: " + e.message); }
}

async function deleteCurrentContent() {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    const topicId = document.getElementById('editTopicId').value;
    try {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId));
        loadContents(topicId);
        document.getElementById('lessonEditorPanel').style.display = 'none';
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
