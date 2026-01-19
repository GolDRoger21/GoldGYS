import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- GLOBAL DEĞİŞKENLER ---
let modalElement = null;
let currentLessons = [];
let currentMaterials = []; // Ders materyalleri
let currentTestQuestions = []; // Test soruları (Yeni)
let activeLessonId = null;
let activeLessonType = 'lesson'; // 'lesson' veya 'test' (Yeni)

export function initTopicsPage() {
    renderTopicsInterface();
    loadTopics();
}

// --- ARAYÜZ (HTML & CSS) ---
function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Müfredatı yönetin, ders notları ekleyin veya <span class="text-primary fw-bold">Test Sihirbazı</span> ile sınav oluşturun.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-warning" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
                <button id="btnNewTopic" class="btn btn-primary">➕ Yeni Ana Konu</button>
            </div>
        </div>
        
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

        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 1200px; height: 95vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h3 id="topicModalTitle">İçerik Stüdyosu</h3>
                    <button id="btnCloseTopicModal" class="close-btn">&times;</button>
                </div>
                
                <div class="modal-body-scroll" style="flex:1; display: grid; grid-template-columns: 280px 1fr; gap: 0; padding:0; overflow:hidden;">
                    
                    <div class="lessons-sidebar" style="border-right: 1px solid var(--border-color); background: #f8f9fa; padding: 15px; overflow-y: auto;">
                        <button class="btn btn-outline-dark w-100 mb-3 btn-sm" onclick="showTopicSettings()">⚙️ Ana Konu Ayarları</button>
                        
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0 fw-bold text-muted small">İÇERİK LİSTESİ</h6>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">+ Ekle</button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('lesson')">📄 Ders Notu</a></li>
                                    <li><a class="dropdown-item" href="#" onclick="addNewContentUI('test')">📝 Sınav / Test</a></li>
                                </ul>
                            </div>
                        </div>
                        <div id="lessonsListContainer" class="lessons-nav"></div>
                    </div>

                    <div class="editor-area" style="background: #fff; overflow-y: auto; display:flex; flex-direction:column;">
                        
                        <div id="topicMetaPanel" class="p-4">
                            <h5 class="mb-4 pb-2 border-bottom text-primary">Ana Konu Bilgileri</h5>
                            <form id="topicMetaForm">
                                <input type="hidden" id="editTopicId">
                                <div class="row g-3">
                                    <div class="col-md-9"><label>Başlık</label><input type="text" id="inpTopicTitle" class="form-control"></div>
                                    <div class="col-md-3"><label>Sıra</label><input type="number" id="inpTopicOrder" class="form-control"></div>
                                    <div class="col-md-6"><label>Kategori</label><select id="inpTopicCategory" class="form-control"><option value="ortak">Ortak</option><option value="alan">Alan</option></select></div>
                                    <div class="col-md-6"><label>Durum</label><select id="inpTopicStatus" class="form-control"><option value="true">Aktif</option><option value="false">Pasif</option></select></div>
                                    <div class="col-12"><label>Açıklama</label><textarea id="inpTopicDesc" class="form-control" rows="3"></textarea></div>
                                </div>
                                <div class="mt-3 text-end">
                                    <button type="button" id="btnSaveMeta" class="btn btn-success">Ana Konuyu Kaydet</button>
                                </div>
                            </form>
                        </div>

                        <div id="contentEditorPanel" style="display:none; flex:1; flex-direction:column; height:100%;">
                            
                            <div class="p-3 border-bottom bg-light d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center gap-2" style="flex:1;">
                                    <span class="badge bg-secondary" id="contentTypeBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="form-control fw-bold" placeholder="İçerik Başlığı Giriniz..." style="font-size:1.1rem;">
                                </div>
                                <div class="d-flex gap-2 ms-3">
                                    <input type="number" id="inpContentOrder" class="form-control" placeholder="Sıra" style="width:70px;">
                                    <select id="inpContentStatus" class="form-select" style="width:100px;"><option value="true">Aktif</option><option value="false">Pasif</option></select>
                                    <button class="btn btn-outline-danger" onclick="deleteCurrentContent()">🗑️</button>
                                    <button class="btn btn-success" onclick="saveCurrentContent()">💾 Kaydet</button>
                                </div>
                            </div>

                            <div id="lessonWorkspace" class="p-4 scrollable-workspace">
                                <div class="alert alert-info py-2 small">Bu alana PDF, Video veya HTML not ekleyebilirsiniz.</div>
                                <div class="btn-group mb-3">
                                    <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('html')">+ Metin</button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('pdf')">+ PDF</button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="addMaterial('video')">+ Video</button>
                                </div>
                                <div id="materialsList"></div>
                            </div>

                            <div id="testWorkspace" class="scrollable-workspace" style="display:none; flex:1; grid-template-columns: 350px 1fr; overflow:hidden;">
                                
                                <div class="border-end bg-light d-flex flex-column" style="overflow:hidden;">
                                    <div class="p-3 border-bottom">
                                        <label class="small fw-bold text-muted">MEVZUAT KAYNAĞI</label>
                                        <select id="wizLegislation" class="form-select form-select-sm mb-2" onchange="renderHeatmap(this.value)">
                                            <option value="">Seçiniz...</option>
                                            <option value="2709">T.C. Anayasası (2709)</option>
                                            <option value="657">Devlet Memurları K. (657)</option>
                                            <option value="5271">Ceza Muhakemesi K. (5271)</option>
                                            <option value="5237">Türk Ceza Kanunu (5237)</option>
                                            <option value="2577">İYUK (2577)</option>
                                        </select>
                                        
                                        <div class="heatmap-container mb-2" title="Madde yoğunluğu">
                                            <div id="legislationHeatmap" class="heatmap-track"></div>
                                        </div>

                                        <div class="row g-1">
                                            <div class="col-4"><input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Baş"></div>
                                            <div class="col-4"><input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Son"></div>
                                            <div class="col-4"><button class="btn btn-primary btn-sm w-100" onclick="runSmartQuery()">Getir</button></div>
                                        </div>
                                    </div>
                                    
                                    <div id="questionPoolList" class="flex-1 p-2" style="overflow-y:auto; background:#e9ecef;">
                                        <div class="text-center text-muted small mt-4">Kaynak seçip 'Getir' butonuna basın.</div>
                                    </div>
                                </div>

                                <div class="d-flex flex-column bg-white">
                                    <div class="p-2 border-bottom bg-light d-flex justify-content-between align-items-center">
                                        <span class="fw-bold text-primary">📝 OLUŞTURULAN TEST</span>
                                        <span class="badge bg-primary"><span id="testQCount">0</span> Soru</span>
                                    </div>
                                    <div id="testPaperList" class="flex-1 p-3" style="overflow-y:auto;"></div>
                                </div>

                            </div>
                            
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                <div class="modal-header"><h3>🗑️ Çöp Kutusu</h3><button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button></div>
                <div class="modal-body-scroll"><table class="admin-table"><thead><tr><th>Tür</th><th>Başlık</th><th>Tarih</th><th>İşlem</th></tr></thead><tbody id="trashTableBody"></tbody></table></div>
            </div>
        </div>
    `;

    // CSS STYLES
    const style = document.createElement('style');
    style.innerHTML = `
        .scrollable-workspace { height: 100%; overflow-y: auto; }
        #testWorkspace { display: grid; height: 100%; }
        
        .lessons-nav .nav-item { padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 5px; border-left: 3px solid transparent; background:#fff; }
        .lessons-nav .nav-item:hover { background: #e2e6ea; }
        .lessons-nav .nav-item.active { background: #e8f0fe; border-left-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
        
        .heatmap-track { height: 8px; background: #ddd; display: flex; border-radius: 4px; overflow: hidden; cursor: crosshair; }
        .heatmap-segment { height: 100%; transition: opacity 0.2s; }
        .heatmap-segment:hover { opacity: 0.7; }
        
        .pool-item { background: white; padding: 8px; border-radius: 4px; margin-bottom: 6px; border: 1px solid #dee2e6; cursor: pointer; font-size: 0.85rem; }
        .pool-item:hover { border-color: var(--color-primary); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        
        .paper-item { background: #fff; border: 1px solid #cfe2ff; padding: 10px; border-radius: 6px; margin-bottom: 8px; display: flex; gap: 10px; }
        .paper-index { font-weight: bold; color: var(--color-primary); width: 25px; }
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

    // Global erişim
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

    // Yeni Test Fonksiyonları
    window.renderHeatmap = renderHeatmap;
    window.runSmartQuery = runSmartQuery;
    window.addQuestionToTest = addQuestionToTest;
    window.removeQuestionFromTest = removeQuestionFromTest;
}

// --- VERİ YÖNETİMİ ---
let allTopicsCache = [];

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    allTopicsCache = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.status !== 'deleted') allTopicsCache.push({ id: doc.id, ...data });
    });

    filterTopics();
}

function filterTopics() {
    const search = document.getElementById('searchTopic').value.toLowerCase();
    const cat = document.getElementById('filterCategory').value;
    const tbody = document.getElementById('topicsTableBody');
    const filtered = allTopicsCache.filter(t =>
        (cat === 'all' || t.category === cat) && t.title.toLowerCase().includes(search)
    );

    document.getElementById('topicCountBadge').innerText = `${filtered.length} Konu`;
    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td>${t.category}</td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? '✅' : '❌'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="window.openTopicEditor('${t.id}')">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="window.softDeleteTopic('${t.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// --- EDİTÖR FONKSİYONLARI ---

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
    const list = document.getElementById('lessonsListContainer');
    list.innerHTML = 'Yükleniyor...';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);

    list.innerHTML = '';
    currentLessons = [];

    snap.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        currentLessons.push(data);

        const icon = data.type === 'test' ? '📝' : '📄';
        const div = document.createElement('div');
        div.className = 'nav-item';
        div.innerHTML = `<small class="text-muted">#${data.order}</small> ${icon} ${data.title}`;
        div.onclick = () => selectContent(data.id);
        list.appendChild(div);
    });
}

