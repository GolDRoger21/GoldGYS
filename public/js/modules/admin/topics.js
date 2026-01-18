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
                    <div class="editor-area" style="padding: 25px; overflow-y: auto; background: #fff;">
                        
                        <!-- 1. Ana Konu Ayarları (Varsayılan) -->
                        <div id="topicMetaPanel">
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
                        <div id="contentEditorPanel" style="display:none;">
                            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
                                <h5 class="mb-0 text-primary" id="editorTitle">İçerik Düzenle</h5>
                                <div>
                                    <button class="btn btn-sm btn-outline-danger me-2" onclick="deleteCurrentContent()">🗑️ Sil</button>
                                    <button class="btn btn-sm btn-success" onclick="saveCurrentContent()">💾 Kaydet</button>
                                </div>
                            </div>

                            <div class="row g-3 mb-4">
                                <div class="col-md-8">
                                    <label class="form-label">Başlık</label>
                                    <input type="text" id="inpContentTitle" class="form-control" placeholder="Örn: Anayasa Madde 1-20 Testi">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Tür</label>
                                    <input type="text" id="inpContentType" class="form-control" disabled>
                                </div>
                            </div>

                            <!-- TEST EDİTÖRÜ -->
                            <div id="testEditorArea" style="display:none;">
                                <!-- Sihirbaz Paneli -->
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
                                        <small class="text-muted mt-2 d-block">* Belirtilen aralıktaki soruları bulur ve madde sırasına göre dizer.</small>
                                    </div>
                                </div>

                                <!-- Soru Listesi -->
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="m-0">Test Soruları (<span id="qCount">0</span>)</h6>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="openQuestionSelector()">+ Manuel Soru Ekle</button>
                                </div>
                                <div id="selectedQuestionsList" class="list-group sortable-list border bg-white" style="min-height: 100px;">
                                    <!-- Sorular buraya -->
                                </div>
                            </div>

                            <!-- DERS NOTU EDİTÖRÜ -->
                            <div id="lessonEditorArea" style="display:none;">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <label class="fw-bold">Materyaller</label>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('pdf')">+ PDF</button>
                                        <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('video')">+ Video</button>
                                        <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('html')">+ Not</button>
                                    </div>
                                </div>
                                <div id="materialsList" class="materials-container"></div>
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
        .lessons-nav .nav-item { padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 5px; border: 1px solid transparent; transition: all 0.2s; background: #fff; }
        .lessons-nav .nav-item:hover { background: var(--bg-hover); border-color: var(--border-color); }
        .lessons-nav .nav-item.active { background: rgba(212, 175, 55, 0.1); border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
        .material-row { background: #fff; border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; margin-bottom: 10px; display: grid; grid-template-columns: 40px 1fr auto; gap: 15px; align-items: start; }
        .q-item { cursor: grab; }
        .q-item:active { cursor: grabbing; }
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
    container.innerHTML = '<div class="text-center p-2">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    container.innerHTML = '';
    currentContents = [];

    snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        currentContents.push(data);

        const icon = data.type === 'test' ? '📝' : '📄';
        const div = document.createElement('div');
        div.className = 'nav-item d-flex justify-content-between align-items-center p-2 border-bottom';
        div.innerHTML = `<span>${icon} ${data.title}</span> <small class="text-muted">#${data.order}</small>`;
        div.onclick = () => selectContent(data.id);
        container.appendChild(div);
    });

    // SortableJS ile sıralama
    if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
            animation: 150,
            onEnd: function (evt) {
                // Sıralama değiştiğinde order'ları güncelle (İleride DB'ye yazılabilir)
                console.log("Sıralama değişti");
            }
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

// --- TEST SİHİRBAZI (YENİ) ---
async function runTestWizard() {
    const code = document.getElementById('wizLegCode').value.trim();
    const start = parseInt(document.getElementById('wizStartArt').value);
    const end = parseInt(document.getElementById('wizEndArt').value);
    const limitVal = parseInt(document.getElementById('wizLimit').value) || 15;

    if (!code) return alert("Lütfen Kanun No giriniz.");

    // Firestore'dan soruları çek
    // Not: Firestore'da range sorgusu için 'legislationRef.article'ın sayı olması gerekir.
    // Ancak biz string tutuyoruz. Bu yüzden client-side filtreleme yapacağız.
    // Performans için 'legislationRef.code' ile filtreleyip çekiyoruz.

    try {
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), where("isActive", "==", true));
        const snapshot = await getDocs(q);

        let candidates = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const artNo = parseInt(data.legislationRef?.article);

            // Madde aralığı kontrolü
            if (!isNaN(artNo)) {
                if ((!start || artNo >= start) && (!end || artNo <= end)) {
                    candidates.push({ id: doc.id, ...data, articleNo: artNo });
                }
            }
        });

        // Madde numarasına göre sırala
        candidates.sort((a, b) => a.articleNo - b.articleNo);

        // Limite göre kes
        const selected = candidates.slice(0, limitVal);

        if (selected.length === 0) return alert("Kriterlere uygun soru bulunamadı.");

        // Mevcut listeye ekle
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
    filterQuestionPool(); // İlk yükleme
}

