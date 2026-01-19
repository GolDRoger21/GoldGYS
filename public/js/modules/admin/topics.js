import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// --- MODÜL DURUM YÖNETİMİ (STATE) ---
// ==========================================
let state = {
    modalElement: null,
    allTopics: [],
    currentLessons: [],
    activeLessonId: null,
    activeLessonType: 'lesson', // 'lesson' | 'test'

    // Düzenlenen içerik verileri
    tempMaterials: [],
    tempQuestions: []
};

// ==========================================
// --- BAŞLATMA VE GLOBAL TANIMLAMALAR ---
// ==========================================

export function initTopicsPage() {
    console.log("🚀 Topics Modülü Başlatıldı");
    renderInterface();
    exposeGlobalFunctions(); // HTML onclick'lerin çalışması için şart
    loadTopics();
}

// Butonların HTML içinden erişebilmesi için window'a bağlıyoruz
function exposeGlobalFunctions() {
    window.TopicsModule = {
        openEditor: openTopicEditor,
        closeModal: () => document.getElementById('topicModal').style.display = 'none',
        saveTopicMeta: handleSaveTopicMeta,
        addNewContent: addNewContentUI,
        selectContent: selectContent,
        saveContent: saveCurrentContent,
        deleteContent: deleteCurrentContent,
        addMaterial: addMaterial,
        removeMaterial: removeMaterial,
        softDeleteTopic: softDeleteTopic,
        trash: {
            open: openTrashModal,
            restore: restoreItem,
            purge: permanentDelete
        },
        wizard: {
            renderHeatmap: renderHeatmap,
            runQuery: runSmartQuery,
            addQuestion: addQuestionToTest,
            removeQuestion: removeQuestionFromTest
        },
        showTopicSettings: showTopicSettings
    };
}

// ==========================================
// --- ANA ARAYÜZ (RENDER) ---
// ==========================================

function renderInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Eğitim materyallerini, testleri ve müfredat yapısını buradan yönetin.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="window.TopicsModule.trash.open()">🗑️ Çöp Kutusu</button>
                <button class="btn btn-primary" onclick="window.TopicsModule.openEditor()">➕ Yeni Ana Konu</button>
            </div>
        </div>
        
        <div class="card mb-4 p-3">
            <div class="row g-3 align-items-center">
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

        <div class="card">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th style="width:50px">Sıra</th>
                            <th>Başlık</th>
                            <th>Kategori</th>
                            <th>İçerik</th>
                            <th>Durum</th>
                            <th class="text-end">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                
                <div class="modal-header">
                    <h3 id="topicModalTitle" class="m-0">İçerik Stüdyosu</h3>
                    <button class="close-btn" onclick="window.TopicsModule.closeModal()">&times;</button>
                </div>
                
                <div class="studio-container">
                    
                    <div class="studio-sidebar">
                        <button class="btn btn-secondary w-100 mb-3 btn-sm" onclick="window.TopicsModule.showTopicSettings()">
                            ⚙️ Ana Konu Ayarları
                        </button>
                        
                        <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                            <span class="small fw-bold text-muted">İÇERİK LİSTESİ</span>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">+ Ekle</button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item" href="#" onclick="window.TopicsModule.addNewContent('lesson')">📄 Ders Notu</a></li>
                                    <li><a class="dropdown-item" href="#" onclick="window.TopicsModule.addNewContent('test')">📝 Sınav / Test</a></li>
                                </ul>
                            </div>
                        </div>
                        <div id="lessonsListContainer"></div>
                    </div>

                    <div class="studio-editor">
                        
                        <div id="topicMetaPanel" class="editor-scroll-area">
                            <h4 class="mb-4 text-primary">Ana Konu Bilgileri</h4>
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
                                    <div class="col-12 text-end mt-3">
                                        <button type="button" class="btn btn-success" onclick="window.TopicsModule.saveTopicMeta()">
                                            ✓ Değişiklikleri Kaydet
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div id="contentEditorPanel" style="display:none; flex-direction:column; height:100%;">
                            
                            <div class="editor-header">
                                <div class="d-flex align-items-center gap-3 flex-grow-1">
                                    <span class="badge bg-secondary" id="contentTypeBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="form-control fw-bold" placeholder="İçerik Başlığı..." style="font-size:1.1rem;">
                                </div>
                                <div class="d-flex align-items-center gap-2 ms-3">
                                    <input type="number" id="inpContentOrder" class="form-control" placeholder="Sıra" style="width:70px;">
                                    <select id="inpContentStatus" class="form-select" style="width:100px;">
                                        <option value="true">Aktif</option>
                                        <option value="false">Pasif</option>
                                    </select>
                                    <button class="btn btn-outline-danger" onclick="window.TopicsModule.deleteContent()">🗑️</button>
                                    <button class="btn btn-success" onclick="window.TopicsModule.saveContent()">💾 Kaydet</button>
                                </div>
                            </div>

                            <div id="lessonWorkspace" class="editor-scroll-area">
                                <div class="card bg-light border-0 mb-3 p-3">
                                    <div class="d-flex gap-2 flex-wrap">
                                        <button class="btn btn-sm btn-outline-dark bg-white" onclick="window.TopicsModule.addMaterial('html')">📝 Metin/HTML</button>
                                        <button class="btn btn-sm btn-outline-danger bg-white" onclick="window.TopicsModule.addMaterial('pdf')">📄 PDF Dosyası</button>
                                        <button class="btn btn-sm btn-outline-danger bg-white" onclick="window.TopicsModule.addMaterial('video')">▶️ Video Link</button>
                                        <button class="btn btn-sm btn-outline-warning bg-white text-dark" onclick="window.TopicsModule.addMaterial('podcast')">🎧 Podcast</button>
                                    </div>
                                </div>
                                <div id="materialsList"></div>
                            </div>

                            <div id="testWorkspace" class="wizard-grid" style="display:none;">
                                
                                <div class="wizard-pool p-3">
                                    <label class="small fw-bold text-muted mb-2">MEVZUAT KAYNAĞI</label>
                                    <select id="wizLegislation" class="form-select form-select-sm mb-2" onchange="window.TopicsModule.wizard.renderHeatmap(this.value)">
                                        <option value="">Seçiniz...</option>
                                        <option value="2709">T.C. Anayasası (2709)</option>
                                        <option value="657">Devlet Memurları K. (657)</option>
                                        <option value="5271">Ceza Muhakemesi K. (5271)</option>
                                        <option value="5237">Türk Ceza Kanunu (5237)</option>
                                        <option value="2577">İYUK (2577)</option>
                                        <option value="4483">Memurlar Yargılanma K. (4483)</option>
                                    </select>

                                    <div id="legislationHeatmap" class="heatmap-track mb-3" title="Soru yoğunluğu"></div>

                                    <div class="row g-1 mb-3">
                                        <div class="col-4"><input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Baş"></div>
                                        <div class="col-4"><input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Son"></div>
                                        <div class="col-4"><button class="btn btn-primary btn-sm w-100" onclick="window.TopicsModule.wizard.runQuery()">Getir</button></div>
                                    </div>

                                    <div id="questionPoolList" class="flex-grow-1 overflow-auto border rounded bg-light p-2">
                                        <div class="text-center text-muted small mt-4">Kriter seçip 'Getir' butonuna basınız.</div>
                                    </div>
                                </div>

                                <div class="wizard-paper p-3">
                                    <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                                        <span class="fw-bold text-primary">📝 TEST KAĞIDI</span>
                                        <span class="badge bg-primary" id="testQCount">0 Soru</span>
                                    </div>
                                    <div id="testPaperList" class="flex-grow-1 overflow-auto"></div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width:800px; height:70vh;">
                <div class="modal-header">
                    <h3>🗑️ Çöp Kutusu</h3>
                    <button class="close-btn" onclick="document.getElementById('trashModal').style.display='none'">&times;</button>
                </div>
                <div class="p-3 flex-grow-1 overflow-auto">
                    <table class="admin-table">
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Event Listenerları Bağla
    bindEvents();
}

