/* DOSYA: public/js/modules/admin/topics.js */

import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { openQuestionEditor } from './content.js';
import { UI_SHELL, renderNavItem } from './topics.ui.js';

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
    sidebarTab: 'lesson',
    autoFilter: ''
};

// ============================================================
// --- INIT ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro: Logic Module Loaded");

    const container = document.getElementById('section-topics');
    if (container) container.innerHTML = UI_SHELL;

    // Window fonksiyonlarını bağla
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
        switchTab: switchTabHandler,
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
        trash: { open: openTrash, restore: restoreItem, purge: purgeItem }
    };

    loadTopics();
}

// ============================================================
// --- VERİ YÖNETİMİ ---
// ============================================================
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snap = await getDocs(q);
        state.allTopics = [];
        snap.forEach(doc => { if (doc.data().status !== 'deleted') state.allTopics.push({ id: doc.id, ...doc.data() }); });
        renderTopicsTable();
    } catch (e) {
        console.error(e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger p-3">Veri yüklenemedi.</td></tr>';
    }
}

window.filterTopics = renderTopicsTable;

function renderTopicsTable() {
    const tbody = document.getElementById('topicsTableBody');
    const search = document.getElementById('searchTopic')?.value.toLowerCase() || '';
    const cat = document.getElementById('filterCategory')?.value || 'all';

    if (!tbody) return;

    const filtered = state.allTopics.filter(t =>
        (cat === 'all' || t.category === cat) &&
        (t.title || '').toLowerCase().includes(search)
    );

    document.getElementById('topicCountBadge').innerText = `${filtered.length} Kayıt`;

    tbody.innerHTML = filtered.length ? filtered.map(t => `
        <tr>
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge bg-light border text-dark">${t.category}</span></td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? '<span class="text-success">Yayında</span>' : '<span class="text-muted">Taslak</span>'}</td>
            <td class="text-end"><button class="btn btn-sm btn-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button></td>
        </tr>
    `).join('') : '<tr><td colspan="6" class="text-center p-4">Kayıt bulunamadı.</td></tr>';
}

// ============================================================
// --- STUDIO FONKSİYONLARI ---
// ============================================================

async function openEditor(id = null) {
    document.getElementById('topicModal').style.display = 'flex';
    state.activeTopicId = id;
    state.sidebarTab = 'lesson';

    document.getElementById('tabLesson').classList.add('active');
    document.getElementById('tabTest').classList.remove('active');

    if (id) {
        const t = state.allTopics.find(x => x.id === id);
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = t.title;
        document.getElementById('inpTopicOrder').value = t.order;
        document.getElementById('inpTopicCategory').value = t.category;
        document.getElementById('inpTopicStatus').value = t.isActive;
        document.getElementById('activeTopicTitleDisplay').innerText = t.title;

        state.autoFilter = t.title;
        await loadLessons(id);

        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('metaEditor').style.display = 'none';
        document.getElementById('contentEditor').style.display = 'none';
    } else {
        document.getElementById('editTopicId').value = "";
        document.getElementById('inpTopicTitle').value = "";
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        document.getElementById('contentListNav').innerHTML = '';
        document.getElementById('activeTopicTitleDisplay').innerText = "Yeni Konu Oluşturuluyor...";
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    document.getElementById('contentListNav').innerHTML = '<div class="text-center p-2">Yükleniyor...</div>';
    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);
    state.currentLessons = [];
    snap.forEach(d => state.currentLessons.push({ id: d.id, ...d.data() }));
    renderContentNav();
}

function switchTabHandler(tab) {
    state.sidebarTab = tab;
    renderContentNav();
}

function renderContentNav() {
    const list = document.getElementById('contentListNav');
    const isTest = state.sidebarTab === 'test';

    document.querySelectorAll('.studio-sidebar .segment-btn').forEach((el) => {
        el.classList.toggle('active', el.id === (isTest ? 'tabTest' : 'tabLesson'));
    });

    const items = state.currentLessons.filter(l => isTest ? l.type === 'test' : l.type !== 'test');

    if (items.length === 0) {
        list.innerHTML = `<div class="text-center p-4 text-muted small">Bu kategoride içerik yok.<br>Yukarıdan ekleyin.</div>`;
        return;
    }
    list.innerHTML = items.map(l => renderNavItem(l, isTest, state.activeLessonId)).join('');
}

