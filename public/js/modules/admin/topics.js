import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// --- GLOBAL STATE ---
// ============================================================
let state = {
    allTopics: [],
    currentLessons: [],
    activeTopicId: null,
    activeLessonId: null,
    activeLessonType: 'lesson',
    tempMaterials: [],
    tempQuestions: [], // Test kağıdındaki sorular
    poolQuestions: [], // Havuzdaki sorular (Arama sonucu)
    legislationList: new Set()
};

// ============================================================
// --- INIT ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro v4 (Fixed) Başlatılıyor...");
    renderMainInterface();

    // Global API (HTML'den erişim için)
    window.Studio = {
        open: openEditor,
        close: () => document.getElementById('topicModal').style.display = 'none',
        settings: showMetaEditor, // Düzeltildi: Artık state'e buradan erişecek
        saveMeta: saveTopicMeta,
        newContent: createNewContent,
        selectContent: selectContentItem,
        saveContent: saveContent,
        deleteContent: deleteContent,
        addMat: addMaterialUI,
        removeMat: removeMaterialUI,
        updateMat: updateMaterialItem,
        wizard: {
            search: searchQuestions,
            add: addToTestPaper,
            remove: removeFromTestPaper,
            auto: autoGenerateTest
        },
        trash: { open: openTrash, restore: restoreItem, purge: purgeItem }
    };

    loadTopics();
}

