import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// --- STATE YÖNETİMİ ---
// ==========================================
let state = {
    allTopics: [],
    currentLessons: [],
    activeLessonId: null,
    activeLessonType: 'lesson', // 'lesson' | 'test'
    tempMaterials: [],
    tempQuestions: []
};

// ==========================================
// --- BAŞLATMA ---
// ==========================================
export function initTopicsPage() {
    console.log("🚀 Pro Studio Modülü Başlatıldı");
    renderMainInterface();
    exposeAPI();
    loadTopics();
}

function exposeAPI() {
    // HTML'den erişilecek fonksiyonları window'a bağla
    window.Studio = {
        open: openEditor,
        close: () => document.getElementById('topicModal').style.display = 'none',
        saveMeta: saveTopicMeta,
        newContent: createNewContentUI,
        select: selectContentItem,
        saveContent: saveContentData,
        deleteContent: deleteContentItem,
        addMat: addMaterialItem,
        removeMat: removeMaterialItem,
        trash: { open: openTrash, restore: restoreItem, purge: purgeItem },
        wizard: { heatmap: renderHeatmap, query: runQuery, addQ: addQuestion, removeQ: removeQuestion }
    };
}

// ==========================================
// --- ANA SAYFA ARAYÜZÜ ---
// ==========================================
function renderMainInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat Stüdyosu</h2>
                <p class="text-muted">Profesyonel içerik ve sınav yönetim merkezi.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="window.Studio.trash.open()">🗑️ Çöp Kutusu</button>
                <button class="btn btn-primary" onclick="window.Studio.open()">✨ Yeni Konu Başlat</button>
            </div>
        </div>

        <div class="card mb-4 p-3 border-0 shadow-sm">
            <div class="row g-3 align-items-center">
                <div class="col-md-5">
                    <input type="text" id="searchTopic" class="form-control" placeholder="Konu başlığı ara..." oninput="filterTopics()">
                </div>
                <div class="col-md-4">
                    <select id="filterCategory" class="form-select" onchange="filterTopics()">
                        <option value="all">Tüm Kategoriler</option>
                        <option value="ortak">Ortak Konular</option>
                        <option value="alan">Alan Konuları</option>
                    </select>
                </div>
                <div class="col-md-3 text-end">
                    <span class="badge bg-light text-dark border px-3 py-2" id="topicCountBadge">...</span>
                </div>
            </div>
        </div>

        <div class="card border-0 shadow-sm">
            <div class="table-responsive">
                <table class="admin-table table-hover">
                    <thead>
                        <tr>
                            <th style="width:50px">No</th>
                            <th>Konu Başlığı</th>
                            <th>Tür</th>
                            <th>İçerik</th>
                            <th>Durum</th>
                            <th class="text-end">Yönetim</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content">
                
                <div class="modal-header">
                    <div class="d-flex align-items-center gap-3">
                        <span class="badge bg-primary px-3">STUDIO PRO</span>
                        <h4 class="m-0 text-white" id="modalTitle">Konu Düzenleyici</h4>
                    </div>
                    <button class="close-btn text-white" onclick="window.Studio.close()">&times;</button>
                </div>

                <div class="studio-grid">
                    
                    <div class="studio-sidebar">
                        
                        <div class="action-grid">
                            <div class="btn-action-card" onclick="window.Studio.newContent('lesson')">
                                <i class="text-primary">📄</i>
                                <span>Ders Notu</span>
                            </div>
                            <div class="btn-action-card" onclick="window.Studio.newContent('test')">
                                <i class="text-warning">📝</i>
                                <span>Sınav/Test</span>
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-2 mt-2">
                            <span class="small fw-bold text-muted text-uppercase">İçerik Akışı</span>
                            <span class="badge bg-light text-dark border" id="lessonCount">0</span>
                        </div>
                        
                        <div id="contentListNav" class="flex-grow-1"></div>

                        <div class="mt-3 pt-3 border-top">
                            <button class="btn btn-outline-secondary w-100 btn-sm" onclick="showTopicSettings()">
                                ⚙️ Ana Konu Ayarları
                            </button>
                        </div>
                    </div>

                    <div class="studio-main" id="mainEditorArea">
                        
                        <div id="metaEditor" class="workspace-area">
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <h3 class="text-primary m-0">Ana Konu Yapılandırması</h3>
                            </div>
                            <form id="topicMetaForm">
                                <input type="hidden" id="editTopicId">
                                <div class="row g-4">
                                    <div class="col-md-8">
                                        <label class="form-label text-muted">Konu Başlığı</label>
                                        <input type="text" id="inpTopicTitle" class="form-control form-control-lg fw-bold" placeholder="Örn: Anayasa Hukukuna Giriş">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label text-muted">Sıralama</label>
                                        <input type="number" id="inpTopicOrder" class="form-control form-control-lg">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label text-muted">Kategori</label>
                                        <select id="inpTopicCategory" class="form-select">
                                            <option value="ortak">Ortak Konular</option>
                                            <option value="alan">Alan Konuları</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label text-muted">Yayın Durumu</label>
                                        <select id="inpTopicStatus" class="form-select">
                                            <option value="true">Yayında (Aktif)</option>
                                            <option value="false">Taslak (Pasif)</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label text-muted">Kısa Açıklama</label>
                                        <textarea id="inpTopicDesc" class="form-control" rows="3"></textarea>
                                    </div>
                                    <div class="col-12 text-end">
                                        <button type="button" class="btn btn-success px-5" onclick="window.Studio.saveMeta()">
                                            Kaydet ve Devam Et
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div id="contentEditor" style="display:none; height:100%; flex-direction:column;">
                            
                            <div class="editor-toolbar">
                                <div class="d-flex align-items-center gap-3 w-50">
                                    <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="form-control border-0 bg-transparent fw-bold fs-5 text-white" placeholder="İçerik Başlığı Buraya...">
                                </div>
                                <div class="d-flex gap-2 align-items-center">
                                    <input type="number" id="inpContentOrder" class="form-control form-control-sm bg-dark text-white border-secondary" placeholder="#" style="width:60px">
                                    <div class="vr bg-secondary mx-2"></div>
                                    <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                    <button class="btn btn-success btn-sm px-4" onclick="window.Studio.saveContent()">Kaydet</button>
                                </div>
                            </div>

                            <div class="flex-grow-1 overflow-auto bg-light">
                                
                                <div id="wsLesson" class="workspace-area">
                                    <div class="d-flex gap-3 mb-4 justify-content-center">
                                        <button class="btn btn-white border shadow-sm" onclick="window.Studio.addMat('html')">📝 Metin Ekle</button>
                                        <button class="btn btn-white border shadow-sm" onclick="window.Studio.addMat('pdf')">📄 PDF Ekle</button>
                                        <button class="btn btn-white border shadow-sm" onclick="window.Studio.addMat('video')">▶️ Video Ekle</button>
                                        <button class="btn btn-white border shadow-sm" onclick="window.Studio.addMat('podcast')">🎧 Podcast Ekle</button>
                                    </div>
                                    <div id="materialsList"></div>
                                </div>

                                <div id="wsTest" style="display:none; height:100%;">
                                    <div class="row g-0 h-100">
                                        <div class="col-4 border-end bg-white d-flex flex-column h-100">
                                            <div class="p-3 border-bottom bg-light">
                                                <label class="small fw-bold text-muted mb-2">SORU BANKASI FİLTRESİ</label>
                                                <select id="wizLegislation" class="form-select mb-2" onchange="window.Studio.wizard.heatmap(this.value)">
                                                    <option value="">Mevzuat Seçiniz...</option>
                                                    <option value="2709">T.C. Anayasası</option>
                                                    <option value="657">657 DMK</option>
                                                    <option value="5271">5271 CMK</option>
                                                    <option value="5237">5237 TCK</option>
                                                    <option value="2577">2577 İYUK</option>
                                                </select>
                                                <div id="legislationHeatmap" class="heatmap-track mb-2" style="height:8px; background:#e2e8f0; border-radius:4px;"></div>
                                                <div class="input-group input-group-sm">
                                                    <input type="number" id="wizStart" class="form-control" placeholder="Baş">
                                                    <input type="number" id="wizEnd" class="form-control" placeholder="Son">
                                                    <button class="btn btn-primary" onclick="window.Studio.wizard.query()">Bul</button>
                                                </div>
                                            </div>
                                            <div id="questionPoolList" class="flex-grow-1 overflow-auto p-2"></div>
                                        </div>
                                        <div class="col-8 bg-light d-flex flex-column h-100">
                                            <div class="p-3 d-flex justify-content-between align-items-center border-bottom bg-white">
                                                <span class="fw-bold text-primary">SINAV KAĞIDI</span>
                                                <span class="badge bg-primary" id="testQCount">0 Soru</span>
                                            </div>
                                            <div id="testPaperList" class="flex-grow-1 overflow-auto p-3"></div>
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
            <div class="admin-modal-content" style="max-width:800px; height:auto; max-height:80vh;">
                <div class="modal-header"><h3>🗑️ Çöp Kutusu</h3><button class="close-btn" onclick="document.getElementById('trashModal').style.display='none'">&times;</button></div>
                <div class="p-4 overflow-auto"><table class="admin-table"><tbody id="trashTableBody"></tbody></table></div>
            </div>
        </div>
    `;
}

// ==========================================
// --- VERİ YÖNETİMİ ---
// ==========================================
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Veriler yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snap = await getDocs(q);

        state.allTopics = [];
        snap.forEach(doc => {
            if (doc.data().status !== 'deleted') state.allTopics.push({ id: doc.id, ...doc.data() });
        });
        window.filterTopics(); // Global scope helper
    } catch (e) { console.error(e); }
}

window.filterTopics = () => {
    const search = document.getElementById('searchTopic').value.toLowerCase();
    const cat = document.getElementById('filterCategory').value;
    const tbody = document.getElementById('topicsTableBody');

    const filtered = state.allTopics.filter(t =>
        (cat === 'all' || t.category === cat) && (t.title || '').toLowerCase().includes(search)
    );

    document.getElementById('topicCountBadge').innerText = `${filtered.length} Kayıt`;

    tbody.innerHTML = filtered.map((t, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${t.title}</strong></td>
            <td>${t.category === 'ortak' ? 'Ortak' : 'Alan'}</td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? '<span class="text-success">Yayında</span>' : '<span class="text-muted">Taslak</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button>
            </td>
        </tr>
    `).join('');
};

