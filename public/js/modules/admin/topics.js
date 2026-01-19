import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// --- 1. GLOBAL STATE YÖNETİMİ ---
// ============================================================
let state = {
    allTopics: [],
    currentLessons: [],
    activeTopicId: null,
    activeLessonId: null,
    activeLessonType: 'lesson', // 'lesson' veya 'test'
    tempMaterials: [],          // Ders materyalleri (RAM'de)
    tempQuestions: [],          // Test soruları (RAM'de)
    legislationCache: null      // Mevzuat kodları önbelleği
};

// ============================================================
// --- 2. BAŞLATMA (INIT) ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro Başlatılıyor...");

    // HTML İskeletini Oluştur
    renderMainInterface();

    // Konu Listesini Çek
    loadTopics();

    // HTML'den erişilebilmesi için Window'a bağla (ÖNEMLİ)
    window.Studio = {
        open: openEditor,
        close: closeModal,
        settings: showMetaEditor,
        saveMeta: saveTopicMeta,
        newContent: createNewContent,
        select: selectContentItem,
        saveContent: saveContent,
        deleteContent: deleteContent,
        addMat: addMaterialUI,
        removeMat: removeMaterialUI,
        updateMat: updateMaterialItem,
        trash: {
            open: openTrash,
            restore: restoreItem,
            purge: purgeItem
        },
        wizard: {
            heatmap: renderHeatmap,
            query: runQuery,
            addQ: addQuestion,
            removeQ: removeQuestion
        }
    };
}

function closeModal() {
    document.getElementById('topicModal').style.display = 'none';
}

