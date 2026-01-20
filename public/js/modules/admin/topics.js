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

function toggleMetaDrawer(open = true) {
    const drawer = document.getElementById('metaDrawer');
    const backdrop = document.getElementById('metaDrawerBackdrop');
    if (!drawer || !backdrop) return;

    if (open) {
        drawer.classList.add('open');
        backdrop.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
    } else {
        drawer.classList.remove('open');
        backdrop.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
    }
}

// ============================================================
// --- INIT ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro: Logic Module Loaded");

    const container = document.getElementById('section-topics');
    if (container) container.innerHTML = UI_SHELL;

    // Global Fonksiyonları Window'a Ata
    window.Studio = {
        open: openEditor,
        close: () => document.getElementById('topicModal').style.display = 'none',
        settings: (open = true) => toggleMetaDrawer(open),
        saveMeta: saveTopicMeta,
        newContent: createNewContent,
        selectContent: selectContentItem,
        saveContent: saveContent,
        deleteContent: deleteContent,
        addMat: addMaterialUI,
        removeMat: removeMaterialUI,
        updateMat: updateMaterialItem,
        previewMat: setMaterialView,
        matDnD: { start: matDragStart, over: matDragOver, leave: matDragLeave, drop: matDrop, end: matDragEnd },
        switchTab: switchTabHandler,
        wizard: {
            search: searchQuestions,
            add: addToTestPaper,
            remove: removeFromTestPaper,
            auto: autoGenerateTest,

            dragStart: (index, ev) => {
                try { ev.dataTransfer.setData('text/plain', String(index)); } catch (e) { }
                state._dragIndex = index;
                const card = ev.currentTarget;
                if (card) card.classList.add('dragging');
            },
            dragOver: (index, ev) => {
                ev.preventDefault();
                const card = ev.currentTarget;
                if (card) card.classList.add('drag-over');
            },
            dragEnd: (ev) => { const card = ev.currentTarget; if (card) card.classList.remove('dragging'); cleanupDnD(); },
            dragLeave: (ev) => {
                const card = ev.currentTarget;
                if (card) card.classList.remove('drag-over');
            },
            drop: (toIndex, ev) => {
                ev.preventDefault();
                const fromIndex = (state._dragIndex ?? parseInt(ev.dataTransfer.getData('text/plain')));
                if (isNaN(fromIndex) || fromIndex === toIndex) {
                    cleanupDnD();
                    return;
                }
                const item = state.tempQuestions.splice(fromIndex, 1)[0];
                state.tempQuestions.splice(toIndex, 0, item);
                cleanupDnD();
                renderTestPaper();
            },

            fullEdit: (id) => {
                if (window.QuestionBank?.openEditor) window.QuestionBank.openEditor(id);
                else openQuestionEditor(id);
            }
        },
        trash: { open: openTrash, restore: restoreItem },
        contentTrash: { open: openContentTrash, restore: restoreContentItem, purgeAll: purgeAllDeletedContent, purgeOne: purgeOneDeletedContent }
    };

    loadTopics();
}

// ============================================================
// --- VERİ YÖNETİMİ (TOPICS) ---
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

    // Varsayılan olarak Dersler sekmesini aç
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

        // İçerik seçilene kadar boş durum kalsın
        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('contentEditor').style.display = 'none';
        if (typeof toggleMetaDrawer === 'function') toggleMetaDrawer(false);
    } else {
        // Yeni Konu Modu
        document.getElementById('editTopicId').value = "";
        document.getElementById('inpTopicTitle').value = "";
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        document.getElementById('contentListNav').innerHTML = '';

        document.getElementById('activeTopicTitleDisplay').innerText = "Yeni Konu Oluşturuluyor...";
        // Yeni konu için önce ayarları doldurt
        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('contentEditor').style.display = 'none';
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    document.getElementById('contentListNav').innerHTML = '<div class="text-center p-2 small text-muted">Yükleniyor...</div>';
    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);
    state.currentLessons = [];
    snap.forEach(d => { const data = d.data(); if (data?.status === 'deleted' || data?.isDeleted) return; state.currentLessons.push({ id: d.id, ...data }); });
    renderContentNav();
}