// ==========================================
// --- STÜDYO İŞLEMLERİ ---
// ==========================================
async function openEditor(id = null) {
    document.getElementById('topicModal').style.display = 'flex';
    document.getElementById('contentListNav').innerHTML = '';
    showTopicSettings();

    if (id) {
        document.getElementById('modalTitle').innerText = "Konu Düzenleniyor";
        document.getElementById('editTopicId').value = id;
        const topic = state.allTopics.find(t => t.id === id);
        if (topic) {
            document.getElementById('inpTopicTitle').value = topic.title;
            document.getElementById('inpTopicOrder').value = topic.order;
            document.getElementById('inpTopicCategory').value = topic.category;
            document.getElementById('inpTopicStatus').value = topic.isActive.toString();
            document.getElementById('inpTopicDesc').value = topic.description || '';
            loadContents(id);
        }
    } else {
        document.getElementById('modalTitle').innerText = "Yeni Konu Oluştur";
        document.getElementById('editTopicId').value = "";
        document.getElementById('topicMetaForm').reset();
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
    }
}

async function loadContents(topicId) {
    const list = document.getElementById('contentListNav');
    list.innerHTML = '<div class="text-center text-muted small mt-3">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);

    state.currentLessons = [];
    list.innerHTML = '';

    snap.forEach(doc => {
        const d = { id: doc.id, ...doc.data() };
        state.currentLessons.push(d);

        const div = document.createElement('div');
        div.className = `content-list-item ${!d.isActive ? 'opacity-50' : ''}`;
        div.innerHTML = `
            <div class="item-icon">${d.type === 'test' ? '📝' : '📄'}</div>
            <div style="flex:1; overflow:hidden;">
                <div class="fw-bold text-truncate">${d.title}</div>
                <div class="small text-muted">Sıra: ${d.order}</div>
            </div>
        `;
        div.onclick = () => selectContentItem(d.id, div);
        list.appendChild(div);
    });
    document.getElementById('lessonCount').innerText = state.currentLessons.length;
}