// ============================================================
// --- 3. ANA ARAYÜZ (HTML RENDER) ---
// ============================================================
function renderMainInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Eğitim içeriklerini ve sınavları buradan yönetin.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="window.Studio.trash.open()">
                    <i class="fas fa-trash"></i> Çöp Kutusu
                </button>
                <button class="btn btn-primary" onclick="window.Studio.open()">
                    <i class="fas fa-plus"></i> Yeni Konu Ekle
                </button>
            </div>
        </div>

        <div class="card p-0 overflow-hidden border-0 shadow-sm">
            <div class="p-3 border-bottom border-color bg-surface">
                <input type="text" id="searchTopic" class="form-control" placeholder="Konu başlığı ara..." oninput="filterTopics()">
            </div>
            <div class="table-responsive">
                <table class="admin-table table-hover">
                    <thead>
                        <tr>
                            <th style="width:50px">Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>Ders/Test</th>
                            <th>Durum</th>
                            <th class="text-end">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content">
                
                <div class="studio-header">
                    <div class="studio-title">
                        <span class="icon">⚡</span> İçerik Stüdyosu
                    </div>
                    <button class="close-btn" onclick="window.Studio.close()">&times;</button>
                </div>

                <div class="studio-layout">
                    
                    <div class="studio-sidebar">
                        <div class="quick-actions">
                            <div class="action-card" onclick="window.Studio.newContent('lesson')">
                                <i>📄</i><span>Ders Notu</span>
                            </div>
                            <div class="action-card" onclick="window.Studio.newContent('test')">
                                <i>📝</i><span>Sınav / Test</span>
                            </div>
                        </div>

                        <div class="sidebar-section-title">İÇERİK AKIŞI</div>
                        <div id="contentListNav" class="flex-grow-1 overflow-auto pe-2"></div>

                        <div class="mt-3 pt-3 border-top border-color">
                            <button class="btn btn-secondary w-100 btn-sm" onclick="window.Studio.settings()">
                                ⚙️ Ana Konu Ayarları
                            </button>
                        </div>
                    </div>

                    <div class="studio-editor">
                        
                        <div id="metaEditor" class="editor-workspace">
                            <div class="studio-card" style="max-width:800px; margin:0 auto;">
                                <h4 class="mb-4 text-gold" style="border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                                    Ana Konu Yapılandırması
                                </h4>
                                <form id="topicMetaForm" onsubmit="event.preventDefault(); window.Studio.saveMeta();">
                                    <input type="hidden" id="editTopicId">
                                    
                                    <div class="form-group">
                                        <label>Konu Başlığı</label>
                                        <input type="text" id="inpTopicTitle" class="form-control" required placeholder="Örn: İdare Hukuku">
                                    </div>

                                    <div class="row">
                                        <div class="col-md-3 form-group">
                                            <label>Sıra No</label>
                                            <input type="number" id="inpTopicOrder" class="form-control">
                                        </div>
                                        <div class="col-md-5 form-group">
                                            <label>Kategori</label>
                                            <select id="inpTopicCategory" class="form-select">
                                                <option value="ortak">Ortak Konular</option>
                                                <option value="alan">Alan Konuları</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4 form-group">
                                            <label>Durum</label>
                                            <select id="inpTopicStatus" class="form-select">
                                                <option value="true">Yayında (Aktif)</option>
                                                <option value="false">Taslak (Pasif)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="form-group">
                                        <label>Kısa Açıklama</label>
                                        <textarea id="inpTopicDesc" class="form-control" rows="3"></textarea>
                                    </div>

                                    <div class="text-end">
                                        <button type="submit" class="btn btn-primary px-4">Kaydet ve Devam Et</button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <div id="contentEditor" style="display:none; flex-direction:column; height:100%;">
                            
                            <div class="editor-toolbar">
                                <div style="flex:1; display:flex; align-items:center; gap:10px;">
                                    <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı...">
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <input type="number" id="inpContentOrder" class="form-control form-control-sm bg-dark text-white border-secondary text-center" 
                                        style="width:60px" placeholder="#" title="Sıralama">
                                    
                                    <div style="width:1px; height:20px; background:var(--border-color); margin:0 10px;"></div>
                                    
                                    <button class="btn btn-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                    <button class="btn btn-success btn-sm px-3" onclick="window.Studio.saveContent()">Kaydet</button>
                                </div>
                            </div>

                            <div class="editor-workspace p-0 bg-dark">
                                
                                <div id="wsLessonMode" class="p-4" style="max-width:1000px; margin:0 auto;">
                                    <div class="d-flex justify-content-center gap-2 mb-4">
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('html')">📝 Metin</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('pdf')">📄 PDF</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('video')">▶️ Video</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMat('podcast')">🎧 Podcast</button>
                                    </div>
                                    <div id="materialsContainer"></div>
                                </div>

                                <div id="wsTestMode" class="h-100 p-3" style="display:none;">
                                    <div class="wizard-layout">
                                        
                                        <div class="wizard-pool">
                                            <div class="wizard-header">1. SORU HAVUZU</div>
                                            <div class="p-3 border-bottom border-color">
                                                <select id="wizLegislation" class="form-select form-select-sm mb-2" onchange="window.Studio.wizard.heatmap(this.value)">
                                                    <option value="">Mevzuat Yükleniyor...</option>
                                                </select>
                                                
                                                <div id="legislationHeatmap" class="heatmap-track mb-2" title="Soru Yoğunluğu"></div>
                                                
                                                <div class="d-flex gap-2">
                                                    <input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Baş">
                                                    <input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Son">
                                                    <button class="btn btn-primary btn-sm" onclick="window.Studio.wizard.query()">Getir</button>
                                                </div>
                                            </div>
                                            <div id="questionPoolList" class="wizard-body">
                                                <div class="text-center text-muted mt-5 small">Kriter seçip arama yapın.</div>
                                            </div>
                                        </div>

                                        <div class="wizard-paper">
                                            <div class="wizard-header d-flex justify-content-between">
                                                <span>2. OLUŞTURULAN TEST</span>
                                                <span class="badge bg-primary" id="testCountBadge">0 Soru</span>
                                            </div>
                                            <div id="testPaperList" class="wizard-body"></div>
                                        </div>

                                    </div>
                                </div>

                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content" style="max-width:800px; height:70vh;">
                <div class="modal-header">
                    <h3>🗑️ Çöp Kutusu</h3>
                    <button class="close-btn" onclick="document.getElementById('trashModal').style.display='none'">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <table class="admin-table">
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// --- 4. VERİ YÖNETİMİ (TOPIC CRUD) ---
// ============================================================

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snap = await getDocs(q);

        state.allTopics = [];
        snap.forEach(doc => {
            if (doc.data().status !== 'deleted') {
                state.allTopics.push({ id: doc.id, ...doc.data() });
            }
        });

        // Helper fonksiyonu window'a atadık ki HTML'den çağrılabilsin
        window.filterTopics();
    } catch (e) { console.error(e); }
}

