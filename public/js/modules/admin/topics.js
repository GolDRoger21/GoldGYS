import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { openQuestionEditor } from './content.js';

let state = {
    allTopics: [],
    currentLessons: [],
    activeTopicId: null,
    activeLessonId: null,
    activeLessonType: 'lesson',
    tempMaterials: [],
    tempQuestions: [],
    poolQuestions: [],
    sidebarTab: 'lesson', // 'lesson' | 'test'
    autoFilter: ''
};

export function initTopicsPage() {
    console.log("🚀 Studio Pro: Ultimate Edition Loaded");
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
                if (window.QuestionBank?.openEditor) window.QuestionBank.openEditor(id);
                else openQuestionEditor(id);
            }
        },
        // Tab Değiştirme
        switchTab: (tab) => {
            state.sidebarTab = tab;
            renderContentNav();
        }
    };

    loadTopics();
}

// ============================================================
// --- ARAYÜZ (HTML YAPISI) ---
// ============================================================
function renderMainInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div><h2>📚 İçerik Stüdyosu</h2><p class="text-muted">Müfredat, ders notları ve test yönetimi.</p></div>
            <div><button class="btn btn-primary" onclick="window.Studio.open()">➕ Yeni Konu</button></div>
        </div>

        <div class="card p-0"><table class="admin-table"><tbody id="topicsTableBody"></tbody></table></div>

        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content" style="width:98%; height:95vh; max-width:1800px; padding:0; overflow:hidden;">
                
                <div class="studio-header">
                    <div class="studio-title"><span class="icon">⚡</span> İçerik Yöneticisi</div>
                    <button class="close-btn" onclick="window.Studio.close()">&times;</button>
                </div>

                <div class="studio-layout">
                    
                    <div class="studio-sidebar">
                        
                        <div class="sidebar-controls">
                            <div class="studio-tabs">
                                <div class="tab-item active" onclick="window.Studio.switchTab('lesson')">📄 Dersler</div>
                                <div class="tab-item" onclick="window.Studio.switchTab('test')">📝 Testler</div>
                            </div>
                            <div class="sidebar-actions">
                                <button class="btn btn-primary btn-sm w-100" style="grid-column: span 2;" onclick="window.Studio.newContent(state.sidebarTab)">
                                    ➕ Yeni Ekle
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="window.Studio.settings()" title="Konu Ayarları">⚙️</button>
                            </div>
                        </div>

                        <div id="contentListNav" class="nav-list-scroll"></div>
                    </div>

                    <div class="studio-editor">
                        
                        <div id="metaEditor" class="editor-workspace" style="display:none;">
                            <div class="studio-card" style="max-width:600px; margin:50px auto;">
                                <h3 class="mb-4">Konu Ayarları</h3>
                                <form onsubmit="event.preventDefault(); window.Studio.saveMeta();">
                                    <input type="hidden" id="editTopicId">
                                    <input type="text" id="inpTopicTitle" class="form-control mb-3" placeholder="Konu Başlığı" required>
                                    <div class="row mb-3">
                                        <div class="col-6"><input type="number" id="inpTopicOrder" class="form-control" placeholder="Sıra"></div>
                                        <div class="col-6">
                                            <select id="inpTopicCategory" class="form-control">
                                                <option value="ortak">Ortak Konular</option>
                                                <option value="alan">Alan Konuları</option>
                                            </select>
                                        </div>
                                    </div>
                                    <select id="inpTopicStatus" class="form-control mb-3"><option value="true">Yayında</option><option value="false">Taslak</option></select>
                                    <button class="btn btn-success w-100">Kaydet</button>
                                </form>
                            </div>
                        </div>

                        <div id="contentEditor" style="display:none; flex-direction:column; height:100%;">
                            
                            <div class="editor-toolbar">
                                <div class="editor-title-group">
                                    <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı...">
                                </div>
                                <div class="editor-actions">
                                    <input type="number" id="inpContentOrder" placeholder="Sıra" style="width:60px;">
                                    <button class="btn btn-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                    <button class="btn btn-success btn-sm" onclick="window.Studio.saveContent()">Kaydet</button>
                                </div>
                            </div>

                            <div class="editor-workspace p-0" style="height:100%; overflow:hidden;">
                                
                                <div id="wsLessonMode" class="p-4" style="height:100%; overflow-y:auto;">
                                    <div class="material-buttons-grid">
                                        <div class="btn-mat" onclick="window.Studio.addMat('html')"><i>📝</i> Metin Ekle</div>
                                        <div class="btn-mat" onclick="window.Studio.addMat('pdf')"><i>📄</i> PDF Ekle</div>
                                        <div class="btn-mat" onclick="window.Studio.addMat('video')"><i>🎥</i> Video Ekle</div>
                                        <div class="btn-mat" onclick="window.Studio.addMat('podcast')"><i>🎙️</i> Podcast Ekle</div>
                                    </div>
                                    <div id="materialsContainer"></div>
                                </div>

                                <div id="wsTestMode" class="wizard-container" style="display:none;">
                                    
                                    <div class="wizard-filter-bar">
                                        <div class="filter-group" style="flex:2;">
                                            <label>Mevzuat / Kaynak</label>
                                            <input type="text" id="wizLegislation" class="form-control form-control-sm font-weight-bold">
                                        </div>
                                        <div class="filter-group">
                                            <label>Madde Aralığı</label>
                                            <div class="d-flex gap-2">
                                                <input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Baş">
                                                <input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Son">
                                            </div>
                                        </div>
                                        <div class="filter-group">
                                            <label>Zorluk</label>
                                            <select id="wizDifficulty" class="form-control form-control-sm">
                                                <option value="">Tümü</option>
                                                <option value="1">Kolay</option>
                                                <option value="3">Orta</option>
                                                <option value="5">Zor</option>
                                            </select>
                                        </div>
                                        <div class="filter-group" style="flex:1.5;">
                                            <label>İçerik Ara</label>
                                            <input type="text" id="wizSearchText" class="form-control form-control-sm" placeholder="Kelime...">
                                        </div>
                                        <button class="btn btn-primary btn-sm" style="height:34px;" onclick="window.Studio.wizard.search()">
                                            🔍 Soruları Getir
                                        </button>
                                        <button class="btn btn-warning btn-sm" style="height:34px;" onclick="window.Studio.wizard.auto()">
                                            ⚡ Rastgele Seç
                                        </button>
                                    </div>

                                    <div class="wizard-split-view">
                                        <div class="wizard-col">
                                            <div class="panel-header">
                                                <span>SORU HAVUZU</span>
                                                <span class="badge bg-secondary" id="poolCount">0</span>
                                            </div>
                                            <div id="poolList" class="panel-body">
                                                <div class="empty-state-box">Lütfen yukarıdan filtreleyip 'Getir' butonuna basın.</div>
                                            </div>
                                        </div>
                                        <div class="wizard-col">
                                            <div class="panel-header">
                                                <span>TEST KAĞIDI</span>
                                                <span class="badge bg-primary" id="paperCount">0</span>
                                            </div>
                                            <div id="paperList" class="panel-body bg-light"></div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// --- JS MANTIĞI ---