// ============================================================
// --- ARAYÜZ ---
// ============================================================
function renderMainInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Konuları yönetin, ders notları ekleyin ve profesyonel testler oluşturun.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="window.Studio.trash.open()">🗑️ Çöp Kutusu</button>
                <button class="btn btn-primary" onclick="window.Studio.open()">➕ Yeni Konu</button>
            </div>
        </div>

        <!-- Arama ve Filtreleme -->
        <div class="card mb-4 p-3 border-0 shadow-sm">
            <div class="row g-2 align-items-center">
                <div class="col-md-5">
                    <input type="text" id="searchTopic" class="form-control" placeholder="Konu başlığı ara..." oninput="filterTopics()">
                </div>
                <div class="col-md-3">
                    <select id="filterCategory" class="form-select" onchange="filterTopics()">
                        <option value="all">Tüm Kategoriler</option>
                        <option value="ortak">Ortak Konular</option>
                        <option value="alan">Alan Konuları</option>
                    </select>
                </div>
                <div class="col-md-4 text-end">
                    <span class="badge bg-secondary" id="topicCountBadge">Yükleniyor...</span>
                </div>
            </div>
        </div>

        <!-- Liste -->
        <div class="card">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th style="width:50px">Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>İçerik</th>
                            <th>Durum</th>
                            <th style="width:100px">İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <!-- STUDIO MODAL -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content">
                
                <div class="studio-header">
                    <div class="studio-title"><span class="icon">⚡</span> İçerik Stüdyosu</div>
                    <button class="close-btn" onclick="window.Studio.close()">&times;</button>
                </div>

                <div class="studio-layout">
                    <!-- SOL PANEL -->
                    <div class="studio-sidebar">
                        <div class="d-grid gap-2 mb-3">
                            <button class="btn btn-secondary btn-sm" onclick="window.Studio.newContent('lesson')">📄 Ders Notu</button>
                            <button class="btn btn-warning btn-sm" style="color:#000" onclick="window.Studio.newContent('test')">📝 Test Oluştur</button>
                        </div>
                        
                        <div class="sidebar-section-title">İÇERİK AKIŞI</div>
                        <div id="contentListNav"></div>

                        <div class="mt-auto pt-3 border-top border-color">
                            <button class="btn btn-secondary w-100 btn-sm" onclick="window.Studio.settings()">⚙️ Konu Ayarları</button>
                        </div>
                    </div>

                    <!-- SAĞ PANEL -->
                    <div class="studio-editor">
                        
                        <!-- A. KONU AYARLARI -->
                        <div id="metaEditor" class="editor-workspace">
                            <div class="studio-card" style="max-width:800px; margin:0 auto;">
                                <h3 class="mb-4">Konu Bilgileri</h3>
                                <form id="topicMetaForm" onsubmit="event.preventDefault(); window.Studio.saveMeta();">
                                    <input type="hidden" id="editTopicId">
                                    <div class="form-group">
                                        <label>Konu Başlığı</label>
                                        <input type="text" id="inpTopicTitle" class="form-control" required>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6 form-group">
                                            <label>Sıra No</label>
                                            <input type="number" id="inpTopicOrder" class="form-control">
                                        </div>
                                        <div class="col-md-6 form-group">
                                            <label>Kategori</label>
                                            <select id="inpTopicCategory" class="form-control">
                                                <option value="ortak">Ortak Konular</option>
                                                <option value="alan">Alan Konuları</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Durum</label>
                                        <select id="inpTopicStatus" class="form-control">
                                            <option value="true">Yayında</option>
                                            <option value="false">Taslak</option>
                                        </select>
                                    </div>
                                    <button type="submit" class="btn btn-primary w-100 mt-3">Kaydet</button>
                                </form>
                            </div>
                        </div>

                        <!-- B. İÇERİK EDİTÖRÜ -->
                        <div id="contentEditor" style="display:none; flex-direction:column; height:100%;">
                            
                            <div class="editor-toolbar">
                                <div class="editor-title-group">
                                    <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="Başlık giriniz...">
                                </div>
                                <div class="editor-actions">
                                    <input type="number" id="inpContentOrder" placeholder="Sıra" title="Sıralama">
                                    <div class="vr-separator"></div>
                                    <button class="btn btn-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                    <button class="btn btn-success btn-sm" onclick="window.Studio.saveContent()">Kaydet</button>
                                </div>
                            </div>

                            <div class="editor-workspace p-0">
                                
                                <!-- 1. DERS NOTU MODU -->
                                <div id="wsLessonMode" class="p-4" style="max-width:1000px; margin:0 auto;">
                                    <div class="d-flex justify-content-center gap-2 mb-4">
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('html')">+ Metin</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('pdf')">+ PDF</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('video')">+ Video</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('podcast')">+ Podcast</button>
                                    </div>
                                    <div id="materialsContainer"></div>
                                </div>

                                <!-- 2. TEST SİHİRBAZI MODU (3 Sütunlu) -->
                                <div id="wsTestMode" class="h-100 p-3" style="display:none;">
                                    <div class="wizard-grid">
                                        
                                        <!-- Sol: Filtreler -->
                                        <div class="wizard-col">
                                            <div class="wizard-header">1. FİLTRELEME</div>
                                            <div class="wizard-body">
                                                <div class="form-group">
                                                    <label>Mevzuat Kaynağı</label>
                                                    <select id="wizLegislation" class="form-select">
                                                        <option value="">Yükleniyor...</option>
                                                    </select>
                                                </div>
                                                <div class="form-group">
                                                    <label>Madde Aralığı</label>
                                                    <div class="d-flex gap-2">
                                                        <input type="number" id="wizStart" class="form-control" placeholder="Baş">
                                                        <input type="number" id="wizEnd" class="form-control" placeholder="Son">
                                                    </div>
                                                </div>
                                                <button class="btn btn-primary w-100 mb-3" onclick="window.Studio.wizard.search()">
                                                    🔍 Soruları Getir
                                                </button>
                                                
                                                <hr class="border-color">
                                                
                                                <div class="p-3 bg-hover rounded border border-color">
                                                    <strong class="text-gold d-block mb-2">🤖 Otomatik Oluştur</strong>
                                                    <p class="small text-muted mb-2">Seçili mevzuattan rastgele 15 soru seçer.</p>
                                                    <button class="btn btn-warning btn-sm w-100" onclick="window.Studio.wizard.auto()">
                                                        Otomatik Doldur
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Orta: Soru Havuzu -->
                                        <div class="wizard-col">
                                            <div class="wizard-header">
                                                <span>2. SORU HAVUZU</span>
                                                <span class="badge bg-secondary" id="poolCount">0</span>
                                            </div>
                                            <div id="poolList" class="wizard-body">
                                                <div class="text-center text-muted mt-5">Soldan filtre seçip arama yapın.</div>
                                            </div>
                                        </div>

                                        <!-- Sağ: Test Kağıdı -->
                                        <div class="wizard-col">
                                            <div class="wizard-header">
                                                <span>3. TEST KAĞIDI</span>
                                                <span class="badge bg-primary" id="paperCount">0</span>
                                            </div>
                                            <div id="paperList" class="wizard-body">
                                                <div class="text-center text-muted mt-5">Havuzdan soru ekleyin.</div>
                                            </div>
                                        </div>

                                    </div>
                                </div>

                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
        
        <!-- Çöp Kutusu Modal -->
        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content" style="max-width:600px; height:auto; max-height:80vh;">
                <div class="modal-header"><h3>Çöp Kutusu</h3><button class="close-btn" onclick="document.getElementById('trashModal').style.display='none'">&times;</button></div>
                <div class="modal-body-scroll"><table class="admin-table"><tbody id="trashTableBody"></tbody></table></div>
            </div>
        </div>
    `;
}

// ============================================================
// --- VERİ YÖNETİMİ ---
// ============================================================

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), orderBy("order", "asc"));
    const snap = await getDocs(q);

    state.allTopics = [];
    snap.forEach(doc => {
        const d = doc.data();
        if (d.status !== 'deleted') {
            state.allTopics.push({ id: doc.id, ...d });
        }
    });

    window.filterTopics();
}

window.filterTopics = () => {
    const search = document.getElementById('searchTopic') ? document.getElementById('searchTopic').value.toLowerCase() : '';
    const cat = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : 'all';
    const tbody = document.getElementById('topicsTableBody');
    const badge = document.getElementById('topicCountBadge');

    if (!tbody) return;

    const filtered = state.allTopics.filter(t =>
        (cat === 'all' || t.category === cat) &&
        (t.title || '').toLowerCase().includes(search)
    );

    if (badge) badge.innerText = `${filtered.length} Kayıt`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Kayıt bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge bg-dark border border-secondary">${t.category}</span></td>
            <td>${t.lessonCount || 0} İçerik</td>
            <td>${t.isActive ? '<span class="text-success">Yayında</span>' : '<span class="text-muted">Taslak</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button>
            </td>
        </tr>
    `).join('');
};