function switchTabHandler(tab) {
    state.sidebarTab = tab;

    const btnLesson = document.getElementById('tabLesson');
    const btnTest = document.getElementById('tabTest');

    // CSS'te .active sınıfı tanımlı, onu kullanıyoruz
    if (tab === 'lesson') {
        btnLesson.classList.add('active');
        btnTest.classList.remove('active');
    } else {
        btnLesson.classList.remove('active');
        btnTest.classList.add('active');
    }

    // Footer buton etiketi
    const btn = document.getElementById('sidebarNewContentBtn');
    if (btn) btn.innerHTML = tab === 'test' ? '➕ Yeni Test' : '➕ Yeni Ders';

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

    // Eğer type parametresi gelmezse, aktif tab'a göre belirle
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
        // Test modunda filtreleri sıfırla veya varsayılanı getir
        const leg = document.getElementById('wizLegislation'); if (leg) leg.value = state.autoFilter || "";
        const tc = document.getElementById('wizTargetCount'); if (tc && !tc.value) tc.value = 15;
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
    document.getElementById('contentEditor').style.display = 'flex';
    if (typeof toggleMetaDrawer === 'function') toggleMetaDrawer(false);

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
    // Drawer sadece konu ayarlarını açar; editör alanını yok etmez.
    state.activeLessonId = null;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const topicTitle = document.getElementById('inpTopicTitle')?.value || "";
    document.getElementById('activeTopicTitleDisplay').innerText = topicTitle || (state.activeTopicId ? "Konu" : "Yeni Konu");

    if (typeof toggleMetaDrawer === 'function') toggleMetaDrawer(true);
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

function validateMaterialsBeforeSave() {
    // Only for lesson mode
    const errs = [];
    const mats = state.tempMaterials || [];
    mats.forEach((m, idx) => {
        const n = idx + 1;
        const url = String(m.url || '').trim();
        if (m.type === 'html') {
            if (!url) errs.push(`Materyal #${n} (Metin): içerik boş.`);
        } else {
            if (!url) errs.push(`Materyal #${n} (${m.type.toUpperCase()}): URL boş.`);
        }
    });
    return errs;
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
        await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId), { status: 'deleted', isActive: false, deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        loadLessons(state.activeTopicId);
        showMetaEditor();
    }
}