function createNewContent(type) {
    if (!state.activeTopicId) return alert("Önce konuyu kaydedin.");
    const contentType = type || state.sidebarTab;
    state.activeLessonId = null;
    state.activeLessonType = contentType;

    prepareEditorUI(contentType);
    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentTitle').focus();
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;

    state.tempMaterials = [];
    state.tempQuestions = [];

    if (contentType === 'lesson') renderMaterials();
    else {
        renderTestPaper();
        document.getElementById('wizLegislation').value = state.autoFilter || "";
        document.getElementById('poolList').innerHTML = '<div class="text-center text-muted p-4">Arama yapın...</div>';
    }

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
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
        document.getElementById('wizLegislation').value = item.legislationCode || state.autoFilter || "";
        document.getElementById('poolList').innerHTML = '<div class="text-center text-muted p-4">Diğer sorular için arama yapın.</div>';
    }
    renderContentNav();
}

function prepareEditorUI(type) {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';

    const badge = document.getElementById('editorBadge');

    if (type === 'test') {
        badge.innerText = "TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.setProperty('display', 'flex', 'important');
    } else {
        badge.innerText = "DERS";
        badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.setProperty('display', 'none', 'important');
    }
}

function showMetaEditor() {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'none';
    document.getElementById('metaEditor').style.display = 'flex';

    state.activeLessonId = null;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const topicTitle = document.getElementById('inpTopicTitle').value;
    document.getElementById('activeTopicTitleDisplay').innerText = topicTitle || "Yeni Konu";
}

// --- SAVE & HELPERS ---
async function saveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;
    if (!title) return alert("Başlık giriniz.");

    const data = {
        title,
        order: parseInt(document.getElementById('inpTopicOrder').value),
        category: document.getElementById('inpTopicCategory').value,
        isActive: document.getElementById('inpTopicStatus').value === 'true',
        updatedAt: serverTimestamp()
    };

    try {
        if (id) await updateDoc(doc(db, "topics", id), data);
        else {
            data.createdAt = serverTimestamp(); data.status = 'active'; data.lessonCount = 0;
            const ref = await addDoc(collection(db, "topics"), data);
            state.activeTopicId = ref.id;
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Kaydedildi."); loadTopics();
    } catch (e) { alert(e.message); }
}