// ============================================================

// --- YENİ SIDEBAR MANTIĞI ---
function renderContentNav() {
    const list = document.getElementById('contentListNav');
    const isTestTab = state.sidebarTab === 'test';

    // Tab butonlarını güncelle
    document.querySelectorAll('.studio-tabs .tab-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.studio-tabs .tab-item')[isTestTab ? 1 : 0].classList.add('active');

    // Listeyi Filtrele
    const items = state.currentLessons.filter(l => isTestTab ? l.type === 'test' : l.type !== 'test');

    if (items.length === 0) {
        list.innerHTML = `<div class="text-center p-4 text-muted small">Bu kategoride içerik yok.<br>Yukarıdan yeni ekleyin.</div>`;
        return;
    }

    list.innerHTML = items.map(l => `
        <div class="nav-item ${state.activeLessonId === l.id ? 'active' : ''}" onclick="window.Studio.selectContent('${l.id}')">
            <div class="nav-item-row">
                <span class="nav-icon">${isTestTab ? '📝' : '📄'}</span>
                <span class="nav-title" title="${l.title}">${l.title}</span>
            </div>
            <div class="nav-meta">
                <span>Sıra: ${l.order}</span>
                ${isTestTab ? `<span class="badge-mini">${l.qCount || 0} Soru</span>` : ''}
            </div>
        </div>
    `).join('');
}

