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
    tempQuestions: [],
    poolQuestions: [],
    legislationList: new Set(),
    sortable: null, // Sürükle bırak instance
    sidebarTab: 'lesson', // 'lesson' veya 'test' (Sidebar sekmesi için)
    poolFilters: {        // Gelişmiş soru havuzu filtresi için
        difficulty: '',
        text: ''
    }
};

// ============================================================
// --- INIT ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro v5 (Ultimate) Başlatılıyor...");
    renderMainInterface();

    window.Studio = {
        open: openEditor,
        close: () => document.getElementById('topicModal').style.display = 'none',
        settings: showMetaEditor,
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
            auto: autoGenerateTest,
            fullEdit: (id) => {
                if (window.QuestionBank && window.QuestionBank.openEditor) {
                    window.QuestionBank.openEditor(id);
                } else {
                    alert("Soru Bankası modülü yüklenmedi. Sayfayı yenileyin.");
                }
            },
            closeQ: () => document.getElementById('quickEditModal').style.display = 'none'
        },
        trash: { open: openTrash, restore: restoreItem, purge: purgeItem },
        toggleGroup: toggleSidebarGroup // Yeni
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
                        
                        <div id="contentListNav"></div> <!-- Akordiyon buraya gelecek -->

                        <div class="mt-auto pt-3 border-top border-color">
                            <button class="btn btn-outline w-100 btn-sm" onclick="window.Studio.settings()">⚙️ Konu Ayarları</button>
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
                                    <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="Başlık giriniz (Boşsa otomatik atanır)...">
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
                                        <button class="btn btn-sm btn-outline" onclick="window.Studio.addMat('html')">+ Metin</button>
                                        <button class="btn btn-sm btn-outline" onclick="window.Studio.addMat('pdf')">+ PDF</button>
                                        <button class="btn btn-sm btn-outline" onclick="window.Studio.addMat('video')">+ Video</button>
                                        <button class="btn btn-sm btn-outline" onclick="window.Studio.addMat('podcast')">+ Podcast</button>
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
                                                <label class="small text-muted">Mevzuat / Kaynak</label>
                                                <input type="text" id="wizSourceDisplay" class="form-control mb-2" readonly style="background:var(--bg-body); font-weight:bold;">
                                                <input type="hidden" id="wizLegislation">
                                                
                                                <label class="small text-muted">Madde Aralığı</label>
                                                <div class="d-flex gap-2 mb-2">
                                                    <input type="number" id="wizStart" class="form-control" placeholder="Baş">
                                                    <input type="number" id="wizEnd" class="form-control" placeholder="Son">
                                                </div>

                                                <label class="small text-muted">Detay Filtre</label>
                                                <select id="wizDifficulty" class="form-control mb-2">
                                                    <option value="">Tüm Zorluklar</option>
                                                    <option value="1">1 - Çok Kolay</option>
                                                    <option value="3">3 - Orta</option>
                                                    <option value="5">5 - Çok Zor</option>
                                                </select>
                                                <input type="text" id="wizSearchText" class="form-control mb-3" placeholder="Soru içinde ara...">

                                                <button class="btn btn-primary w-100 mb-3" onclick="window.Studio.wizard.search()">
                                                    🔍 Filtrele ve Getir
                                                </button>
                                                
                                                <hr class="border-color">
                                                <button class="btn btn-warning btn-sm w-100" onclick="window.Studio.wizard.auto()">
                                                     ⚡ Otomatik 15 Soru Seç
                                                </button>
                                            </div>
                                        </div>

                                        <!-- Orta: Soru Havuzu (Tablo) -->
                                        <div class="wizard-col">
                                            <div class="wizard-header">
                                                <span>2. SORU HAVUZU</span>
                                                <span class="badge bg-secondary" id="poolCount">0</span>
                                            </div>
                                            <div class="wizard-body p-0">
                                                <div class="table-responsive">
                                                    <table class="pool-table">
                                                        <thead>
                                                            <tr>
                                                                <th width="50">Md.</th>
                                                                <th>Soru Metni</th>
                                                                <th width="100">İşlem</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody id="poolList">
                                                            <tr><td colspan="3" class="text-center p-4 text-muted">Arama yapın.</td></tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Sağ: Test Kağıdı (Sortable) -->
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
                
                <!-- HIZLI DÜZENLEME MODALI -->
                <div id="quickEditModal" class="quick-edit-modal">
                    <div class="quick-edit-header">
                        <span>Hızlı Düzenleme</span>
                        <button class="close-btn" style="font-size:1rem;" onclick="window.Studio.wizard.closeQ()">✕</button>
                    </div>
                    <div class="p-3">
                        <input type="hidden" id="qeId">
                        <div class="form-group">
                            <label>Soru Metni</label>
                            <textarea id="qeText" class="form-control" rows="3"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Doğru Cevap</label>
                            <select id="qeCorrect" class="form-control">
                                <option value="A">A</option><option value="B">B</option>
                                <option value="C">C</option><option value="D">D</option><option value="E">E</option>
                            </select>
                        </div>
                        <div class="d-flex justify-content-between">
                            <button class="btn btn-danger btn-sm" onclick="alert('Silme özelliği ana panelden yapılmalıdır.')">Sil</button>
                            <button class="btn btn-success btn-sm" onclick="window.Studio.wizard.saveQ()">Güncelle</button>
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