function bindEvents() {
    const searchInput = document.getElementById('searchTopic');
    if (searchInput) searchInput.addEventListener('input', filterTopics);

    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) filterSelect.addEventListener('change', filterTopics);
}

// ==========================================
// --- VERİ İŞLEMLERİ (TOPIC CRUD) ---
// ==========================================

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        state.allTopics = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'deleted') {
                state.allTopics.push({ id: doc.id, ...data });
            }
        });

        filterTopics();
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Hata: ${e.message}</td></tr>`;
    }
}

function filterTopics() {
    const search = document.getElementById('searchTopic').value.toLowerCase();
    const cat = document.getElementById('filterCategory').value;
    const tbody = document.getElementById('topicsTableBody');

    const filtered = state.allTopics.filter(t =>
        (cat === 'all' || t.category === cat) &&
        (t.title || '').toLowerCase().includes(search)
    );

    document.getElementById('topicCountBadge').innerText = `${filtered.length} Konu`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Kayıt bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td><span class="fw-bold text-muted">${t.order}</span></td>
            <td>
                <div class="fw-bold">${t.title}</div>
                <small class="text-muted text-truncate d-block" style="max-width:200px">${t.description || ''}</small>
            </td>
            <td><span class="badge bg-light text-dark border">${t.category}</span></td>
            <td><span class="badge bg-info text-dark">${t.lessonCount || 0}</span></td>
            <td>${t.isActive ? '<span class="text-success">● Aktif</span>' : '<span class="text-muted">○ Pasif</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary" onclick="window.TopicsModule.openEditor('${t.id}')">Düzenle</button>
                <button class="btn btn-sm btn-outline-danger" onclick="window.TopicsModule.softDeleteTopic('${t.id}')">Sil</button>
            </td>
        </tr>
    `).join('');
}

// ==========================================
// --- EDİTÖR YÖNETİMİ ---
// ==========================================

async function openTopicEditor(id = null) {
    const modal = document.getElementById('topicModal');
    modal.style.display = 'flex';

    // Reset
    document.getElementById('lessonsListContainer').innerHTML = '';
    showTopicSettings();

    if (id) {
        // Düzenleme Modu
        document.getElementById('editTopicId').value = id;
        document.getElementById('topicModalTitle').innerText = "Konu Düzenle";

        const topic = state.allTopics.find(t => t.id === id);
        if (topic) {
            document.getElementById('inpTopicTitle').value = topic.title;
            document.getElementById('inpTopicOrder').value = topic.order;
            document.getElementById('inpTopicCategory').value = topic.category;
            document.getElementById('inpTopicStatus').value = topic.isActive.toString();
            document.getElementById('inpTopicDesc').value = topic.description || '';

            // İçerikleri Yükle
            loadContents(id);
        }
    } else {
        // Yeni Kayıt Modu
        document.getElementById('topicModalTitle').innerText = "Yeni Konu Ekle";
        document.getElementById('editTopicId').value = "";
        document.getElementById('topicMetaForm').reset();
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        document.getElementById('inpTopicStatus').value = "true";
    }
}