async function filterQuestionPool() {
    const list = document.getElementById('poolList');
    const search = document.getElementById('searchPool').value.toLowerCase();
    list.innerHTML = 'Yükleniyor...';

    // Basit arama (Client-side cache kullanılabilir ama şimdilik direkt sorgu)
    // Performans için limitli sorgu
    let q = query(collection(db, "questions"), where("isActive", "==", true), limit(50));

    // Eğer arama varsa tümünü çekip filtrelemek gerekebilir (Firestore text search yok)
    // Şimdilik 50 tane çekip gösteriyoruz.

    const snap = await getDocs(q);
    list.innerHTML = '';

    snap.forEach(doc => {
        const q = doc.data();
        // Arama filtresi (Basit)
        if (search && !q.text.toLowerCase().includes(search) && !q.legislationRef?.code?.includes(search)) return;

        const isSelected = selectedQuestions.some(sq => sq.id === doc.id);

        const item = document.createElement('button');
        item.className = `list-group-item list-group-item-action ${isSelected ? 'disabled' : ''}`;
        item.innerHTML = `
            <div class="d-flex justify-content-between">
                <small class="fw-bold">${q.legislationRef?.code || 'Genel'} / Md.${q.legislationRef?.article || '-'}</small>
                <small>${q.category}</small>
            </div>
            <div class="text-truncate">${q.text}</div>
        `;
        if (!isSelected) item.onclick = () => addQuestionToTest({ id: doc.id, ...q });
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
                <span class="fw-bold me-2">${i + 1}.</span>
                <span class="badge bg-light text-dark border me-1">${q.legislationRef?.article || '?'}</span>
                ${q.text}
            </div>
            <button class="btn btn-sm btn-danger py-0" onclick="removeQuestionFromTest(${i})">×</button>
        `;
        list.appendChild(div);
    });

    // SortableJS
    if (typeof Sortable !== 'undefined') {
        new Sortable(list, {
            animation: 150,
            onEnd: function (evt) {
                // Array sırasını güncellemek gerekir (Şimdilik görsel)
            }
        });
    }
}

// --- MATERYAL YÖNETİMİ ---
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
        let icon = mat.type === 'video' ? '▶️' : (mat.type === 'pdf' ? '📄' : '📝');

        div.innerHTML = `
            <div style="font-size:1.5rem;">${icon}</div>
            <div class="d-grid gap-2">
                <input type="text" class="form-control form-control-sm mat-title" placeholder="Başlık" value="${mat.title}">
                ${mat.type === 'html'
                ? `<textarea class="form-control form-control-sm mat-url" rows="2" placeholder="İçerik...">${mat.url}</textarea>`
                : `<input type="text" class="form-control form-control-sm mat-url" placeholder="URL" value="${mat.url}">`
            }
            </div>
            <button class="btn btn-sm btn-danger" onclick="removeMaterial(${mat.id})">X</button>
        `;

        div.querySelector('.mat-title').addEventListener('input', (e) => mat.title = e.target.value);
        div.querySelector('.mat-url').addEventListener('input', (e) => mat.url = e.target.value);
        container.appendChild(div);
    });
}

// --- KAYDETME ---
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