// Konu ID'si veya Başlığı ile Mevzuat/Kategori Eşleşmesi
const TOPIC_MAPPING = {
    "topic_anayasa": "2709",
    "topic_dmk_657": "657",
    "topic_cmk": "5271",
    "topic_hmk": "6100",
    "topic_iyuk": "2577",
    "topic_tebligat": "7201",
    "topic_infaz": "5275",
    "topic_ataturk_inkilap": "İnkılap Tarihi",
    "topic_dil_iletisim_etik": "Etik",
    "topic_resmi_yazisma": "Resmi Yazışma"
};

function getFilterValueForTopic(topicId, topicTitle) {
    if (TOPIC_MAPPING[topicId]) return TOPIC_MAPPING[topicId];
    const match = topicTitle.match(/(\d+)/);
    if (match) return match[0];
    return topicTitle;
}

async function openEditor(id = null, forceSettings = false) {
    document.getElementById('topicModal').style.display = 'flex';
    document.getElementById('contentListNav').innerHTML = '';
    state.activeTopicId = id;

    if (id) {
        const topic = state.allTopics.find(t => t.id === id);
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = topic.title;
        document.getElementById('inpTopicOrder').value = topic.order;
        document.getElementById('inpTopicCategory').value = topic.category;
        document.getElementById('inpTopicStatus').value = topic.isActive.toString();

        // Otomatik Filtre Değerini Belirle
        state.autoFilter = getFilterValueForTopic(id, topic.title);

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

    // Filtreleme
    const items = state.currentLessons.filter(l =>
        state.sidebarTab === 'test' ? l.type === 'test' : l.type !== 'test'
    );

    // Sekme HTML'i
    const tabsHtml = `
        <div class="studio-tabs d-flex border-bottom mb-2">
            <button class="btn btn-sm flex-fill ${state.sidebarTab === 'lesson' ? 'btn-primary' : 'btn-light'}" 
                onclick="window.Studio.switchTab('lesson')">📄 Dersler</button>
            <button class="btn btn-sm flex-fill ${state.sidebarTab === 'test' ? 'btn-warning' : 'btn-light'}" 
                onclick="window.Studio.switchTab('test')">📝 Testler</button>
        </div>
    `;

    // Liste HTML'i
    const listHtml = items.length ? items.map(l => `
        <div class="content-nav-item ${state.activeLessonId === l.id ? 'active' : ''}" 
             onclick="window.Studio.selectContent('${l.id}')">
            <span class="nav-item-icon">${l.type === 'test' ? '📝' : '📄'}</span>
            <div class="nav-item-meta">
                <div class="nav-item-title text-truncate">${l.title}</div>
                <div class="nav-item-sub d-flex justify-content-between">
                    <span>Sıra: ${l.order}</span>
                    <span>${l.type === 'test' ? (l.qCount || 0) + ' Soru' : ''}</span>
                </div>
            </div>
        </div>
    `).join('') : '<div class="text-center text-muted p-3">Bu kategoride içerik yok.</div>';

    list.innerHTML = tabsHtml + '<div class="content-list-scroll">' + listHtml + '</div>';
}

window.Studio.switchTab = (tab) => {
    state.sidebarTab = tab;
    renderContentNav();
};

function toggleSidebarGroup(header) {
    header.parentElement.classList.toggle('open');
}

function showMetaEditor() {
    document.getElementById('metaEditor').style.display = 'block';
    document.getElementById('contentEditor').style.display = 'none';
    state.activeLessonId = null;
    // Active class temizle
    document.querySelectorAll('.content-nav-item').forEach(el => el.classList.remove('active'));
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

    // Active class temizle
    document.querySelectorAll('.content-nav-item').forEach(el => el.classList.remove('active'));

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

        // Otomatik Kaynak Seçimi
        setTimeout(() => {
            const sourceVal = state.autoFilter || "Genel";
            document.getElementById('wizSourceDisplay').value = sourceVal;
            document.getElementById('wizLegislation').value = sourceVal;
            window.Studio.wizard.search();
        }, 300);

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

    renderContentNav(); // Re-render to update active class

    const badge = document.getElementById('editorBadge');
    if (state.activeLessonType === 'test') {
        badge.innerText = "TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = item.questions || [];
        renderTestPaper();

        // Kaynak Seçimi
        const sourceVal = state.autoFilter || "Genel";
        document.getElementById('wizSourceDisplay').value = sourceVal;
        document.getElementById('wizLegislation').value = sourceVal;
        window.Studio.wizard.search();

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
    let title = document.getElementById('inpContentTitle').value;

    // Otomatik Başlık
    if (!title) {
        if (state.activeLessonType === 'test') {
            // Mevcut testleri say
            const testCount = state.currentLessons.filter(l => l.type === 'test').length;
            // Eğer yeni bir test ise (id yoksa) testCount + 1, düzenlemeyse mevcut sırası
            const nextNum = state.activeLessonId ? testCount : (testCount + 1);
            title = `Konu Tarama Testi - ${nextNum}`;
        } else {
            title = `Ders Notu - ${state.currentLessons.length + 1}`;
        }
        // Input'a da yaz ki kullanıcı görsün
        document.getElementById('inpContentTitle').value = title;
    }

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

async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value;
    const s = parseInt(document.getElementById('wizStart').value);
    const e = parseInt(document.getElementById('wizEnd').value);

    // Yeni filtreler
    const diff = document.getElementById('wizDifficulty').value;
    const textSearch = document.getElementById('wizSearchText').value.toLowerCase();

    const list = document.getElementById('poolList');
    list.innerHTML = '<tr><td colspan="3" class="text-center p-3">Aranıyor...</td></tr>';

    // Not: Firestore'da karmaşık "OR" sorguları zordur. 
    // Tümünü çekip client-side filtrelemek bu ölçekte (admin paneli için) daha performanslı ve esnektir.
    const q1 = query(collection(db, "questions"), where("legislationRef.code", "==", code));

    const snap = await getDocs(q1);
    let arr = [];

    snap.forEach(doc => {
        const d = doc.data();
        if (d.isDeleted) return; // Silinenleri alma

        const art = parseInt(d.legislationRef?.article) || 0;

        // --- CLIENT SIDE FILTRELEME ---
        // 1. Madde Aralığı
        if (s && art < s) return;
        if (e && art > e) return;

        // 2. Zorluk
        if (diff && d.difficulty != diff) return;

        // 3. Metin Arama
        if (textSearch && !d.text.toLowerCase().includes(textSearch)) return;

        arr.push({ id: doc.id, ...d, artNo: art });
    });

    // Sıralama (Madde No'ya göre)
    arr.sort((a, b) => a.artNo - b.artNo);
    state.poolQuestions = arr;

    renderPoolList();
}

function renderPoolList() {
    const list = document.getElementById('poolList');
    document.getElementById('poolCount').innerText = state.poolQuestions.length;

    if (state.poolQuestions.length === 0) {
        list.innerHTML = '<tr><td colspan="3" class="text-center p-3 text-muted">Soru bulunamadı.</td></tr>';
        return;
    }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        return `
            <tr class="pool-row ${isAdded ? 'added' : ''}">
                <td><span class="badge bg-light text-dark border">Md.${q.artNo}</span></td>
                <td>
                    <div class="text-truncate small" style="max-width:180px;" title="${q.text}">${q.text}</div>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.Studio.wizard.fullEdit('${q.id}')" title="Detaylı Düzenle">🛠️</button>
                        <button class="btn btn-sm btn-success" onclick="window.Studio.wizard.add('${q.id}')" ${isAdded ? 'disabled' : ''}>+</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function addToTestPaper(id) {
    const q = state.poolQuestions.find(x => x.id === id);
    if (q && !state.tempQuestions.some(x => x.id === id)) {
        state.tempQuestions.push(q);
        renderTestPaper();
        renderPoolList();
    }
}

function removeFromTestPaper(idx) {
    state.tempQuestions.splice(idx, 1);
    renderTestPaper();
    renderPoolList();
}

function renderTestPaper() {
    const list = document.getElementById('paperList');
    document.getElementById('paperCount').innerText = state.tempQuestions.length;

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="q-paper-item d-flex align-items-center p-2 mb-1 border rounded bg-white" data-id="${q.id}">
            <div class="fw-bold me-2 text-muted" style="width:20px;">${i + 1}.</div>
            <div class="flex-fill overflow-hidden">
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-warning text-dark" style="font-size:10px;">Md.${q.artNo}</span>
                    <span class="badge bg-info text-dark" style="font-size:10px;">Zorluk: ${q.difficulty || '-'}</span>
                </div>
                <div class="text-truncate small mt-1">${q.text}</div>
            </div>
            <div class="d-flex gap-1 ms-2">
                 <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.Studio.wizard.fullEdit('${q.id}')">🛠️</button>
                 <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.Studio.wizard.remove(${i})">&times;</button>
            </div>
            <div class="ms-2 text-muted" style="cursor:move;">☰</div> </div>
    `).join('');

    // Sortable (Sürükle Bırak)
    if (window.Sortable) {
        new Sortable(list, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                const item = state.tempQuestions.splice(evt.oldIndex, 1)[0];
                state.tempQuestions.splice(evt.newIndex, 0, item);
                renderTestPaper(); // Sıralamayı güncelle
            }
        });
    }
}