async function loadContents(topicId) {
    const list = document.getElementById('lessonsListContainer');
    list.innerHTML = '<div class="text-center p-2 text-muted">Yükleniyor...</div>';

    try {
        const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
        const snap = await getDocs(q);

        state.currentLessons = [];
        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<div class="text-center p-3 small text-muted">İçerik yok.</div>';
            return;
        }

        snap.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            state.currentLessons.push(data);

            const icon = data.type === 'test' ? '📝' : '📄';
            const div = document.createElement('div');
            div.className = `nav-item ${!data.isActive ? 'text-decoration-line-through text-muted' : ''}`;
            div.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <span>${icon} ${data.title}</span>
                    <small>#${data.order}</small>
                </div>
            `;
            div.onclick = () => selectContent(data.id);
            list.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-danger small">Hata oluştu</div>';
    }
}

function showTopicSettings() {
    document.getElementById('topicMetaPanel').style.display = 'block';
    document.getElementById('contentEditorPanel').style.display = 'none';
    // Sidebar active class temizle
    document.querySelectorAll('.studio-sidebar .nav-item').forEach(e => e.classList.remove('active'));
}

async function handleSaveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;

    if (!title) return alert("Başlık gerekli");

    const data = {
        title,
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
            data.status = 'active';
            data.lessonCount = 0;
            const ref = await addDoc(collection(db, "topics"), data);
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Konu bilgileri kaydedildi.");
        loadTopics(); // Ana listeyi güncelle
    } catch (e) { alert(e.message); }
}

// ==========================================
// --- İÇERİK YÖNETİMİ (LESSON/TEST) ---
// ==========================================

function selectContent(id) {
    state.activeLessonId = id;
    const content = state.currentLessons.find(c => c.id === id);
    if (!content) return;

    state.activeLessonType = content.type || 'lesson';
    renderEditorUI();

    // Verileri Doldur
    document.getElementById('inpContentTitle').value = content.title;
    document.getElementById('inpContentOrder').value = content.order;
    document.getElementById('inpContentStatus').value = content.isActive.toString();

    if (state.activeLessonType === 'test') {
        state.tempQuestions = content.questions || [];
        renderTestPaper();
    } else {
        state.tempMaterials = content.materials || [];
        renderMaterials();
    }
}

function addNewContentUI(type) {
    const topicId = document.getElementById('editTopicId').value;
    if (!topicId) return alert("Önce ana konuyu kaydetmelisiniz.");

    state.activeLessonId = null;
    state.activeLessonType = type;

    renderEditorUI();

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentTitle').focus();
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;
    document.getElementById('inpContentStatus').value = "true";

    if (type === 'test') {
        state.tempQuestions = [];
        renderTestPaper();
    } else {
        state.tempMaterials = [];
        renderMaterials();
    }
}

function renderEditorUI() {
    document.getElementById('topicMetaPanel').style.display = 'none';
    document.getElementById('contentEditorPanel').style.display = 'flex';

    const badge = document.getElementById('contentTypeBadge');
    const lessonWS = document.getElementById('lessonWorkspace');
    const testWS = document.getElementById('testWorkspace');

    if (state.activeLessonType === 'test') {
        badge.innerText = "SINAV";
        badge.className = "badge bg-warning text-dark";
        lessonWS.style.display = 'none';
        testWS.style.display = 'grid'; // Grid display from CSS
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-secondary";
        lessonWS.style.display = 'block';
        testWS.style.display = 'none';
    }
}

// --- KAYDETME VE SİLME ---

async function saveCurrentContent() {
    const topicId = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpContentTitle').value;

    if (!title) return alert("İçerik başlığı giriniz.");

    const data = {
        title,
        type: state.activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value) || 0,
        isActive: document.getElementById('inpContentStatus').value === 'true',
        updatedAt: serverTimestamp()
    };

    if (state.activeLessonType === 'test') {
        data.questions = state.tempQuestions;
        data.questionCount = state.tempQuestions.length;
    } else {
        data.materials = state.tempMaterials;
    }

    try {
        if (state.activeLessonId) {
            await updateDoc(doc(db, `topics/${topicId}/lessons`, state.activeLessonId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${topicId}/lessons`), data);
        }

        // UI Feedback
        const btn = document.querySelector('#contentEditorPanel .btn-success');
        const oldTxt = btn.innerText;
        btn.innerText = "✓ Kaydedildi";
        setTimeout(() => btn.innerText = oldTxt, 2000);

        loadContents(topicId);
    } catch (e) { alert(e.message); }
}