function sanitizeHTML(unsafeHtml) {
    // Minimal, dependency-free sanitizer for admin preview.
    // Removes script/style/iframe/object/embed and dangerous attributes.
    try {
        const tpl = document.createElement('template');
        tpl.innerHTML = String(unsafeHtml || '');

        const blocked = tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta');
        blocked.forEach(n => n.remove());

        const all = tpl.content.querySelectorAll('*');
        all.forEach(el => {
            // remove inline event handlers and JS URLs
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = String(attr.value || '');
                if (name.startsWith('on')) el.removeAttribute(attr.name);
                if ((name === 'href' || name === 'src') && value.trim().toLowerCase().startsWith('javascript:')) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        return tpl.innerHTML;
    } catch (e) {
        // Fallback: escape
        return String(unsafeHtml || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }
}

function setMaterialView(id, view) {
    const item = state.tempMaterials.find(m => m.id === id);
    if (!item) return;
    item.view = view;

    const btnEdit = document.getElementById(`matTabEdit_${id}`);
    const btnPrev = document.getElementById(`matTabPrev_${id}`);
    const wrapEdit = document.getElementById(`matEdit_${id}`);
    const wrapPrev = document.getElementById(`matPrev_${id}`);

    if (btnEdit && btnPrev) {
        btnEdit.classList.toggle('active', view === 'edit');
        btnPrev.classList.toggle('active', view === 'preview');
    }
    if (wrapEdit && wrapPrev) {
        wrapEdit.style.display = view === 'edit' ? 'block' : 'none';
        wrapPrev.style.display = view === 'preview' ? 'block' : 'none';
    }

    if (view === 'preview') {
        const prev = document.getElementById(`matPrevBox_${id}`);
        if (prev) {
            const html = (item.url || '').trim();
            prev.innerHTML = html ? sanitizeHTML(html) : '<div class="muted">Önizleme için içerik girin.</div>';
        }
    }
}

// Material Drag & Drop
function matCleanupDnD() {
    state._matDragIndex = null;
    document.querySelectorAll('.mat-card.mat-dragging').forEach(el => el.classList.remove('mat-dragging'));
    document.querySelectorAll('.mat-card.mat-over').forEach(el => el.classList.remove('mat-over'));
}

function matDragStart(index, ev) {
    state._matDragIndex = index;
    try { ev.dataTransfer.setData('text/plain', String(index)); } catch (e) { }
    const card = ev.currentTarget;
    if (card) card.classList.add('mat-dragging');
}

function matDragOver(index, ev) {
    ev.preventDefault();
    const card = ev.currentTarget;
    if (card) card.classList.add('mat-over');
}

function matDragLeave(ev) {
    const card = ev.currentTarget;
    if (card) card.classList.remove('mat-over');
}

function matDrop(toIndex, ev) {
    ev.preventDefault();
    const fromIndex = (state._matDragIndex ?? parseInt(ev.dataTransfer.getData('text/plain')));
    if (isNaN(fromIndex) || fromIndex === toIndex) {
        matCleanupDnD();
        return;
    }
    const item = state.tempMaterials.splice(fromIndex, 1)[0];
    state.tempMaterials.splice(toIndex, 0, item);

    // Recompute material order (1..n)
    state.tempMaterials.forEach((m, i) => m.order = i + 1);

    matCleanupDnD();
    renderMaterials();
}

function matDragEnd(ev) {
    const card = ev.currentTarget;
    if (card) card.classList.remove('mat-dragging');
    matCleanupDnD();
}

// --- MATERIAL HELPERS ---
function addMaterialUI(type) { state.tempMaterials.push({ id: Date.now(), type, title: '', url: '' }); renderMaterials(); }
function removeMaterialUI(id) { state.tempMaterials = state.tempMaterials.filter(m => m.id !== id); renderMaterials(); }
function updateMaterialItem(id, field, val) {
    const item = state.tempMaterials.find(m => m.id === id);
    if (!item) return;
    item[field] = val;

    // Live preview update for HTML materials
    if (item.type === 'html' && field === 'url') {
        const prev = document.getElementById(`matPrevBox_${id}`);
        if (prev && (item.view === 'preview')) {
            const html = String(val || '').trim();
            prev.innerHTML = html ? sanitizeHTML(html) : '<div class="muted">Önizleme için içerik girin.</div>';
        }
    }

    // Update summary title without full rerender (best-effort)
    if (field === 'title') {
        const sumTitle = document.getElementById(`matSumTitle_${id}`);
        if (sumTitle) sumTitle.textContent = String(val || '').trim() || 'Başlıksız';
    }
}

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

// DnD helpers
function cleanupDnD() {
    state._dragIndex = null;
    document.querySelectorAll('.question-card.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.question-card.drag-over').forEach(el => el.classList.remove('drag-over'));
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
    const targetCount = parseInt(document.getElementById('wizTargetCount')?.value) || 15;
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
    const pc = document.getElementById('poolCount'); if (pc) pc.innerText = state.poolQuestions.length;

    if (state.poolQuestions.length === 0) {
        list.innerHTML = '<div class="text-center text-muted mt-5 small">Bu filtreye uygun soru bulunamadı.</div>';
        return;
    }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        const cleanText = q.text ? q.text.replace(/<[^>]*>?/gm, '') : '';
        const shortText = cleanText.length > 60 ? cleanText.substring(0, 60) + '...' : cleanText;

        return `
            <div class="question-card ${isAdded ? 'bg-light' : ''}" style="cursor:pointer; border-left: 3px solid ${isAdded ? '#22c55e' : 'transparent'}" onclick="window.Studio.wizard.fullEdit('${q.id}')">
                <div class="qc-body">
                    <div class="qc-meta">
                        <span class="badge-outline">Md. ${q.artNo || '?'}</span>
                        ${isAdded ? '<span style="color:#22c55e; font-weight:bold; font-size:10px;">EKLENDİ</span>' : ''}
                    </div>
                    <div class="qc-text" style="font-size:0.8rem;">${shortText}</div>
                </div>
                <div class="qc-actions">
                    <button class="btn-icon" style="background:#dcfce7; color:#166534;" 
                        onclick="event.stopPropagation(); window.Studio.wizard.add('${q.id}')" 
                        ${isAdded ? 'disabled style="opacity:0.5"' : ''} title="Teste Ekle">
                        +
                    </button>
                </div>
            </div>`;
    }).join('');
}

function renderTestPaper() {
    const list = document.getElementById('paperList');
    const countEl = document.getElementById('paperCount');

    if (countEl) countEl.innerText = `${state.tempQuestions.length} Soru`;

    if (state.tempQuestions.length === 0) {
        list.innerHTML = `
            <div class="empty-paper-state">
                <div class="icon">📝</div>
                <h5>Test Kağıdı Boş</h5>
                <p>Soldaki panelden filtreleme yaparak soru ekleyin veya otomatik oluşturucuyu kullanın.</p>
            </div>`;
        return;
    }

    list.innerHTML = state.tempQuestions.map((q, i) => {
        // Metni temizle ve kısalt
        const cleanText = q.text ? q.text.replace(/<[^>]*>?/gm, '') : '';
        const shortText = cleanText.length > 100 ? cleanText.substring(0, 100) + '...' : cleanText;

        // Zorluk seviyesi badge
        let diffBadge = '';
        if (q.difficulty <= 2) diffBadge = '<span class="badge-outline" style="color:#16a34a; border-color:#16a34a">Kolay</span>';
        else if (q.difficulty === 3) diffBadge = '<span class="badge-outline" style="color:#d97706; border-color:#d97706">Orta</span>';
        else diffBadge = '<span class="badge-outline" style="color:#dc2626; border-color:#dc2626">Zor</span>';

        return `
        <div class="question-card" draggable="true" ondragstart="window.Studio.wizard.dragStart(${i},event)" ondragover="window.Studio.wizard.dragOver(${i},event)" ondragleave="window.Studio.wizard.dragLeave(event)" ondrop="window.Studio.wizard.drop(${i},event)" ondragend="window.Studio.wizard.dragEnd(event)">
            <div class="qc-left">
                <span class="qc-handle" title="Sıralamak için sürükle">:::</span>
                <span class="qc-number">${i + 1}</span>
            </div>
            <div class="qc-body">
                <div class="qc-meta">
                    <span class="badge-outline">Md. ${q.artNo || '?'}</span>
                    ${diffBadge}
                    <span class="badge-outline" style="border:none; color:#94a3b8">${q.category || 'Genel'}</span>
                </div>
                <div class="qc-text" title="${cleanText}">${shortText}</div>
            </div>
            <div class="qc-actions">
                <button class="btn-icon edit" onclick="window.Studio.wizard.fullEdit('${q.id}')" title="Düzenle">✏️</button>
                <button class="btn-icon delete" onclick="event.stopPropagation(); window.Studio.wizard.remove(${i})" title="Çıkar">🗑️</button>
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

// ============================================================
// --- CONTENT TRASH (LESSONS/TESTS) ---
// ============================================================

async function openContentTrash() {
    if (!state.activeTopicId) return alert("Önce bir konu seçin.");
    const modal = document.getElementById('contentTrashModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const isTest = state.sidebarTab === 'test';
    const label = document.getElementById('contentTrashModeLabel');
    if (label) label.innerText = isTest ? 'Test' : 'Ders';

    const tbody = document.getElementById('contentTrashTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="p-3">Yükleniyor...</td></tr>';

    try {
        const q = query(
            collection(db, `topics/${state.activeTopicId}/lessons`),
            where("status", "==", "deleted"),
            orderBy("updatedAt", "desc")
        );
        const snap = await getDocs(q);

        const rows = [];
        snap.forEach(d => {
            const data = d.data();
            const type = data.type || 'lesson';
            // Sekmeye göre filtre
            if (isTest && type !== 'test') return;
            if (!isTest && type === 'test') return;
            rows.push({ id: d.id, ...data });
        });

        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-muted">Bu sekmede silinmiş içerik yok.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td><strong>${(r.title || '(başlıksız)').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong></td>
                <td class="text-center">${r.order ?? ''}</td>
                <td class="text-center">
                    <span class="badge bg-light text-dark border">${r.type === 'test' ? 'Test' : 'Ders'}</span>
                </td>
                <td class="text-end">
                    <button class="btn btn-success btn-sm" onclick="window.Studio.contentTrash.restore('${r.id}')">Geri Al</button>
                    <button class="btn btn-danger btn-sm" onclick="window.Studio.contentTrash.purgeOne('${r.id}')">Kalıcı Sil</button>
                </td>
            </tr>
        `).join('');

    } catch (e) {
        console.error(e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-danger">Hata: ${e.message}</td></tr>`;
    }
}

async function restoreContentItem(id) {
    if (!state.activeTopicId) return;
    await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, id), {
        status: 'active',
        isActive: true,
        deletedAt: null,
        updatedAt: serverTimestamp()
    });
    await loadLessons(state.activeTopicId);
    await openContentTrash();
}