// --- DİĞER FONKSİYONLAR ---

// Test Modunu Açınca Havuzu Sıfırla
function prepareEditorUI(type) {
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';

    const badge = document.getElementById('editorBadge');
    if (type === 'test') {
        badge.innerText = "TEST"; badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';

        // ÖNEMLİ: Test modunda wizard flexible display olmalı
        const testModeEl = document.getElementById('wsTestMode');
        testModeEl.style.display = 'flex';
        testModeEl.classList.add('wizard-container'); // Flex class'ını garantile

        // Havuzu boşalt (Performans için)
        // Eğer zaten veri varsa korusun, sadece ilk açılışta boşsa mesaj yazsın
        if (state.poolQuestions.length === 0) {
            document.getElementById('poolList').innerHTML = '<div class="empty-state-box">Lütfen yukarıdan arama yapın.</div>';
            document.getElementById('poolCount').innerText = "0";
        }
    } else {
        badge.innerText = "DERS"; badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
    }
}

// Soruları Ara (Filtreleme)
async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value.trim();

    // Kullanıcıya bir şey yazması gerektiğini belirt, ama çok da katı olma (boşsa uyarı ver)
    if (!code) return alert("Lütfen en azından Mevzuat Kodu/Adı girin.");

    const list = document.getElementById('poolList');
    list.innerHTML = '<div class="text-center p-4">Aranıyor...</div>';

    try {
        // Ana sorgu: Mevzuat koduna göre getir
        // Not: Mevzuat kodu tam eşleşme arıyor. "İdare Hukuku" gibi stringler için...
        // Burada basitçe 'legislationRef.code' == code yaptık. 
        // Kullanıcı "genel" aramalar için belki tümünü getirmek ister ama performans uyarısı vermiştik.
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
        const snap = await getDocs(q);

        // Client-side detaylı filtreleme
        const s = parseInt(document.getElementById('wizStart').value);
        const e = parseInt(document.getElementById('wizEnd').value);
        const diff = document.getElementById('wizDifficulty').value;
        const txt = document.getElementById('wizSearchText').value.toLowerCase();

        let arr = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.isDeleted) return;

            const art = parseInt(d.legislationRef?.article) || 0;
            if (s && art < s) return;
            if (e && art > e) return;
            if (diff && d.difficulty != diff) return;
            if (txt && !d.text.toLowerCase().includes(txt)) return;

            arr.push({ id: doc.id, ...d, artNo: art });
        });

        arr.sort((a, b) => a.artNo - b.artNo);
        state.poolQuestions = arr;
        renderPoolList();

    } catch (err) {
        console.error(err);
        list.innerHTML = '<div class="text-danger p-3">Hata: ' + err.message + '</div>';
    }
}

function renderPoolList() {
    const list = document.getElementById('poolList');
    document.getElementById('poolCount').innerText = state.poolQuestions.length;

    if (state.poolQuestions.length === 0) {
        list.innerHTML = '<div class="empty-state-box">Kriterlere uygun soru bulunamadı.</div>';
        return;
    }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        // Yeni Kart Tasarımı
        return `
            <div class="question-card" style="${isAdded ? 'opacity:0.6; background:#f0fff4;' : ''}">
                <div class="qc-number">Md.${q.artNo}</div>
                <div class="qc-content">
                    <div class="qc-badges">
                        <span class="qc-badge">Seviye ${q.difficulty || 3}</span>
                        ${q.type === 'oncullu' ? '<span class="qc-badge">Öncüllü</span>' : ''}
                    </div>
                    <div class="qc-text">${q.text}</div>
                </div>
                <div class="qc-actions">
                    <button class="btn btn-sm btn-outline-secondary py-0" onclick="window.Studio.wizard.fullEdit('${q.id}')">✏️</button>
                    <button class="btn btn-sm btn-success py-0" onclick="window.Studio.wizard.add('${q.id}')" ${isAdded ? 'disabled' : ''}>+</button>
                </div>
            </div>
        `;
    }).join('');
}