async function deleteCurrentContent() {
    if (!state.activeLessonId) return;
    if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;

    const topicId = document.getElementById('editTopicId').value;
    await deleteDoc(doc(db, `topics/${topicId}/lessons`, state.activeLessonId));

    showTopicSettings();
    loadContents(topicId);
}

// ==========================================
// --- MATERYAL YÖNETİMİ (PDF, VİDEO, PODCAST) ---
// ==========================================

function addMaterial(type) {
    state.tempMaterials.push({
        id: Date.now(),
        type: type,
        title: '',
        url: ''
    });
    renderMaterials();
}

function removeMaterial(id) {
    state.tempMaterials = state.tempMaterials.filter(m => m.id !== id);
    renderMaterials();
}

function renderMaterials() {
    const container = document.getElementById('materialsList');
    container.innerHTML = state.tempMaterials.map(m => {
        let icon = '📄';
        let placeholder = 'Dosya URL';
        let badgeColor = 'bg-secondary';

        if (m.type === 'video') { icon = '▶️'; placeholder = 'Video URL (YouTube vs)'; badgeColor = 'bg-danger'; }
        if (m.type === 'podcast') { icon = '🎧'; placeholder = 'Podcast URL (Spotify/MP3)'; badgeColor = 'bg-warning text-dark'; }
        if (m.type === 'html') { icon = '📝'; placeholder = 'İçerik metni...'; badgeColor = 'bg-info text-dark'; }

        const inputHtml = m.type === 'html'
            ? `<textarea class="form-control mt-2" rows="3" placeholder="${placeholder}" oninput="window.TopicsModule.tempMaterialsUpdate(${m.id}, 'url', this.value)">${m.url}</textarea>`
            : `<input type="text" class="form-control mt-2" placeholder="${placeholder}" value="${m.url}" oninput="window.TopicsModule.tempMaterialsUpdate(${m.id}, 'url', this.value)">`;

        return `
            <div class="material-card">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="material-type-badge ${badgeColor}">${icon} ${m.type}</span>
                    <button class="btn btn-sm text-danger" onclick="window.TopicsModule.removeMaterial(${m.id})">&times;</button>
                </div>
                <input type="text" class="form-control form-control-sm fw-bold" placeholder="Başlık" value="${m.title}" oninput="window.TopicsModule.tempMaterialsUpdate(${m.id}, 'title', this.value)">
                ${inputHtml}
            </div>
        `;
    }).join('');
}

// Helper for inputs
window.TopicsModule = window.TopicsModule || {};
window.TopicsModule.tempMaterialsUpdate = (id, field, value) => {
    const item = state.tempMaterials.find(m => m.id === id);
    if (item) item[field] = value;
};

// ==========================================
// --- TEST SİHİRBAZI (WIZARD) ---
// ==========================================

async function renderHeatmap(code) {
    if (!code) return;
    const container = document.getElementById('legislationHeatmap');
    container.innerHTML = '<small>Analiz ediliyor...</small>';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
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
    const limit = maxArt || 100;
    const step = Math.ceil(limit / 40);

    for (let i = 1; i <= limit; i += step) {
        let total = 0;
        for (let j = 0; j < step; j++) total += (counts[i + j] || 0);

        const div = document.createElement('div');
        div.className = 'heatmap-segment';
        div.style.flex = '1';
        div.style.marginRight = '1px';
        div.title = `Md. ${i}-${i + step}: ${total} Soru`;

        // Renklendirme
        if (total === 0) div.style.background = '#e9ecef';
        else if (total < 3) div.style.background = '#ffe69c';
        else div.style.background = '#198754';

        div.onclick = () => {
            document.getElementById('wizStart').value = i;
            document.getElementById('wizEnd').value = i + step;
        };
        container.appendChild(div);
    }
}