// --- İÇERİK SEÇİMİ VE YENİ EKLEME ---

function showTopicSettings() {
    document.getElementById('topicMetaPanel').style.display = 'block';
    document.getElementById('contentEditorPanel').style.display = 'none';
}

function selectContent(id) {
    activeLessonId = id;
    const content = currentLessons.find(c => c.id === id);
    activeLessonType = content.type || 'lesson'; // Varsayılan lesson

    renderEditorUI();

    // Verileri Doldur
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
    if (!topicId) return alert("Önce ana konuyu kaydedin.");

    activeLessonId = null;
    activeLessonType = type;

    renderEditorUI();

    // Boş Form
    document.getElementById('inpContentTitle').value = "";
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
        badge.className = "badge bg-warning text-dark";
        lessonWS.style.display = 'none';
        testWS.style.display = 'grid'; // Grid layout for test studio
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-secondary";
        lessonWS.style.display = 'block';
        testWS.style.display = 'none';
    }
}

// --- KAYDETME ---

async function saveCurrentContent() {
    const topicId = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpContentTitle').value;

    if (!title) return alert("Başlık gerekli.");

    const data = {
        title,
        type: activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value),
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
        alert("Kaydedildi.");
        loadContents(topicId);
    } catch (e) { alert("Hata: " + e.message); }
}