// Konu yükleme (Eski koddaki mantık + Filtreleme)
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Yükleniyor...</td></tr>';
    const q = query(collection(db, "topics"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    state.allTopics = [];
    snap.forEach(doc => { if (doc.data().status !== 'deleted') state.allTopics.push({ id: doc.id, ...doc.data() }); });
    filterTopics();
}

window.filterTopics = () => {
    const tbody = document.getElementById('topicsTableBody');
    if (!tbody) return;
    // Mevcut basit liste görünümü
    tbody.innerHTML = state.allTopics.map(t => `
        <tr>
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td>${t.category}</td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? 'Yayında' : 'Taslak'}</td>
            <td><button class="btn btn-sm btn-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button></td>
        </tr>
    `).join('');
};

async function openEditor(id = null) {
    document.getElementById('topicModal').style.display = 'flex';
    state.activeTopicId = id;
    state.sidebarTab = 'lesson'; // Varsayılan sekme

    if (id) {
        const t = state.allTopics.find(x => x.id === id);
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = t.title;
        document.getElementById('inpTopicOrder').value = t.order;
        document.getElementById('inpTopicCategory').value = t.category;
        document.getElementById('inpTopicStatus').value = t.isActive;

        // Otomatik filtre (Mevcut mantık: Başlıktaki sayıyı al vs.)
        state.autoFilter = t.title;

        await loadLessons(id);

        // Eğer ders veya test varsa ilkini aç, yoksa meta ekranında kal
        if (state.currentLessons.length > 0) {
            selectContentItem(state.currentLessons[0].id);
        } else {
            showMetaEditor();
        }
        renderContentNav();
    } else {
        // Yeni konu
        document.getElementById('contentListNav').innerHTML = '';
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);
    state.currentLessons = [];
    snap.forEach(d => state.currentLessons.push({ id: d.id, ...d.data() }));
    // renderContentNav çağrısı openEditor içinde yapılıyor
}

function showMetaEditor() {
    document.getElementById('metaEditor').style.display = 'block';
    document.getElementById('contentEditor').style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
}

async function saveTopicMeta() {
    // Basit kayıt
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;
    const data = {
        title,
        order: parseInt(document.getElementById('inpTopicOrder').value),
        category: document.getElementById('inpTopicCategory').value,
        isActive: document.getElementById('inpTopicStatus').value === 'true'
    };

    if (id) {
        await updateDoc(doc(db, "topics", id), data);
    } else {
        data.status = 'active';
        await addDoc(collection(db, "topics"), data);
    }
    document.getElementById('topicModal').style.display = 'none';
    loadTopics();
}

function createNewContent(type) {
    if (!state.activeTopicId) return alert("Önce konuyu kaydedin.");
    state.activeLessonId = null;
    state.activeLessonType = type;

    prepareEditorUI(type);
    document.getElementById('inpContentTitle').value = "";
    // Temizle
    state.tempMaterials = [];
    state.tempQuestions = [];
    if (type === 'lesson') renderMaterials();
    else {
        renderTestPaper();
        // Yeni test açarken filtreyi konunun adıyla otomatik doldur
        document.getElementById('wizLegislation').value = state.autoFilter || "";
    }
}

function selectContentItem(id) {
    const item = state.currentLessons.find(x => x.id === id);
    if (!item) return;

    state.activeLessonId = id;
    state.activeLessonType = item.type || 'lesson';

    prepareEditorUI(state.activeLessonType);
    document.getElementById('inpContentTitle').value = item.title;
    document.getElementById('inpContentOrder').value = item.order;

    if (state.activeLessonType === 'lesson') {
        state.tempMaterials = item.materials || [];
        renderMaterials();
    } else {
        state.tempQuestions = item.questions || [];
        renderTestPaper();
        // Otomatik filtreyi doldur
        const autoCode = item.legislationCode || state.autoFilter || "";
        document.getElementById('wizLegislation').value = autoCode;

        // Eğer önceden kaydedilmiş sorular varsa onları getirip göstermek yerine
        // Sadece kağıdı gösteriyoruz, havuzu kullanıcının aramasına bırakıyoruz.
    }
    renderContentNav();
}

// Materyal Ekleme
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
    document.getElementById('materialsContainer').innerHTML = state.tempMaterials.map(m => `
        <div class="material-row">
            <div style="font-size:1.5rem; margin-right:10px;">
                ${m.type === 'video' ? '🎥' : m.type === 'podcast' ? '🎙️' : m.type === 'pdf' ? '📄' : '📝'}
            </div>
            <div style="flex:1;">
                <input type="text" class="form-control mb-1" placeholder="Başlık" value="${m.title}" oninput="window.Studio.updateMat(${m.id},'title',this.value)">
                ${m.type === 'html' ?
            `<textarea class="form-control" placeholder="İçerik" oninput="window.Studio.updateMat(${m.id},'url',this.value)">${m.url}</textarea>` :
            `<input type="text" class="form-control" placeholder="Link/URL" value="${m.url}" oninput="window.Studio.updateMat(${m.id},'url',this.value)">`
        }
            </div>
            <button class="btn btn-sm text-danger" onclick="window.Studio.removeMat(${m.id})">×</button>
        </div>
    `).join('');
}