async function runSmartQuery() {
    const code = document.getElementById('wizLegislation').value;
    const start = parseInt(document.getElementById('wizStart').value);
    const end = parseInt(document.getElementById('wizEnd').value);

    if (!code) return alert("Mevzuat seçiniz");

    const list = document.getElementById('questionPoolList');
    list.innerHTML = 'Yükleniyor...';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), limit(100));
    const snap = await getDocs(q);

    const candidates = [];
    snap.forEach(doc => {
        const d = doc.data();
        if (d.isDeleted) return;
        const art = parseInt(d.legislationRef?.article);
        if (!isNaN(art) && (!start || art >= start) && (!end || art <= end)) {
            candidates.push({ id: doc.id, ...d, artNo: art });
        }
    });

    candidates.sort((a, b) => a.artNo - b.artNo);
    list.innerHTML = '';

    if (candidates.length === 0) {
        list.innerHTML = '<div class="text-center p-3 text-muted">Soru bulunamadı.</div>';
        return;
    }

    candidates.forEach(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        const div = document.createElement('div');
        div.className = 'pool-item'; // CSS'ten geliyor
        div.style.opacity = isAdded ? '0.5' : '1';
        div.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>Md. ${q.artNo}</strong>
                <span class="badge bg-light text-dark border">${q.difficulty || 3}</span>
            </div>
            <div class="small text-truncate">${q.text}</div>
        `;
        div.onclick = () => addQuestionToTest(q);
        list.appendChild(div);
    });
}

function addQuestionToTest(q) {
    if (state.tempQuestions.some(x => x.id === q.id)) return;

    state.tempQuestions.push({
        id: q.id,
        text: q.text,
        options: q.options,
        correctOption: q.correctOption,
        solution: q.solution,
        legislationRef: q.legislationRef
    });
    renderTestPaper();
    runSmartQuery(); // Opaklığı güncelle
}

function removeQuestionFromTest(index) {
    state.tempQuestions.splice(index, 1);
    renderTestPaper();
    runSmartQuery();
}

function renderTestPaper() {
    const list = document.getElementById('testPaperList');
    document.getElementById('testQCount').innerText = `${state.tempQuestions.length} Soru`;

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="paper-item">
            <span class="paper-index">${i + 1}.</span>
            <div class="flex-grow-1">
                <div class="small fw-bold text-primary">${q.legislationRef?.code} / Md. ${q.legislationRef?.article}</div>
                <div class="small text-truncate">${q.text}</div>
            </div>
            <button class="btn btn-sm text-danger" onclick="window.TopicsModule.wizard.removeQuestion(${i})">&times;</button>
        </div>
    `).join('');
}

// ==========================================
// --- ÇÖP KUTUSU ---
// ==========================================

async function softDeleteTopic(id) {
    if (confirm("Silmek istiyor musunuz?")) {
        await updateDoc(doc(db, "topics", id), {
            status: 'deleted',
            deletedAt: serverTimestamp(),
            isActive: false
        });
        loadTopics();
    }
}

async function openTrashModal() {
    document.getElementById('trashModal').style.display = 'flex';
    const tbody = document.getElementById('trashTableBody');
    tbody.innerHTML = 'Yükleniyor...';

    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snap = await getDocs(q);

    tbody.innerHTML = '';
    if (snap.empty) {
        tbody.innerHTML = '<tr><td class="text-center">Boş</td></tr>';
        return;
    }

    snap.forEach(doc => {
        const d = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.title}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-success" onclick="window.TopicsModule.trash.restore('${doc.id}')">Geri Al</button>
                <button class="btn btn-sm btn-danger" onclick="window.TopicsModule.trash.purge('${doc.id}')">Yok Et</button>
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
    if (confirm("Kalıcı olarak silinecek!")) {
        await deleteDoc(doc(db, "topics", id));
        openTrashModal();
    }
}