async function purgeOneDeletedContent(id) {
    if (!state.activeTopicId) return;
    if (!confirm("Bu içerik kalıcı olarak silinecek. Emin misiniz?")) return;
    await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, id));
    await openContentTrash();
}

async function purgeAllDeletedContent() {
    if (!state.activeTopicId) return;
    const isTest = state.sidebarTab === 'test';
    if (!confirm(`Bu sekmede silinen tüm ${isTest ? 'test' : 'ders'} içerikleri kalıcı olarak silinecek. Emin misiniz?`)) return;

    const q = query(
        collection(db, `topics/${state.activeTopicId}/lessons`),
        where("status", "==", "deleted")
    );
    const snap = await getDocs(q);

    const ids = [];
    snap.forEach(d => {
        const data = d.data();
        const type = data.type || 'lesson';
        if (isTest && type !== 'test') return;
        if (!isTest && type === 'test') return;
        ids.push(d.id);
    });

    if (ids.length === 0) return alert("Kalıcı silinecek içerik yok.");

    // Batch delete (chunked)
    const { writeBatch } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    // Note: writeBatch already imported in old file? not in current v3. We'll avoid dynamic import and just delete sequentially for now.
    for (const id of ids) {
        await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, id));
    }

    await openContentTrash();
}

async function restoreItem(id) { await updateDoc(doc(db, "topics", id), { status: 'active' }); openTrash(); loadTopics(); }