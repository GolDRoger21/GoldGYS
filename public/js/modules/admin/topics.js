/* DOSYA: public/js/modules/admin/topics.js */

import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where
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
    tempQuestions: [], // Test kağıdındaki sorular
    poolQuestions: [], // Arama sonuçları
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
        trash: { open: openTrash, restore: restoreItem }
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

    // Tab ve Arayüz Sıfırlama
    switchTabHandler('lesson');

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
    document.getElementById('contentListNav').innerHTML = '<div class="text-center p-2 small text-muted">Yükleniyor...</div>';
    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);
    state.currentLessons = [];
    snap.forEach(d => state.currentLessons.push({ id: d.id, ...d.data() }));
    renderContentNav();
}

function switchTabHandler(tab) {
    state.sidebarTab = tab;

    // Segmented Control Görsel Güncelleme
    const btnLesson = document.getElementById('tabLesson');
    const btnTest = document.getElementById('tabTest');

    if (tab === 'lesson') {
        btnLesson.classList.add('active');
        btnTest.classList.remove('active');
    } else {
        btnLesson.classList.remove('active');
        btnTest.classList.add('active');
    }

    renderContentNav();
}

function renderContentNav() {
    const list = document.getElementById('contentListNav');
    const isTest = state.sidebarTab === 'test';
    const items = state.currentLessons.filter(l => isTest ? l.type === 'test' : l.type !== 'test');

    if (items.length === 0) {
        list.innerHTML = `<div class="text-center p-5 text-muted small opacity-50">Bu kategoride içerik yok.</div>`;
        return;
    }
    list.innerHTML = items.map(l => renderNavItem(l, isTest, state.activeLessonId)).join('');
}

function createNewContent(type) {
    if (!state.activeTopicId) return alert("Lütfen önce konuyu kaydedin.");
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
        document.getElementById('poolList').innerHTML = '<div class="text-center mt-5 small text-muted">Aramaya başlamak için<br>kriterleri giriniz.</div>';
    }

    // Listedeki aktifliği kaldır
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
        // Havuzu sıfırlama, kullanıcı belki aramaya devam etmek ister
    }
    renderContentNav();
}

function prepareEditorUI(type) {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';

    const badge = document.getElementById('editorBadge');
    if (type === 'test') {
        badge.innerText = "TEST EDİTÖRÜ";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'flex';
    } else {
        badge.innerText = "DERS EDİTÖRÜ";
        badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
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

// --- SAVE OPERATIONS ---

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
        if (id) await updateDoc(doc(db, "topics", id), data);
        else {
            data.createdAt = serverTimestamp(); data.status = 'active'; data.lessonCount = 0;
            const ref = await addDoc(collection(db, "topics"), data);
            state.activeTopicId = ref.id;
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Konu ayarları kaydedildi.");
        loadTopics();
    } catch (e) { alert(e.message); }
}

async function saveContent() {
    let title = document.getElementById('inpContentTitle').value.trim();
    if (!title) {
        title = state.activeLessonType === 'test' ? 'Yeni Test' : 'Yeni Ders';
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
            // Konu ders sayısını artır (opsiyonel)
        }

        // Basit feedback
        const btn = document.querySelector('#contentEditor .btn-success');
        const oldText = btn.innerHTML;
        btn.innerHTML = '✅ Kaydedildi';
        setTimeout(() => btn.innerHTML = oldText, 1500);

        loadLessons(state.activeTopicId);
    } catch (e) { alert(e.message); }
}