window.filterTopics = () => {
    const search = document.getElementById('searchTopic').value.toLowerCase();
    const tbody = document.getElementById('topicsTableBody');

    const filtered = state.allTopics.filter(t =>
        (t.title || '').toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Kayıt bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge bg-dark border border-secondary">${t.category}</span></td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? '<span class="text-success">● Yayında</span>' : '<span class="text-muted">○ Taslak</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button>
            </td>
        </tr>
    `).join('');
};

// ============================================================
// --- 5. STUDIO ENGINE (MANTIK) ---
// ============================================================

// --- Editör Açma/Kapama ---
async function openEditor(id = null) {
    document.getElementById('topicModal').style.display = 'flex';
    document.getElementById('contentListNav').innerHTML = '';
    state.activeTopicId = id;

    // Mevzuat listesini arka planda çek (Test sihirbazı için)
    fetchLegislationCodes();

    if (id) {
        // Düzenleme Modu
        document.getElementById('editTopicId').value = id;
        const topic = state.allTopics.find(t => t.id === id);
        if (topic) {
            document.getElementById('inpTopicTitle').value = topic.title;
            document.getElementById('inpTopicOrder').value = topic.order;
            document.getElementById('inpTopicCategory').value = topic.category;
            document.getElementById('inpTopicStatus').value = topic.isActive.toString();
            document.getElementById('inpTopicDesc').value = topic.description || '';

            // İçerikleri Yükle
            await loadLessons(id);

            // Eğer içerik yoksa ayarlar sayfasını göster
            if (state.currentLessons.length === 0) {
                showMetaEditor();
            } else {
                // İlk içeriği seç (Kullanıcı dostu)
                selectContentItem(state.currentLessons[0].id);
            }
        }
    } else {
        // Yeni Kayıt Modu
        document.getElementById('editTopicId').value = "";
        document.getElementById('topicMetaForm').reset();
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        document.getElementById('contentListNav').innerHTML = '<div class="text-center text-muted p-3 small">Yeni konu oluşturuluyor...</div>';
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    const list = document.getElementById('contentListNav');
    list.innerHTML = '<div class="text-center p-2 small text-muted">Yükleniyor...</div>';

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
    renderContentNav(); // Active class temizlemek için
}

// --- Kaydetme İşlemleri ---
async function saveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;

    if (!title) return alert("Başlık giriniz.");

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
            state.activeTopicId = ref.id;
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Konu bilgileri kaydedildi.");
        loadTopics(); // Arka planı güncelle
    } catch (e) { alert(e.message); }
}

// --- 6. İÇERİK YÖNETİMİ ---

function createNewContent(type) {
    if (!state.activeTopicId) return alert("Lütfen önce ana konuyu kaydedin.");

    state.activeLessonId = null;
    state.activeLessonType = type;

    // UI Hazırla
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';
    renderContentNav(); // Seçimi kaldır

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentTitle').focus();
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;

    const badge = document.getElementById('editorBadge');

    if (type === 'test') {
        badge.innerText = "SINAV / TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS NOTU";
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

    renderContentNav(); // Active class güncelle

    const badge = document.getElementById('editorBadge');

    if (state.activeLessonType === 'test') {
        badge.innerText = "SINAV / TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = item.questions || [];
        renderTestPaper();
        // Mevzuat listesini yükle (Cache varsa)
        if (state.legislationCache) populateLegislationSelect();
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
        state.tempMaterials = item.materials || [];
        renderMaterials();
    }
}

async function saveContent() {
    const title = document.getElementById('inpContentTitle').value;
    if (!title) return alert("Başlık giriniz");

    const data = {
        title,
        type: state.activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value),
        isActive: true,
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
            await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${state.activeTopicId}/lessons`), data);
            // Sayaç güncelle (Opsiyonel)
            await updateDoc(doc(db, "topics", state.activeTopicId), { lessonCount: state.currentLessons.length + 1 });
        }

        // Buton Feedback
        const btn = document.querySelector('#contentEditor .btn-success');
        const oldText = btn.innerHTML;
        btn.innerHTML = '✓ Kaydedildi';
        setTimeout(() => btn.innerHTML = oldText, 2000);

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