async function deleteCurrentContent() {
    if (!activeLessonId || !confirm("Silinsin mi?")) return;
    const topicId = document.getElementById('editTopicId').value;
    await deleteDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId));
    loadContents(topicId);
    showTopicSettings();
}

// --- DERS MATERYAL MANTIĞI ---
function addMaterial(type) {
    currentMaterials.push({ id: Date.now(), type, title: '', url: '' });
    renderMaterials();
}
function removeMaterial(id) {
    currentMaterials = currentMaterials.filter(m => m.id !== id);
    renderMaterials();
}
function renderMaterials() {
    const div = document.getElementById('materialsList');
    div.innerHTML = currentMaterials.map(m => `
        <div class="card p-2 mb-2">
            <div class="d-flex justify-content-between">
                <strong>${m.type.toUpperCase()}</strong>
                <button class="btn btn-sm btn-danger py-0" onclick="removeMaterial(${m.id})">x</button>
            </div>
            <input type="text" class="form-control form-control-sm mb-1" placeholder="Başlık" value="${m.title}" oninput="currentMaterials.find(x=>x.id==${m.id}).title=this.value">
            <input type="text" class="form-control form-control-sm" placeholder="URL/İçerik" value="${m.url}" oninput="currentMaterials.find(x=>x.id==${m.id}).url=this.value">
        </div>
    `).join('');
}

// ==========================================
// --- YENİ TEST SİHİRBAZI (SMART ENGINE) ---
// ==========================================