// Test Kağıdı Render
function renderTestPaper() {
    const list = document.getElementById('paperList');
    document.getElementById('paperCount').innerText = state.tempQuestions.length;

    if (state.tempQuestions.length === 0) {
        list.innerHTML = '<div class="empty-state-box">Test kağıdı boş.<br>Soldan soru ekleyin.</div>';
        return;
    }

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="question-card">
            <div class="qc-number">${i + 1}.</div>
            <div class="qc-content">
                 <div class="qc-badges">
                    <span class="badge-mini">Md.${q.artNo}</span>
                 </div>
                <div class="qc-text">${q.text}</div>
            </div>
            <div class="qc-actions">
                <button class="btn btn-sm btn-danger py-0" onclick="window.Studio.wizard.remove(${i})">×</button>
            </div>
        </div>
    `).join('');
}

function addToTestPaper(id) {
    const q = state.poolQuestions.find(x => x.id === id);
    if (q && !state.tempQuestions.some(x => x.id === id)) {
        state.tempQuestions.push(q);
        renderTestPaper();
        renderPoolList(); // Butonu pasif yapmak için
    }
}

function removeFromTestPaper(i) {
    state.tempQuestions.splice(i, 1);
    renderTestPaper();
    renderPoolList();
}

function autoGenerateTest() {
    if (state.poolQuestions.length === 0) return alert("Önce soru getirin (Arama yapın).");
    // Rastgele 15 seç
    const shuffled = [...state.poolQuestions].sort(() => 0.5 - Math.random());
    // Eklenmemiş olanları al
    const clean = shuffled.filter(q => !state.tempQuestions.some(x => x.id === q.id));

    const needed = 15;
    const toAdd = clean.slice(0, needed);

    state.tempQuestions.push(...toAdd);
    state.tempQuestions.sort((a, b) => a.artNo - b.artNo);

    renderTestPaper();
    renderPoolList();
}

async function saveContent() {
    let title = document.getElementById('inpContentTitle').value;
    if (!title) return alert("Başlık giriniz.");

    const data = {
        title,
        type: state.activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value) || 0,
        isActive: true
    };

    if (state.activeLessonType === 'test') {
        data.questions = state.tempQuestions;
        data.qCount = state.tempQuestions.length;
        // Kaydederken mevcut mevzuat adını da kaydedelim, açılınca otomatik gelsin
        data.legislationCode = document.getElementById('wizLegislation').value;
    } else {
        data.materials = state.tempMaterials;
    }

    try {
        if (state.activeLessonId) {
            await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId), data);
        } else {
            await addDoc(collection(db, `topics/${state.activeTopicId}/lessons`), data);
            // Sayı güncelleme vs (opsiyonel)
        }
        alert("Kaydedildi.");
        await loadLessons(state.activeTopicId);
        selectContentItem(state.activeLessonId); // Yeniden seç ki listeyi güncelle
    } catch (e) { alert(e.message); }
}

async function deleteContent() {
    if (!state.activeLessonId) return;
    if (confirm("Silmek istiyor musunuz?")) {
        await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId));
        await loadLessons(state.activeTopicId);
        showMetaEditor();
    }
}