// --- 7. MATERYAL YÖNETİMİ ---

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
            <div class="h3 m-0">${m.type === 'video' ? '▶️' : m.type === 'podcast' ? '🎧' : m.type === 'pdf' ? '📄' : '📝'}</div>
            <div style="flex:1;">
                <div class="d-flex justify-content-between mb-1">
                    <span class="badge bg-dark border border-secondary">${m.type.toUpperCase()}</span>
                    <button class="btn btn-sm text-danger p-0" onclick="window.Studio.removeMat(${m.id})">&times;</button>
                </div>
                <input type="text" class="form-control form-control-sm mb-2 fw-bold" placeholder="Materyal Başlığı" 
                    value="${m.title}" oninput="window.Studio.updateMat(${m.id}, 'title', this.value)">
                
                ${m.type === 'html'
            ? `<textarea class="form-control form-control-sm" rows="3" placeholder="İçerik..." oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm" placeholder="URL Linki" value="${m.url}" oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">`
        }
            </div>
        </div>
    `).join('');
}

// --- 8. TEST SİHİRBAZI (GERÇEK VERİ) ---

async function fetchLegislationCodes() {
    const select = document.getElementById('wizLegislation');
    if (!select) return; // Modal kapalıysa dur

    // Cache varsa kullan
    if (state.legislationCache) {
        populateLegislationSelect();
        return;
    }

    try {
        // Gerçek veritabanından çek (Son 1000 soruyu tara)
        const q = query(collection(db, "questions"), limit(1000));
        const snap = await getDocs(q);

        const codes = new Set();
        // Standartlar
        ['2709', '657', '5271', '5237', '2577'].forEach(c => codes.add(c));

        snap.forEach(doc => {
            const code = doc.data().legislationRef?.code;
            if (code) codes.add(code);
        });

        state.legislationCache = Array.from(codes).sort();
        populateLegislationSelect();

    } catch (e) { console.error("Mevzuat çekilemedi", e); }
}

function populateLegislationSelect() {
    const select = document.getElementById('wizLegislation');
    select.innerHTML = '<option value="">Seçiniz...</option>' +
        state.legislationCache.map(c => `<option value="${c}">${c} Sayılı Kanun</option>`).join('');
}

async function renderHeatmap(code) {
    if (!code) return;
    const div = document.getElementById('legislationHeatmap');
    div.innerHTML = '<small>Analiz...</small>';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
    const snap = await getDocs(q);

    const counts = {}; let maxArt = 0;
    snap.forEach(d => {
        const a = parseInt(d.data().legislationRef?.article);
        if (!isNaN(a)) { counts[a] = (counts[a] || 0) + 1; if (a > maxArt) maxArt = a; }
    });

    div.innerHTML = '';
    const limit = maxArt || 100;
    const step = Math.ceil(limit / 40);

    for (let i = 1; i <= limit; i += step) {
        let total = 0;
        for (let j = 0; j < step; j++) total += (counts[i + j] || 0);

        const bar = document.createElement('div');
        bar.className = 'heatmap-segment';
        bar.style.flex = '1';
        bar.style.marginRight = '1px';
        bar.title = `Md. ${i}-${i + step}: ${total} Soru`;
        bar.style.background = total === 0 ? 'rgba(255,255,255,0.1)' : total < 3 ? '#f59e0b' : '#10b981';

        bar.onclick = () => {
            document.getElementById('wizStart').value = i;
            document.getElementById('wizEnd').value = i + step;
        };
        div.appendChild(bar);
    }
}

async function runQuery() {
    const code = document.getElementById('wizLegislation').value;
    const s = parseInt(document.getElementById('wizStart').value);
    const e = parseInt(document.getElementById('wizEnd').value);

    if (!code) return alert("Mevzuat seçiniz");

    const list = document.getElementById('questionPoolList');
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

    list.innerHTML = arr.length === 0
        ? '<div class="text-center mt-4 text-muted">Soru bulunamadı.</div>'
        : arr.map(q => {
            const isAdded = state.tempQuestions.some(x => x.id === q.id);
            return `
                <div class="q-select-item" onclick="window.Studio.wizard.addQ('${q.id}')" 
                     style="${isAdded ? 'opacity:0.5; pointer-events:none;' : ''}">
                    <div class="d-flex justify-content-between">
                        <strong>Md. ${q.artNo}</strong>
                        ${isAdded ? '✅' : ''}
                    </div>
                    <div class="text-truncate text-muted small">${q.text}</div>
                    <textarea id="raw_${q.id}" style="display:none;">${JSON.stringify(q)}</textarea>
                </div>
            `;
        }).join('');
}

function addQuestionToTest(id) {
    const raw = document.getElementById(`raw_${id}`).value;
    state.tempQuestions.push(JSON.parse(raw));
    renderTestPaper();
    runQuery(); // Listeyi refresh et (Disable için)
}

function removeQuestionFromTest(idx) {
    state.tempQuestions.splice(idx, 1);
    renderTestPaper();
    runQuery();
}

function renderTestPaper() {
    const list = document.getElementById('testPaperList');
    document.getElementById('testCountBadge').innerText = `${state.tempQuestions.length} Soru`;

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="d-flex gap-2 border-bottom border-color py-2 align-items-center">
            <span class="text-primary fw-bold">${i + 1}.</span>
            <div style="flex:1; overflow:hidden;">
                <div class="small fw-bold">Md. ${q.artNo}</div>
                <div class="text-truncate text-muted small">${q.text}</div>
            </div>
            <button class="btn btn-sm text-danger" onclick="window.Studio.wizard.removeQ(${i})">&times;</button>
        </div>
    `).join('');
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