function autoGenerateTest() {
    if (state.poolQuestions.length === 0) return alert("Önce arama yapın.");

    const shuffled = [...state.poolQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 15);
    selected.sort((a, b) => a.artNo - b.artNo);

    state.tempQuestions = selected;
    renderTestPaper();
    renderPoolList();
}

// --- HIZLI DÜZENLEME ---
function openQuickEdit(id) {
    const q = state.poolQuestions.find(x => x.id === id);
    if (!q) return;

    document.getElementById('qeId').value = id;
    document.getElementById('qeText').value = q.text;
    document.getElementById('qeCorrect').value = q.correctOption;
    document.getElementById('quickEditModal').style.display = 'flex';
}

async function saveQuickEdit() {
    const id = document.getElementById('qeId').value;
    const text = document.getElementById('qeText').value;
    const correct = document.getElementById('qeCorrect').value;

    try {
        await updateDoc(doc(db, "questions", id), { text, correctOption: correct });

        // Yerel veriyi güncelle
        const q = state.poolQuestions.find(x => x.id === id);
        if (q) { q.text = text; q.correctOption = correct; }

        renderPoolList();
        document.getElementById('quickEditModal').style.display = 'none';
        alert("Soru güncellendi.");
    } catch (e) { alert(e.message); }
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