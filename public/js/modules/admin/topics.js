import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { openQuestionEditor } from './content.js';
import { UI_SHELL, renderNavItem } from './topics.ui.js'; // UI Modülünü Import Ettik

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

    // 1. HTML'i Yükle (UI dosyasından)
    const container = document.getElementById('section-topics');
    if (container) container.innerHTML = UI_SHELL;

    // 2. Global Erişim (window objesine fonksiyonları ata)
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

    const q = query(collection(db, "topics"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    state.allTopics = [];
    snap.forEach(doc => { if (doc.data().status !== 'deleted') state.allTopics.push({ id: doc.id, ...doc.data() }); });
    renderTopicsTable();
}

// Global Filter Fonksiyonu (HTML'den çağrılıyor)
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

    if (id) {
        const t = state.allTopics.find(x => x.id === id);
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = t.title;
        document.getElementById('inpTopicOrder').value = t.order;
        document.getElementById('inpTopicCategory').value = t.category;
        document.getElementById('inpTopicStatus').value = t.isActive;

        state.autoFilter = t.title;
        await loadLessons(id);

        if (state.currentLessons.length > 0) selectContentItem(state.currentLessons[0].id);
        else showMetaEditor();
    } else {
        document.getElementById('editTopicId').value = "";
        document.getElementById('inpTopicTitle').value = "";
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        document.getElementById('contentListNav').innerHTML = '';
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

    // Tab butonlarını güncelle (Aktif class'ı)
    document.querySelectorAll('.studio-tabs .tab-item').forEach((el, idx) => {
        el.classList.toggle('active', (isTest ? idx === 1 : idx === 0));
    });

    const items = state.currentLessons.filter(l => isTest ? l.type === 'test' : l.type !== 'test');

    if (items.length === 0) {
        list.innerHTML = `<div class="text-center p-4 text-muted small">Bu kategoride içerik yok.<br>Yukarıdan ekleyin.</div>`;
        return;
    }

    // UI dosyasından gelen render fonksiyonunu kullanıyoruz
    // DİKKAT: renderNavItem fonksiyonunu topics.ui.js'den import ettiğinden emin ol
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
        document.getElementById('poolList').innerHTML = '<div class="empty-state-box">Filtreleyin...</div>';
    }
    renderContentNav();
}

function prepareEditorUI(type) {
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';

    const badge = document.getElementById('editorBadge');
    if (type === 'test') {
        badge.innerText = "TEST"; badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'flex';
    } else {
        badge.innerText = "DERS"; badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
    }
}

function showMetaEditor() {
    document.getElementById('metaEditor').style.display = 'block';
    document.getElementById('contentEditor').style.display = 'none';
    state.activeLessonId = null;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
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
    document.getElementById('materialsContainer').innerHTML = state.tempMaterials.map(m => `
        <div class="material-row">
            <div style="font-size:1.5rem;">${m.type === 'video' ? '🎥' : m.type === 'podcast' ? '🎙️' : m.type === 'pdf' ? '📄' : '📝'}</div>
            <div style="flex:1;">
                <input type="text" class="form-control mb-1" placeholder="Başlık" value="${m.title}" oninput="window.Studio.updateMat(${m.id},'title',this.value)">
                ${m.type === 'html' ? `<textarea class="form-control" placeholder="İçerik" oninput="window.Studio.updateMat(${m.id},'url',this.value)">${m.url}</textarea>` : `<input type="text" class="form-control" placeholder="URL" value="${m.url}" oninput="window.Studio.updateMat(${m.id},'url',this.value)">`}
            </div>
            <button class="btn btn-sm text-danger" onclick="window.Studio.removeMat(${m.id})">×</button>
        </div>
    `).join('');
}

async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value.trim();
    if (!code) return alert("Mevzuat kodu girin.");

    document.getElementById('poolList').innerHTML = '<div class="text-center p-4">Aranıyor...</div>';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
    const snap = await getDocs(q);

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
}

function renderPoolList() {
    const list = document.getElementById('poolList');
    document.getElementById('poolCount').innerText = state.poolQuestions.length;

    if (state.poolQuestions.length === 0) { list.innerHTML = '<div class="empty-state-box">Sonuç yok.</div>'; return; }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        return `
            <div class="question-card" style="${isAdded ? 'opacity:0.5; background:#f0fdf4' : ''}">
                <div class="qc-number">${q.artNo}</div>
                <div class="qc-content"><div class="qc-text">${q.text}</div></div>
                <div class="qc-actions">
                    <button class="btn btn-sm btn-outline-secondary py-0" onclick="window.Studio.wizard.fullEdit('${q.id}')">✏️</button>
                    <button class="btn btn-sm btn-success py-0" onclick="window.Studio.wizard.add('${q.id}')" ${isAdded ? 'disabled' : ''}>+</button>
                </div>
            </div>`;
    }).join('');
}

function addToTestPaper(id) {
    const q = state.poolQuestions.find(x => x.id === id);
    if (q && !state.tempQuestions.some(x => x.id === id)) {
        state.tempQuestions.push(q);
        renderTestPaper(); renderPoolList();
    }
}
function removeFromTestPaper(i) {
    state.tempQuestions.splice(i, 1);
    renderTestPaper(); renderPoolList();
}
function renderTestPaper() {
    const list = document.getElementById('paperList');
    document.getElementById('paperCount').innerText = state.tempQuestions.length;

    if (state.tempQuestions.length === 0) { list.innerHTML = '<div class="empty-state-box">Kağıt boş.</div>'; return; }

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="question-card">
            <div class="qc-number">${i + 1}.</div>
            <div class="qc-content"><div class="qc-text">${q.text}</div></div>
            <div class="qc-actions"><button class="btn btn-sm btn-danger py-0" onclick="window.Studio.wizard.remove(${i})">×</button></div>
        </div>`).join('');
}
function autoGenerateTest() {
    if (state.poolQuestions.length === 0) return alert("Arama yapın.");
    const shuffled = [...state.poolQuestions].sort(() => 0.5 - Math.random()).slice(0, 15).sort((a, b) => a.artNo - b.artNo);
    state.tempQuestions = shuffled;
    renderTestPaper(); renderPoolList();
}

async function openTrash() {
    const modal = document.getElementById('trashModal');
    if (!modal) return;
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