async function deleteContent() {
    if (state.activeLessonId && confirm("Bu içeriği silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId));
        loadLessons(state.activeTopicId);
        showMetaEditor();
    }
}

// --- MATERIAL HELPERS ---
function addMaterialUI(type) { state.tempMaterials.push({ id: Date.now(), type, title: '', url: '' }); renderMaterials(); }
function removeMaterialUI(id) { state.tempMaterials = state.tempMaterials.filter(m => m.id !== id); renderMaterials(); }
function updateMaterialItem(id, field, val) { const item = state.tempMaterials.find(m => m.id === id); if (item) item[field] = val; }

function renderMaterials() {
    const container = document.getElementById('materialsContainer');
    if (state.tempMaterials.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-4 border dashed rounded bg-light">Henüz materyal eklenmedi.</div>';
        return;
    }
    container.innerHTML = state.tempMaterials.map(m => `
        <div class="material-item">
            <div class="mat-icon">${m.type === 'video' ? '🎥' : m.type === 'podcast' ? '🎙️' : m.type === 'pdf' ? '📄' : '📝'}</div>
            <div class="mat-content">
                <input type="text" class="form-control fw-bold" placeholder="Materyal Başlığı" value="${m.title}" oninput="window.Studio.updateMat(${m.id},'title',this.value)">
                ${m.type === 'html'
            ? `<textarea class="form-control font-monospace small" rows="2" placeholder="İçerik / HTML Kodu" oninput="window.Studio.updateMat(${m.id},'url',this.value)">${m.url}</textarea>`
            : `<input type="text" class="form-control small text-muted" placeholder="URL / Dosya Yolu" value="${m.url}" oninput="window.Studio.updateMat(${m.id},'url',this.value)">`}
            </div>
            <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.removeMat(${m.id})">&times;</button>
        </div>
    `).join('');
}

// ============================================================
// --- GELİŞMİŞ ALGORİTMA VE SORGULAMA ---
// ============================================================

async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value.trim();
    if (!code) return alert("Lütfen bir Mevzuat Kodu girin (Örn: 5271).");

    const poolList = document.getElementById('poolList');
    poolList.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"></div><br>Sorular Taranıyor...</div>';

    try {
        // 1. Firestore'dan sadece koda göre çek
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
        const snap = await getDocs(q);

        // 2. Filtre Parametrelerini Al
        const startArt = parseInt(document.getElementById('wizStart').value) || 0;
        const endArt = parseInt(document.getElementById('wizEnd').value) || 99999;
        const diffFilter = document.getElementById('wizDifficulty').value;
        const txtFilter = document.getElementById('wizSearchText').value.toLowerCase();

        let filteredArr = [];

        snap.forEach(doc => {
            const d = doc.data();
            if (d.isDeleted) return;

            // Madde No Dönüşümü (Güvenli)
            // String "12/A" veya "Geçici 1" gibi değerler gelebilir, parseInt sadece baştaki sayıyı alır.
            const artNo = parseInt(d.legislationRef?.article);

            // A. Madde Aralığı
            if (!isNaN(artNo)) {
                if (artNo < startArt || artNo > endArt) return;
            }

            // B. Zorluk Filtresi
            if (diffFilter) {
                // "1" = Kolay (1-2), "3" = Orta (3), "5" = Zor (4-5)
                if (diffFilter === "1" && d.difficulty > 2) return;
                if (diffFilter === "3" && d.difficulty !== 3) return;
                if (diffFilter === "5" && d.difficulty < 4) return;
            }

            // C. Metin Arama
            if (txtFilter && !d.text.toLowerCase().includes(txtFilter)) return;

            filteredArr.push({ id: doc.id, ...d, artNo: isNaN(artNo) ? 99999 : artNo });
        });

        // 3. Sıralama (Madde Numarasına Göre)
        filteredArr.sort((a, b) => a.artNo - b.artNo);

        state.poolQuestions = filteredArr;
        renderPoolList();

    } catch (error) {
        console.error("Sorgu Hatası:", error);
        poolList.innerHTML = `<div class="text-center text-danger p-3">Hata: ${error.message}</div>`;
    }
}

function autoGenerateTest() {
    if (state.poolQuestions.length === 0) {
        // Havuz boşsa, mevcut kod ile arama yapmayı dene
        if (document.getElementById('wizLegislation').value) {
            searchQuestions().then(() => {
                if (state.poolQuestions.length > 0) performSmartSelection();
                else alert("Kriterlere uygun soru bulunamadı.");
            });
            return;
        } else {
            return alert("Lütfen önce Mevzuat Kodu girin.");
        }
    } else {
        performSmartSelection();
    }
}