// ============================================================
// --- STUDIO MANTIĞI ---
// ============================================================

async function openEditor(id = null, forceSettings = false) {
    document.getElementById('topicModal').style.display = 'flex';
    document.getElementById('contentListNav').innerHTML = '';
    state.activeTopicId = id;

    // Mevzuat listesini doldur
    fetchLegislationCodes();

    if (id) {
        const topic = state.allTopics.find(t => t.id === id);
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = topic.title;
        document.getElementById('inpTopicOrder').value = topic.order;
        document.getElementById('inpTopicCategory').value = topic.category;
        document.getElementById('inpTopicStatus').value = topic.isActive.toString();

        await loadLessons(id);

        if (forceSettings || state.currentLessons.length === 0) {
            showMetaEditor();
        } else {
            selectContentItem(state.currentLessons[0].id);
        }
    } else {
        document.getElementById('topicMetaForm').reset();
        document.getElementById('editTopicId').value = "";
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    const list = document.getElementById('contentListNav');
    list.innerHTML = '<div class="text-center p-2 text-muted">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);

    state.currentLessons = [];
    snap.forEach(doc => state.currentLessons.push({ id: doc.id, ...doc.data() }));

    renderContentNav();
}

function renderContentNav() {
    const list = document.getElementById('contentListNav');
    list.innerHTML = state.currentLessons.map(l => `
        <div class="content-nav-item ${state.activeLessonId === l.id ? 'active' : ''}" 
             onclick="window.Studio.selectContent('${l.id}')">
            <span class="nav-item-icon">${l.type === 'test' ? '📝' : '📄'}</span>
            <div class="nav-item-meta">
                <div class="nav-item-title">${l.title}</div>
                <div class="nav-item-sub">Sıra: ${l.order}</div>
            </div>
        </div>
    `).join('');
}

function showMetaEditor() {
    document.getElementById('metaEditor').style.display = 'block';
    document.getElementById('contentEditor').style.display = 'none';
    state.activeLessonId = null;
    renderContentNav();
}

async function saveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;
    if (!title) return alert("Başlık giriniz.");

    const data = {
        title,
        order: parseInt(document.getElementById('inpTopicOrder').value) || 0,
        category: document.getElementById('inpTopicCategory').value,
        isActive: document.getElementById('inpTopicStatus').value === 'true',
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
            state.activeTopicId = ref.id;
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Kaydedildi.");
        loadTopics();
    } catch (e) { alert(e.message); }
}

// --- İÇERİK YÖNETİMİ ---