// 1. Heatmap: Soru yoğunluğunu göster
async function renderHeatmap(legCode) {
    if (!legCode) return;
    const container = document.getElementById('legislationHeatmap');
    container.innerHTML = '<small>Analiz ediliyor...</small>';

    // Veritabanından sadece bu kanuna ait soruların madde numaralarını çekelim
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

    // Görselleştirme (Her %2'lik dilim bir blok olsun)
    container.innerHTML = '';
    const range = maxArt || 100;
    const step = Math.ceil(range / 50); // Toplam 50 blok

    for (let i = 1; i <= range; i += step) {
        let total = 0;
        for (let j = 0; j < step; j++) total += (counts[i + j] || 0);

        const div = document.createElement('div');
        div.className = 'heatmap-segment';
        div.style.flex = '1';
        // Renk Skalası
        if (total === 0) div.style.background = '#e9ecef';
        else if (total < 3) div.style.background = '#ffe69c'; // Sarı
        else if (total < 5) div.style.background = '#fd7e14'; // Turuncu
        else div.style.background = '#198754'; // Yeşil

        div.title = `Md. ${i}-${i + step}: ${total} Soru`;
        div.onclick = () => {
            document.getElementById('wizStart').value = i;
            document.getElementById('wizEnd').value = i + step;
        };
        container.appendChild(div);
    }
}

// 2. Akıllı Sorgu
async function runSmartQuery() {
    const code = document.getElementById('wizLegislation').value;
    const start = parseInt(document.getElementById('wizStart').value);
    const end = parseInt(document.getElementById('wizEnd').value);

    if (!code) return alert("Mevzuat seçiniz.");

    const poolDiv = document.getElementById('questionPoolList');
    poolDiv.innerHTML = 'Yükleniyor...';

    // Firestore'dan çek
    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), limit(50));
    const snap = await getDocs(q);

    const candidates = [];
    snap.forEach(doc => {
        const d = doc.data();
        const art = parseInt(d.legislationRef?.article);

        // Client-side Aralık Filtresi
        if (!isNaN(art) && (!start || art >= start) && (!end || art <= end)) {
            candidates.push({ id: doc.id, ...d, artNo: art });
        }
    });

    // Madde sırasına göre diz
    candidates.sort((a, b) => a.artNo - b.artNo);

    // Listele
    poolDiv.innerHTML = '';
    if (candidates.length === 0) {
        poolDiv.innerHTML = '<div class="text-center p-3">Bu kriterlere uygun soru bulunamadı.</div>';
        return;
    }

    candidates.forEach(q => {
        const div = document.createElement('div');
        div.className = 'pool-item';
        // Zaten ekliyse belirginleştir
        const isAdded = currentTestQuestions.some(x => x.id === q.id);
        if (isAdded) div.style.opacity = '0.5';

        div.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>Md. ${q.artNo}</strong>
                <span class="badge bg-light text-dark border">Zorluk: ${q.difficulty || 3}</span>
            </div>
            <div class="mt-1 text-truncate">${q.text}</div>
        `;
        div.onclick = () => addQuestionToTest(q);
        poolDiv.appendChild(div);
    });
}

// 3. Test Kağıdı Yönetimi
function addQuestionToTest(question) {
    if (currentTestQuestions.some(q => q.id === question.id)) return;

    currentTestQuestions.push({
        id: question.id,
        text: question.text,
        options: question.options,
        correctOption: question.correctOption,
        solution: question.solution,
        legislationRef: question.legislationRef
    });

    renderTestPaper();
}

function removeQuestionFromTest(index) {
    currentTestQuestions.splice(index, 1);
    renderTestPaper();
}

function renderTestPaper() {
    const container = document.getElementById('testPaperList');
    document.getElementById('testQCount').innerText = currentTestQuestions.length;

    container.innerHTML = currentTestQuestions.map((q, i) => `
        <div class="paper-item">
            <div class="paper-index">${i + 1}.</div>
            <div style="flex:1">
                <div class="small fw-bold text-muted">${q.legislationRef?.code} / Md. ${q.legislationRef?.article}</div>
                <div>${q.text.substring(0, 100)}...</div>
            </div>
            <button class="btn btn-sm text-danger" onclick="removeQuestionFromTest(${i})">🗑️</button>
        </div>
    `).join('');
}

// --- DİĞER YARDIMCI FONKSİYONLAR ---

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