function showTopicSettings() {
    document.getElementById('metaEditor').style.display = 'block';
    document.getElementById('contentEditor').style.display = 'none';
    // Remove active classes
    document.querySelectorAll('.content-list-item').forEach(el => el.classList.remove('active'));
}

async function saveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;
    if (!title) return alert("Başlık giriniz");

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
            const ref = await addDoc(collection(db, "topics"), data);
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Konu kaydedildi.");
        loadTopics();
    } catch (e) { alert(e.message); }
}

// ==========================================
// --- İÇERİK (DERS/TEST) YÖNETİMİ ---
// ==========================================
function createNewContentUI(type) {
    const topicId = document.getElementById('editTopicId').value;
    if (!topicId) return alert("Önce ana konuyu kaydedin!");

    state.activeLessonId = null;
    state.activeLessonType = type;

    // UI Hazırla
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';
    document.querySelectorAll('.content-list-item').forEach(el => el.classList.remove('active'));

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;
    document.getElementById('inpContentTitle').focus();

    const badge = document.getElementById('editorBadge');

    if (type === 'test') {
        badge.innerText = "SINAV / TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLesson').style.display = 'none';
        document.getElementById('wsTest').style.display = 'block';
        state.tempQuestions = [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-primary";
        document.getElementById('wsLesson').style.display = 'block';
        document.getElementById('wsTest').style.display = 'none';
        state.tempMaterials = [];
        renderMaterials();
    }
}

function selectContentItem(id, el) {
    if (el) {
        document.querySelectorAll('.content-list-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
    }

    const item = state.currentLessons.find(x => x.id === id);
    if (!item) return;

    state.activeLessonId = id;
    state.activeLessonType = item.type || 'lesson';

    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';

    document.getElementById('inpContentTitle').value = item.title;
    document.getElementById('inpContentOrder').value = item.order;

    const badge = document.getElementById('editorBadge');
    if (state.activeLessonType === 'test') {
        badge.innerText = "SINAV / TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLesson').style.display = 'none';
        document.getElementById('wsTest').style.display = 'block';
        state.tempQuestions = item.questions || [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-primary";
        document.getElementById('wsLesson').style.display = 'block';
        document.getElementById('wsTest').style.display = 'none';
        state.tempMaterials = item.materials || [];
        renderMaterials();
    }
}

async function saveContentData() {
    const topicId = document.getElementById('editTopicId').value;
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
            await updateDoc(doc(db, `topics/${topicId}/lessons`, state.activeLessonId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${topicId}/lessons`), data);
        }
        // Geri bildirim
        const btn = document.querySelector('#contentEditor .btn-success');
        const old = btn.innerText; btn.innerText = "✓ Kaydedildi"; setTimeout(() => btn.innerText = old, 1500);

        loadContents(topicId);
    } catch (e) { alert(e.message); }
}

async function deleteContentItem() {
    if (!state.activeLessonId || !confirm("Silinsin mi?")) return;
    const topicId = document.getElementById('editTopicId').value;
    await deleteDoc(doc(db, `topics/${topicId}/lessons`, state.activeLessonId));
    loadContents(topicId);
    showTopicSettings();
}

// ==========================================
// --- MATERYAL YÖNETİMİ ---
// ==========================================
function addMaterialItem(type) {
    state.tempMaterials.push({ id: Date.now(), type, title: '', url: '' });
    renderMaterials();
}
function removeMaterialItem(id) {
    state.tempMaterials = state.tempMaterials.filter(x => x.id !== id);
    renderMaterials();
}
function renderMaterials() {
    const list = document.getElementById('materialsList');
    list.innerHTML = state.tempMaterials.map(m => `
        <div class="material-row">
            <div class="material-icon-box bg-icon-${m.type}">
                ${m.type == 'video' ? '▶️' : m.type == 'podcast' ? '🎧' : m.type == 'pdf' ? '📄' : '📝'}
            </div>
            <div class="flex-grow-1">
                <input type="text" class="form-control form-control-sm mb-1 fw-bold border-0 bg-transparent" placeholder="Materyal Başlığı" value="${m.title}" 
                    oninput="this.value=this.value; state.tempMaterials.find(x=>x.id==${m.id}).title=this.value">
                ${m.type == 'html'
            ? `<textarea class="form-control form-control-sm" rows="2" placeholder="İçerik..." oninput="state.tempMaterials.find(x=>x.id==${m.id}).url=this.value">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm" placeholder="URL..." value="${m.url}" oninput="state.tempMaterials.find(x=>x.id==${m.id}).url=this.value">`
        }
            </div>
            <button class="btn btn-sm text-danger" onclick="window.Studio.removeMat(${m.id})">&times;</button>
        </div>
    `).join('');
}

// ==========================================
// --- TEST SİHİRBAZI ---
// ==========================================
async function renderHeatmap(code) {
    const div = document.getElementById('legislationHeatmap');
    if (!code) return;
    div.innerHTML = '';
    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
    const snap = await getDocs(q);
    const counts = {}; let max = 0;
    snap.forEach(d => {
        const a = parseInt(d.data().legislationRef?.article);
        if (!isNaN(a)) { counts[a] = (counts[a] || 0) + 1; if (a > max) max = a; }
    });
    const step = Math.ceil((max || 100) / 50);
    for (let i = 1; i <= max; i += step) {
        let t = 0; for (let j = 0; j < step; j++) t += (counts[i + j] || 0);
        const s = document.createElement('div');
        s.style.flex = '1'; s.style.marginRight = '1px'; s.style.cursor = 'pointer';
        s.style.background = t === 0 ? 'transparent' : t < 3 ? '#fcd34d' : '#10b981';
        s.title = `Md.${i}: ${t}`;
        s.onclick = () => { document.getElementById('wizStart').value = i; document.getElementById('wizEnd').value = i + step; };
        div.appendChild(s);
    }
}
async function runQuery() {
    const code = document.getElementById('wizLegislation').value;
    const s = parseInt(document.getElementById('wizStart').value);
    const e = parseInt(document.getElementById('wizEnd').value);
    const list = document.getElementById('questionPoolList');
    list.innerHTML = 'Aranıyor...';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), limit(100));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d => {
        const art = parseInt(d.data().legislationRef?.article);
        if (!isNaN(art) && (!s || art >= s) && (!e || art <= e)) arr.push({ id: d.id, ...d.data(), artNo: art });
    });
    arr.sort((a, b) => a.artNo - b.artNo);

    list.innerHTML = arr.map(x => `
        <div class="question-card ${state.tempQuestions.some(q => q.id === x.id) ? 'selected' : ''}" onclick="window.Studio.wizard.addQ('${x.id}')">
            <div class="d-flex justify-content-between"><strong>Md. ${x.artNo}</strong> <span class="badge bg-light text-dark">${x.difficulty || 3}</span></div>
            <div class="text-truncate small mt-1">${x.text}</div>
            <input type="hidden" id="raw_${x.id}" value='${JSON.stringify(x).replace(/'/g, "&#39;")}'>
        </div>
    `).join('');
}
function addQuestion(id) {
    if (state.tempQuestions.some(x => x.id === id)) return;
    const raw = JSON.parse(document.getElementById(`raw_${id}`).value);
    state.tempQuestions.push(raw);
    renderTestPaper();
}
function removeQuestion(idx) {
    state.tempQuestions.splice(idx, 1);
    renderTestPaper();
}
function renderTestPaper() {
    document.getElementById('testQCount').innerText = state.tempQuestions.length;
    document.getElementById('testPaperList').innerHTML = state.tempQuestions.map((q, i) => `
        <div class="border-bottom py-2 d-flex gap-2">
            <span class="fw-bold text-muted">${i + 1}.</span>
            <div class="flex-grow-1 text-truncate small">${q.text}</div>
            <button class="btn btn-sm text-danger p-0" onclick="window.Studio.wizard.removeQ(${i})">&times;</button>
        </div>
    `).join('');
}

// ==========================================
// --- ÇÖP KUTUSU (Mevcut logic) ---
// ==========================================
async function softDeleteTopic(id) { await updateDoc(doc(db, "topics", id), { status: 'deleted' }); loadTopics(); }
async function openTrash() {
    document.getElementById('trashModal').style.display = 'flex';
    const snap = await getDocs(query(collection(db, "topics"), where("status", "==", "deleted")));
    document.getElementById('trashTableBody').innerHTML = snap.docs.map(d => `<tr><td>${d.data().title}</td><td class="text-end"><button class="btn btn-success btn-sm" onclick="window.Studio.trash.restore('${d.id}')">Geri Al</button></td></tr>`).join('');
}
async function restoreItem(id) { await updateDoc(doc(db, "topics", id), { status: 'active' }); openTrash(); loadTopics(); }
async function purgeItem(id) { await deleteDoc(doc(db, "topics", id)); openTrash(); }