async function saveContent() {
    let title = document.getElementById('inpContentTitle').value.trim();
    if (!title) {
        const count = state.currentLessons.filter(l => l.type === state.activeLessonType).length + 1;
        title = state.activeLessonType === 'test' ? `Konu Testi ${count}` : `Ders Notu ${count}`;
        document.getElementById('inpContentTitle').value = title;
    }

    const data = {
        title,
        type: state.activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value) || 0,
        isActive: true,
        updatedAt: serverTimestamp()
    };

    if (state.activeLessonType === 'test') {
        data.questions = state.tempQuestions;
        data.qCount = state.tempQuestions.length;
        data.legislationCode = document.getElementById('wizLegislation').value;
    } else {
        data.materials = state.tempMaterials;
    }

    try {
        if (state.activeLessonId) await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId), data);
        else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${state.activeTopicId}/lessons`), data);
            await updateDoc(doc(db, "topics", state.activeTopicId), { lessonCount: state.currentLessons.length + 1 });
        }
        const btn = document.querySelector('#contentEditor .btn-success');
        const old = btn.innerHTML; btn.innerHTML = '✓'; setTimeout(() => btn.innerHTML = old, 1500);
        loadLessons(state.activeTopicId);
    } catch (e) { alert(e.message); }
}

async function deleteContent() {
    if (state.activeLessonId && confirm("Silinsin mi?")) {
        await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId));
        loadLessons(state.activeTopicId);
        showMetaEditor();
    }
}

function addMaterialUI(type) { state.tempMaterials.push({ id: Date.now(), type, title: '', url: '' }); renderMaterials(); }
function removeMaterialUI(id) { state.tempMaterials = state.tempMaterials.filter(m => m.id !== id); renderMaterials(); }
function updateMaterialItem(id, field, val) { const item = state.tempMaterials.find(m => m.id === id); if (item) item[field] = val; }

function renderMaterials() {
    const container = document.getElementById('materialsContainer');
    if (state.tempMaterials.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-4 border dashed rounded">Henüz materyal eklenmedi.</div>';
        return;
    }
    container.innerHTML = state.tempMaterials.map(m => `
        <div class="material-item">
            <div class="mat-icon">${m.type === 'video' ? '🎥' : m.type === 'podcast' ? '🎙️' : m.type === 'pdf' ? '📄' : '📝'}</div>
            <div class="mat-content flex-grow-1">
                <input type="text" class="form-control form-control-sm fw-bold mb-1" placeholder="Başlık" value="${m.title}" oninput="window.Studio.updateMat(${m.id},'title',this.value)">
                ${m.type === 'html'
            ? `<textarea class="form-control form-control-sm font-monospace" rows="2" placeholder="İçerik" oninput="window.Studio.updateMat(${m.id},'url',this.value)">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm text-muted" placeholder="URL" value="${m.url}" oninput="window.Studio.updateMat(${m.id},'url',this.value)">`}
            </div>
            <button class="btn btn-outline-danger btn-sm border-0" onclick="window.Studio.removeMat(${m.id})">&times;</button>
        </div>
    `).join('');
}

// ============================================================
// --- TEST & SORU HAVUZU MANTIĞI ---
// ============================================================

async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value.trim();
    if (!code) return alert("Lütfen bir Mevzuat Kodu girin.");

    document.getElementById('poolList').innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>';

    try {
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
        const snap = await getDocs(q);

        const startArt = parseInt(document.getElementById('wizStart').value) || 0;
        const endArt = parseInt(document.getElementById('wizEnd').value) || 99999;
        const diffFilter = document.getElementById('wizDifficulty').value;
        const txtFilter = document.getElementById('wizSearchText').value.toLowerCase();

        let filteredArr = [];

        snap.forEach(doc => {
            const d = doc.data();
            if (d.isDeleted) return;
            const artRaw = d.legislationRef?.article;
            const artNo = parseInt(artRaw);

            if (!isNaN(artNo) && (artNo < startArt || artNo > endArt)) return;
            if (diffFilter) {
                if (diffFilter === "1" && d.difficulty > 2) return;
                if (diffFilter === "3" && d.difficulty !== 3) return;
                if (diffFilter === "5" && d.difficulty < 4) return;
            }
            if (txtFilter && !d.text.toLowerCase().includes(txtFilter)) return;
            filteredArr.push({ id: doc.id, ...d, artNo: isNaN(artNo) ? 99999 : artNo });
        });

        filteredArr.sort((a, b) => a.artNo - b.artNo);
        state.poolQuestions = filteredArr;
        document.getElementById('poolCount').innerText = filteredArr.length;
        renderPoolList();

    } catch (error) {
        console.error("Hata:", error);
        document.getElementById('poolList').innerHTML = `<div class="text-center text-danger p-2 small">${error.message}</div>`;
    }
}

function autoGenerateTest() {
    if (state.poolQuestions.length === 0) {
        if (document.getElementById('wizLegislation').value) {
            searchQuestions().then(() => {
                if (state.poolQuestions.length > 0) performSmartSelection();
                else alert("Soru bulunamadı.");
            });
        } else {
            alert("Mevzuat kodu girin.");
        }
    } else {
        performSmartSelection();
    }
}

function performSmartSelection() {
    const targetCount = 15;
    let pool = [...state.poolQuestions];
    const addedIds = new Set(state.tempQuestions.map(q => q.id));
    pool = pool.filter(q => !addedIds.has(q.id));

    if (pool.length === 0) return alert("Tüm sorular zaten ekli.");

    let selection = pool.sort(() => 0.5 - Math.random()).slice(0, targetCount);
    selection.sort((a, b) => a.artNo - b.artNo);

    state.tempQuestions = [...state.tempQuestions, ...selection];
    renderTestPaper();
    renderPoolList();
}

function addToTestPaper(id) {
    const question = state.poolQuestions.find(q => q.id === id);
    if (!question || state.tempQuestions.some(q => q.id === id)) return;
    state.tempQuestions.push(question);
    state.tempQuestions.sort((a, b) => (a.artNo || 0) - (b.artNo || 0));
    renderTestPaper();
    renderPoolList();
}

function removeFromTestPaper(id) {
    state.tempQuestions = state.tempQuestions.filter(q => q.id !== id);
    renderTestPaper();
    renderPoolList();
}

function renderTestPaper() {
    const container = document.getElementById('testQuestionsList');
    const countDisplay = document.getElementById('testQuestionCount');
    if (countDisplay) countDisplay.innerText = `${state.tempQuestions.length} Soru`;

    if (state.tempQuestions.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-4 small">Henüz soru eklenmedi.</div>';
        return;
    }

    container.innerHTML = state.tempQuestions.map((q, index) => `
        <div class="material-item p-2 mb-1" style="font-size:0.9rem;">
            <div style="width:25px; font-weight:bold; color:#64748b;">${index + 1}.</div>
            <div style="flex:1;">
                <span class="badge bg-light text-dark border me-1">Md.${q.legislationRef?.article || '?'}</span>
                <span class="text-dark">${q.text.substring(0, 60)}...</span>
            </div>
            <button class="btn btn-sm text-danger p-0" onclick="window.Studio.wizard.remove('${q.id}')">&times;</button>
        </div>
    `).join('');
}

function renderPoolList() {
    const list = document.getElementById('poolList');
    if (!list) return;

    if (!state.poolQuestions || state.poolQuestions.length === 0) {
        list.innerHTML = '<div class="text-center p-3 text-muted small">Sonuç yok.</div>';
        return;
    }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        const btn = isAdded
            ? `<button class="btn btn-sm btn-light text-success disabled p-1" style="font-size:0.7rem;">Ekli</button>`
            : `<button class="btn btn-sm btn-outline-primary p-1" style="font-size:0.7rem;" onclick="window.Studio.wizard.add('${q.id}')">Ekle</button>`;

        return `
        <div class="material-item p-2 mb-1" style="border-left: 3px solid ${isAdded ? '#10b981' : '#e2e8f0'};">
            <div style="flex:1;">
                <div class="d-flex align-items-center mb-1">
                    <span class="badge bg-secondary me-2" style="font-size:0.65rem;">Md. ${q.legislationRef?.article}</span>
                    <span class="text-muted" style="font-size:0.7rem;">${q.difficulty === 1 ? 'Kolay' : q.difficulty === 5 ? 'Zor' : 'Orta'}</span>
                </div>
                <div class="text-truncate small" style="max-width:200px;">${q.text}</div>
            </div>
            ${btn}
        </div>`;
    }).join('');
}

async function openTrash() {
    const modal = document.getElementById('trashModal');
    modal.style.display = 'flex';
    const tbody = document.getElementById('trashTableBody');
    tbody.innerHTML = '<tr><td>Yükleniyor...</td></tr>';
    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snap = await getDocs(q);
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="2">Boş</td></tr>'; return; }
    tbody.innerHTML = snap.docs.map(d => `<tr><td>${d.data().title}</td><td class="text-end"><button class="btn btn-success btn-sm" onclick="window.Studio.trash.restore('${d.id}')">Geri</button></td></tr>`).join('');
}
async function restoreItem(id) { await updateDoc(doc(db, "topics", id), { status: 'active' }); openTrash(); loadTopics(); }
async function purgeItem(id) { }