function createNewContent(type) {
    if (!state.activeTopicId) return alert("Önce konuyu kaydedin.");
    state.activeLessonId = null;
    state.activeLessonType = type;

    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';
    renderContentNav();

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentTitle').focus();
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;

    const badge = document.getElementById('editorBadge');
    if (type === 'test') {
        badge.innerText = "TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS";
        badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
        state.tempMaterials = [];
        renderMaterials();
    }
}

function selectContentItem(id) {
    const item = state.currentLessons.find(x => x.id === id);
    if (!item) return;

    state.activeLessonId = id;
    state.activeLessonType = item.type || 'lesson';

    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';
    document.getElementById('inpContentTitle').value = item.title;
    document.getElementById('inpContentOrder').value = item.order;

    renderContentNav();

    const badge = document.getElementById('editorBadge');
    if (state.activeLessonType === 'test') {
        badge.innerText = "TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = item.questions || [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS";
        badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
        state.tempMaterials = item.materials || [];
        renderMaterials();
    }
}

async function saveContent() {
    const title = document.getElementById('inpContentTitle').value;
    if (!title) return alert("Başlık giriniz.");

    const data = {
        title,
        type: state.activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value),
        isActive: true,
        updatedAt: serverTimestamp()
    };

    if (state.activeLessonType === 'test') {
        data.questions = state.tempQuestions;
        data.qCount = state.tempQuestions.length;
    } else {
        data.materials = state.tempMaterials;
    }

    try {
        if (state.activeLessonId) {
            await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${state.activeTopicId}/lessons`), data);
            await updateDoc(doc(db, "topics", state.activeTopicId), { lessonCount: state.currentLessons.length + 1 });
        }

        // Görsel Geri Bildirim
        const btn = document.querySelector('#contentEditor .btn-success');
        const old = btn.innerHTML;
        btn.innerHTML = '✓';
        setTimeout(() => btn.innerHTML = old, 1000);

        loadLessons(state.activeTopicId);
    } catch (e) { alert(e.message); }
}

async function deleteContent() {
    if (!state.activeLessonId) return;
    if (confirm("Silmek istiyor musunuz?")) {
        await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId));
        loadLessons(state.activeTopicId);
        showMetaEditor();
    }
}

// --- MATERYAL YÖNETİMİ ---
function addMaterialUI(type) {
    state.tempMaterials.push({ id: Date.now(), type, title: '', url: '' });
    renderMaterials();
}
function removeMaterialUI(id) {
    state.tempMaterials = state.tempMaterials.filter(m => m.id !== id);
    renderMaterials();
}
function updateMaterialItem(id, field, value) {
    const item = state.tempMaterials.find(m => m.id === id);
    if (item) item[field] = value;
}
function renderMaterials() {
    const container = document.getElementById('materialsContainer');
    container.innerHTML = state.tempMaterials.map(m => `
        <div class="material-row">
            <div class="h4 m-0">${m.type === 'video' ? '▶️' : m.type === 'podcast' ? '🎧' : m.type === 'pdf' ? '📄' : '📝'}</div>
            <div style="flex:1;">
                <div class="d-flex justify-content-between mb-1">
                    <span class="badge bg-secondary">${m.type.toUpperCase()}</span>
                    <button class="btn btn-sm text-danger p-0" onclick="window.Studio.removeMat(${m.id})">&times;</button>
                </div>
                <input type="text" class="form-control form-control-sm mb-2" placeholder="Başlık" value="${m.title}" 
                    oninput="window.Studio.updateMat(${m.id}, 'title', this.value)">
                ${m.type === 'html'
            ? `<textarea class="form-control form-control-sm" rows="3" placeholder="İçerik..." oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm" placeholder="URL" value="${m.url}" oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">`
        }
            </div>
        </div>
    `).join('');
}

// ============================================================
// --- TEST SİHİRBAZI (GELİŞMİŞ) ---
// ============================================================

async function fetchLegislationCodes() {
    const select = document.getElementById('wizLegislation');
    if (!select) return;

    if (state.legislationList.size > 0) {
        populateLegislationSelect();
        return;
    }

    try {
        // 5000 soruya kadar tara (Daha geniş kapsam)
        const q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(5000));
        const snap = await getDocs(q);

        const codes = new Set();
        // Standartlar
        ["2709", "657", "5271", "5237", "2577", "4483", "3628", "5018", "4982", "3071", "7201"].forEach(c => codes.add(c));

        snap.forEach(doc => {
            const code = doc.data().legislationRef?.code;
            if (code) codes.add(code);
        });

        state.legislationList = codes;
        populateLegislationSelect();

    } catch (e) { console.error("Mevzuat çekilemedi", e); }
}

function populateLegislationSelect() {
    const select = document.getElementById('wizLegislation');
    const sorted = Array.from(state.legislationList).sort();
    select.innerHTML = '<option value="">Seçiniz...</option>' +
        sorted.map(c => `<option value="${c}">${c} Sayılı Kanun</option>`).join('');
}

async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value;
    const s = parseInt(document.getElementById('wizStart').value);
    const e = parseInt(document.getElementById('wizEnd').value);
    const list = document.getElementById('poolList');

    if (!code) return alert("Mevzuat seçiniz");

    list.innerHTML = '<div class="text-center mt-4">Aranıyor...</div>';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
    const snap = await getDocs(q);

    const arr = [];
    snap.forEach(d => {
        const art = parseInt(d.data().legislationRef?.article);
        if (!isNaN(art) && (!s || art >= s) && (!e || art <= e)) {
            arr.push({ id: d.id, ...d.data(), artNo: art });
        }
    });

    arr.sort((a, b) => a.artNo - b.artNo);
    state.poolQuestions = arr;

    renderPoolList();
}

function renderPoolList() {
    const list = document.getElementById('poolList');
    document.getElementById('poolCount').innerText = state.poolQuestions.length;

    if (state.poolQuestions.length === 0) {
        list.innerHTML = '<div class="text-center mt-4 text-muted">Soru bulunamadı.</div>';
        return;
    }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        return `
            <div class="q-pool-item ${isAdded ? 'added' : ''}" onclick="window.Studio.wizard.add('${q.id}')">
                <div class="q-meta">
                    <strong>Md. ${q.artNo}</strong>
                    ${isAdded ? '✅ Eklendi' : ''}
                </div>
                <div class="q-text">${q.text}</div>
            </div>
        `;
    }).join('');
}

function addToTestPaper(id) {
    const q = state.poolQuestions.find(x => x.id === id);
    if (q && !state.tempQuestions.some(x => x.id === id)) {
        state.tempQuestions.push(q);
        renderTestPaper();
        renderPoolList(); // Güncelle (Disable etmek için)
    }
}

function removeFromTestPaper(idx) {
    state.tempQuestions.splice(idx, 1);
    renderTestPaper();
    renderPoolList(); // Güncelle (Enable etmek için)
}

function renderTestPaper() {
    const list = document.getElementById('paperList');
    document.getElementById('paperCount').innerText = state.tempQuestions.length;

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="q-paper-item">
            <div class="q-paper-number">${i + 1}.</div>
            <div style="flex:1; overflow:hidden;">
                <div class="small fw-bold text-primary">Md. ${q.artNo}</div>
                <div class="text-truncate text-muted small">${q.text}</div>
            </div>
            <button class="btn btn-sm text-danger p-0" onclick="window.Studio.wizard.remove(${i})">&times;</button>
        </div>
    `).join('');
}