function performSmartSelection() {
    const targetCount = 15;
    let pool = [...state.poolQuestions];

    // Mükerrer Kontrolü (Kağıtta zaten varsa ekleme)
    const addedIds = new Set(state.tempQuestions.map(q => q.id));
    pool = pool.filter(q => !addedIds.has(q.id));

    if (pool.length === 0) return alert("Havuzdaki tüm sorular zaten eklendi.");

    let selection = [];
    const difficultyMode = document.getElementById('wizDifficulty').value;

    if (!difficultyMode) {
        // --- DENGELİ DAĞILIM (Kolay: 20%, Orta: 60%, Zor: 20%) ---
        const easy = pool.filter(q => q.difficulty <= 2);
        const medium = pool.filter(q => q.difficulty === 3);
        const hard = pool.filter(q => q.difficulty >= 4);

        const countEasy = Math.ceil(targetCount * 0.2);
        const countHard = Math.ceil(targetCount * 0.2);
        const countMedium = targetCount - countEasy - countHard;

        selection = [
            ...easy.sort(() => 0.5 - Math.random()).slice(0, countEasy),
            ...medium.sort(() => 0.5 - Math.random()).slice(0, countMedium),
            ...hard.sort(() => 0.5 - Math.random()).slice(0, countHard)
        ];

        // Kota dolmadıysa kalanlardan tamamla
        if (selection.length < targetCount) {
            const currentIds = new Set(selection.map(q => q.id));
            const remaining = pool.filter(q => !currentIds.has(q.id));
            const needed = targetCount - selection.length;
            selection = [...selection, ...remaining.sort(() => 0.5 - Math.random()).slice(0, needed)];
        }
    } else {
        // --- SPESİFİK MOD ---
        selection = pool.sort(() => 0.5 - Math.random()).slice(0, targetCount);
    }

    // Seçilenleri madde sırasına göre diz
    selection.sort((a, b) => a.artNo - b.artNo);

    state.tempQuestions = [...state.tempQuestions, ...selection];
    renderTestPaper();
    renderPoolList(); // "Eklendi" etiketlerini güncelle
}

function renderPoolList() {
    const list = document.getElementById('poolList');
    document.getElementById('poolCount').innerText = state.poolQuestions.length;

    if (state.poolQuestions.length === 0) {
        list.innerHTML = '<div class="text-center text-muted mt-5 small">Bu filtreye uygun soru bulunamadı.</div>';
        return;
    }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        const shortText = q.text.length > 60 ? q.text.substring(0, 60) + '...' : q.text;

        return `
            <div class="mini-q-card ${isAdded ? 'bg-light border-success' : ''}" onclick="window.Studio.wizard.fullEdit('${q.id}')">
                <div class="d-flex justify-content-between mb-1">
                    <span class="badge bg-secondary" style="font-size:0.7em">Md. ${q.artNo}</span>
                    ${isAdded ? '<span class="text-success small fw-bold">Eklendi</span>' : ''}
                </div>
                <div class="text-dark small">${shortText}</div>
                <button class="q-action-btn btn-add-q" 
                    onclick="event.stopPropagation(); window.Studio.wizard.add('${q.id}')" 
                    ${isAdded ? 'disabled style="opacity:0.5"' : ''} title="Teste Ekle">
                    <span>+</span>
                </button>
            </div>`;
    }).join('');
}

function renderTestPaper() {
    const list = document.getElementById('paperList');
    document.getElementById('paperCount').innerText = `${state.tempQuestions.length} Soru`;

    if (state.tempQuestions.length === 0) {
        list.innerHTML = '<div class="empty-selection bg-white"><div class="empty-icon">📝</div><p>Test kağıdı boş.</p></div>';
        return;
    }

    list.innerHTML = state.tempQuestions.map((q, i) => {
        const shortText = q.text.length > 80 ? q.text.substring(0, 80) + '...' : q.text;
        return `
        <div class="mini-q-card">
            <div class="d-flex gap-2">
                <span class="fw-bold text-primary">${i + 1}.</span>
                <div class="flex-grow-1">
                    <div class="text-dark small mb-1">${shortText}</div>
                    <div class="d-flex gap-2">
                         <span class="badge bg-light text-muted border" style="font-size:0.7em">Md. ${q.artNo}</span>
                    </div>
                </div>
            </div>
            <button class="q-action-btn btn-remove-q" 
                onclick="event.stopPropagation(); window.Studio.wizard.remove(${i})" title="Çıkar">
                <span>&times;</span>
            </button>
        </div>`
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

// Trash
async function openTrash() {
    const modal = document.getElementById('trashModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const tbody = document.getElementById('trashTableBody');
    tbody.innerHTML = '<tr><td>Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snap = await getDocs(q);

    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="2">Çöp kutusu boş</td></tr>'; return; }
    tbody.innerHTML = snap.docs.map(d => `<tr><td>${d.data().title}</td><td class="text-end"><button class="btn btn-success btn-sm" onclick="window.Studio.trash.restore('${d.id}')">Geri Al</button></td></tr>`).join('');
}

async function restoreItem(id) { await updateDoc(doc(db, "topics", id), { status: 'active' }); openTrash(); loadTopics(); }