function autoGenerateTest() {
    if (state.poolQuestions.length === 0) return alert("Önce arama yapın.");

    // Rastgele 15 soru seç
    const shuffled = [...state.poolQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 15);

    // Madde sırasına diz
    selected.sort((a, b) => a.artNo - b.artNo);

    state.tempQuestions = selected;
    renderTestPaper();
    renderPoolList();
}

// --- ÇÖP KUTUSU ---
async function openTrash() {
    document.getElementById('trashModal').style.display = 'flex';
    const tbody = document.getElementById('trashTableBody');
    tbody.innerHTML = '<tr><td>Yükleniyor...</td></tr>';
    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snap = await getDocs(q);
    tbody.innerHTML = snap.empty ? '<tr><td>Boş</td></tr>' : snap.docs.map(d => `
        <tr>
            <td>${d.data().title}</td>
            <td class="text-end">
                <button class="btn btn-success btn-sm" onclick="window.Studio.trash.restore('${d.id}')">Geri Al</button>
                <button class="btn btn-danger btn-sm" onclick="window.Studio.trash.purge('${d.id}')">Yok Et</button>
            </td>
        </tr>
    `).join('');
}
async function restoreItem(id) { await updateDoc(doc(db, "topics", id), { status: 'active' }); openTrash(); loadTopics(); }
async function purgeItem(id) { if (confirm("Kalıcı silinsin mi?")) { await deleteDoc(doc(db, "topics", id)); openTrash(); } }