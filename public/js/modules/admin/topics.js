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
    autoFilter: '',
    _autosaveTimer: null,
    _autosaveTimer2: null,
    _isDirty: false,
    _isSaving: false,
    _matDragIndex: null,
    _dragIndex: null
};

// ============================================================
// --- INIT & SETUP ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro: Topics Module Loaded");

    const container = document.getElementById('section-topics');
    if (container) container.innerHTML = UI_SHELL;

    // Global Fonksiyonları Window'a Ata (HTML onclick için)
    window.Studio = {
        open: openEditor,
        close: closeEditor,
        settings: toggleMetaDrawer,
        saveMeta: saveTopicMeta,
        newContent: createNewContent,
        selectContent: selectContentItem,
        saveContent: saveContent,
        deleteContent: deleteContent,

        // Materyal İşlemleri
        addMat: addMaterialUI,
        removeMat: removeMaterialUI,
        updateMat: updateMaterialItem,
        previewMat: setMaterialView,
        matDnD: {
            start: matDragStart,
            over: matDragOver,
            leave: matDragLeave,
            drop: matDrop,
            end: matDragEnd
        },

        switchTab: switchTabHandler,

        // Test Sihirbazı (Soru İşlemleri)
        wizard: {
            search: searchQuestions,
            add: addToTestPaper,
            remove: removeFromTestPaper,
            auto: autoGenerateTest,

            // Soru Sürükle Bırak
            dragStart: qDragStart,
            dragOver: qDragOver,
            dragLeave: qDragLeave,
            drop: qDrop,
            dragEnd: qDragEnd,

            fullEdit: (id) => {
                if (window.QuestionBank?.openEditor) window.QuestionBank.openEditor(id);
                else openQuestionEditor(id);
            }
        },

        // Çöp Kutusu İşlemleri
        trash: { open: openTrash, restore: restoreItem },
        contentTrash: {
            open: openContentTrash,
            restore: restoreContentItem,
            purgeAll: purgeAllDeletedContent,
            purgeOne: purgeOneDeletedContent
        }
    };

    loadTopics();
}

function closeEditor() {
    document.getElementById('topicModal').style.display = 'none';
}

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
// --- KONU LİSTESİ (ANA EKRAN) ---
// ============================================================
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snap = await getDocs(q);
        state.allTopics = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.status !== 'deleted') state.allTopics.push({ id: doc.id, ...d });
        });
        renderTopicsTable();
    } catch (e) {
        console.error("Konular yüklenirken hata:", e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Hata: ${e.message}</td></tr>`;
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

    const badge = document.getElementById('topicCountBadge');
    if (badge) badge.innerText = `${filtered.length} Kayıt`;

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
// --- STÜDYO: EDİTÖR AÇILIŞ VE NAVİGASYON ---
// ============================================================

async function openEditor(id = null) {
    document.getElementById('topicModal').style.display = 'flex';
    state.activeTopicId = id;

    // Varsayılan olarak Dersler sekmesini aç
    switchTabHandler('lesson');

    if (id) {
        // Mevcut Konu
        const t = state.allTopics.find(x => x.id === id);
        if (t) {
            document.getElementById('editTopicId').value = id;
            document.getElementById('inpTopicTitle').value = t.title;
            document.getElementById('inpTopicOrder').value = t.order;
            document.getElementById('inpTopicCategory').value = t.category;
            document.getElementById('inpTopicStatus').value = t.isActive;

            document.getElementById('activeTopicTitleDisplay').innerText = t.title;
            state.autoFilter = t.title;
            await loadLessons(id);
        }

        // İçerik seçilene kadar boş durum kalsın
        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('contentEditor').style.display = 'none';
        toggleMetaDrawer(false);
    } else {
        // Yeni Konu Modu
        document.getElementById('editTopicId').value = "";
        document.getElementById('inpTopicTitle').value = "";
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        document.getElementById('contentListNav').innerHTML = '';

        document.getElementById('activeTopicTitleDisplay').innerText = "Yeni Konu Oluşturuluyor...";

        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('contentEditor').style.display = 'none';

        // Yeni konu için direkt ayarları aç
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    const listNav = document.getElementById('contentListNav');
    if (listNav) listNav.innerHTML = '<div class="text-center p-2 small text-muted">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);
    state.currentLessons = [];
    snap.forEach(d => {
        const data = d.data();
        if (data?.status === 'deleted' || data?.isDeleted) return;
        state.currentLessons.push({ id: d.id, ...data });
    });
    renderContentNav();
}

function switchTabHandler(tab) {
    state.sidebarTab = tab;

    const btnLesson = document.getElementById('tabLesson');
    const btnTest = document.getElementById('tabTest');

    if (tab === 'lesson') {
        btnLesson?.classList.add('active');
        btnTest?.classList.remove('active');
    } else {
        btnLesson?.classList.remove('active');
        btnTest?.classList.add('active');
    }

    // Footer buton etiketi güncelle
    const btn = document.getElementById('sidebarNewContentBtn');
    if (btn) btn.innerHTML = tab === 'test' ? '➕ Yeni Test' : '➕ Yeni Ders';

    renderContentNav();
}

function renderContentNav() {
    const list = document.getElementById('contentListNav');
    if (!list) return;

    const isTest = state.sidebarTab === 'test';
    const items = state.currentLessons.filter(l => isTest ? l.type === 'test' : l.type !== 'test');

    if (items.length === 0) {
        list.innerHTML = `<div class="text-center p-5 text-muted small opacity-50">Bu kategoride içerik yok.</div>`;
        return;
    }
    list.innerHTML = items.map(l => renderNavItem(l, isTest, state.activeLessonId)).join('');
}

// ============================================================
// --- STÜDYO: İÇERİK YÖNETİMİ (EKLE/DÜZENLE) ---
// ============================================================

function createNewContent(type) {
    if (!state.activeTopicId) { alert("Lütfen önce konuyu oluşturun ve kaydedin."); showMetaEditor(); return; }

    const contentType = type || state.sidebarTab;
    state.activeLessonId = null;
    state.activeLessonType = contentType;

    prepareEditorUI(contentType);
    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentTitle').focus();

    // Sıra numarasını otomatik ver
    const currentCount = state.currentLessons.filter(l => l.type === (contentType === 'test' ? 'test' : 'lesson')).length;
    document.getElementById('inpContentOrder').value = currentCount + 1;

    state.tempMaterials = [];
    state.tempQuestions = [];

    if (contentType === 'lesson') {
        renderMaterials();
    } else {
        renderTestPaper();
        // Filtreleri sıfırla
        const leg = document.getElementById('wizLegislation'); if (leg) leg.value = "";
        const pl = document.getElementById('poolList');
        if (pl) pl.innerHTML = '<div class="text-center mt-5 small text-muted">Aramaya başlamak için<br>kriterleri giriniz.</div>';
    }

    // Listeyi temizle (seçili yok)
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    scheduleAutosave();
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
        const leg = document.getElementById('wizLegislation');
        if (leg) leg.value = item.legislationCode || "";
    }
    renderContentNav();
}

function prepareEditorUI(type) {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';
    toggleMetaDrawer(false);

    const badge = document.getElementById('editorBadge');
    if (type === 'test') {
        badge.innerText = "TEST EDİTÖRÜ";
        badge.className = "badge bg-warning text-dark me-2";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'flex';
    } else {
        badge.innerText = "DERS EDİTÖRÜ";
        badge.className = "badge bg-primary me-2";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
    }
}

function showMetaEditor() {
    state.activeLessonId = null;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const topicTitle = document.getElementById('inpTopicTitle')?.value || "";
    document.getElementById('activeTopicTitleDisplay').innerText = topicTitle || (state.activeTopicId ? "Konu" : "Yeni Konu");
    toggleMetaDrawer(true);
}

// ============================================================
// --- KAYDETME VE SİLME İŞLEMLERİ ---
// ============================================================

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

// Otomatik Kaydetme Mekanizması
function setSaveIndicator(stateName, text) {
    const el = document.getElementById('saveIndicator');
    if (!el) return;
    el.classList.remove('saving', 'saved', 'error');
    if (stateName) el.classList.add(stateName);
    el.innerText = text || '—';
}

function scheduleAutosave() {
    state._isDirty = true;
    setSaveIndicator('', 'Değişiklik var');
    if (!state.activeTopicId) return;

    clearTimeout(state._autosaveTimer);
    state._autosaveTimer = setTimeout(async () => {
        try {
            state._isSaving = true;
            setSaveIndicator('saving', 'Kaydediliyor…');
            await saveContent(true); // Sessiz kayıt
            state._isSaving = false;
            state._isDirty = false;
            setSaveIndicator('saved', 'Kaydedildi');
            clearTimeout(state._autosaveTimer2);
            state._autosaveTimer2 = setTimeout(() => setSaveIndicator('', '—'), 2000);
        } catch (e) {
            console.error(e);
            state._isSaving = false;
            state._isDirty = true;
            setSaveIndicator('error', 'Hata');
        }
    }, 2000); // 2 saniye bekle
}

async function saveContent(silent = false) {
    if (!state.activeTopicId) return;

    state._isSaving = true;
    let title = document.getElementById('inpContentTitle').value.trim();

    // Başlık boşsa varsayılan ver
    if (!title) {
        title = state.activeLessonType === 'test' ? 'Yeni Test' : 'Yeni Ders';
    }

    const data = {
        title: title,
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
        if (state.activeLessonId) {
            await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId), data);
        } else {
            data.createdAt = serverTimestamp();
            const ref = await addDoc(collection(db, `topics/${state.activeTopicId}/lessons`), data);
            state.activeLessonId = ref.id;
        }

        if (!silent) {
            const btn = document.querySelector('#contentEditor .btn-success');
            if (btn) {
                const oldText = btn.innerHTML;
                btn.innerHTML = '✅ Kaydedildi';
                setTimeout(() => btn.innerHTML = oldText, 1500);
            }
        }

        loadLessons(state.activeTopicId);
    } catch (e) {
        if (!silent) alert(e.message);
        throw e;
    }
}

async function deleteContent() {
    if (state.activeLessonId && confirm("Bu içeriği silmek istediğinize emin misiniz?")) {
        await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId), {
            status: 'deleted',
            isActive: false,
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        loadLessons(state.activeTopicId);
        showMetaEditor(); // Ana ekrana dön
    }
}

// ============================================================
// --- MATERYAL YÖNETİMİ (DERS MODU) ---
// ============================================================

function sanitizeHTML(unsafeHtml) {
    try {
        const tpl = document.createElement('template');
        tpl.innerHTML = String(unsafeHtml || '');
        const blocked = tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta');
        blocked.forEach(n => n.remove());
        // Basit temizlik
        return tpl.innerHTML;
    } catch (e) {
        return String(unsafeHtml || '');
    }
}

function setMaterialView(id, view) {
    const item = state.tempMaterials.find(m => m.id === id);
    if (!item) return;
    item.view = view;
    renderMaterials();
}

function addMaterialUI(type) {
    state.tempMaterials.push({
        id: Date.now(),
        type,
        title: '',
        url: '',
        view: 'edit',
        order: state.tempMaterials.length + 1
    });
    renderMaterials();
    scheduleAutosave();
}

function removeMaterialUI(id) {
    state.tempMaterials = state.tempMaterials.filter(m => m.id !== id);
    renderMaterials();
    scheduleAutosave();
}

function updateMaterialItem(id, field, val) {
    const item = state.tempMaterials.find(m => m.id === id);
    if (!item) return;
    item[field] = val;
    scheduleAutosave();

    // Başlık güncelleniyorsa Accordion başlığını da güncelle
    if (field === 'title') {
        const titleEl = document.querySelector(`.mat-card summary .mat-sum-title[data-id="${id}"]`);
        if (titleEl) titleEl.innerText = val || '(Başlıksız)';
    }
}

function renderMaterials() {
    const container = document.getElementById('materialsContainer');
    if (!container) return;

    if (state.tempMaterials.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-4 border dashed rounded bg-light">Henüz materyal eklenmedi. Yukarıdan bir tür seçin.</div>';
        return;
    }

    container.innerHTML = state.tempMaterials.map((m, i) => {
        const icon = m.type === 'video' ? '🎥' : m.type === 'podcast' ? '🎙️' : m.type === 'pdf' ? '📄' : '📝';
        const isHtml = m.type === 'html';
        const viewMode = m.view || 'edit';

        let contentArea = '';

        if (isHtml) {
            contentArea = `
                <div class="mb-2">
                    <div class="mat-tabs">
                        <button class="mat-tab ${viewMode === 'edit' ? 'active' : ''}" onclick="window.Studio.previewMat(${m.id}, 'edit')">Düzenle</button>
                        <button class="mat-tab ${viewMode === 'preview' ? 'active' : ''}" onclick="window.Studio.previewMat(${m.id}, 'preview')">Önizle</button>
                    </div>
                </div>
            `;
            if (viewMode === 'edit') {
                contentArea += `<textarea class="form-control font-monospace small" rows="4" placeholder="İçerik / HTML Kodu" oninput="window.Studio.updateMat(${m.id},'url',this.value)">${m.url}</textarea>`;
            } else {
                contentArea += `<div class="mat-preview">${sanitizeHTML(m.url) || '<span class="text-muted">İçerik yok.</span>'}</div>`;
            }
        } else {
            contentArea = `<input type="text" class="form-control small text-muted" placeholder="URL / Dosya Yolu" value="${m.url}" oninput="window.Studio.updateMat(${m.id},'url',this.value)">`;
        }

        return `
        <details class="mat-card" draggable="true" 
            ondragstart="window.Studio.matDnD.start(${i}, event)" 
            ondragover="window.Studio.matDnD.over(${i}, event)" 
            ondragleave="window.Studio.matDnD.leave(event)" 
            ondrop="window.Studio.matDnD.drop(${i}, event)" 
            ondragend="window.Studio.matDnD.end(event)" open>
            
            <summary>
                <div class="mat-sum-left">${icon}</div>
                <div class="mat-sum-mid">
                    <div class="mat-sum-title" data-id="${m.id}">${m.title || '(Başlıksız)'}</div>
                    <div class="mat-sum-sub">${m.type.toUpperCase()} - Sıra: ${m.order || (i + 1)}</div>
                </div>
                <div class="mat-sum-actions">
                    <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.removeMat(${m.id})">Sil</button>
                </div>
            </summary>
            
            <div class="mat-body">
                <div class="mb-2">
                    <label class="form-label small fw-bold text-muted">BAŞLIK</label>
                    <input type="text" class="form-control fw-bold" value="${m.title}" oninput="window.Studio.updateMat(${m.id},'title',this.value)">
                </div>
                <div>
                    <label class="form-label small fw-bold text-muted">İÇERİK / URL</label>
                    ${contentArea}
                </div>
            </div>
        </details>
        `;
    }).join('');
}

// Materyal Sürükle Bırak
function matDragStart(index, ev) {
    state._matDragIndex = index;
    try { ev.dataTransfer.setData('text/plain', String(index)); } catch (e) { }
    ev.currentTarget.classList.add('mat-dragging');
}
function matDragOver(index, ev) { ev.preventDefault(); ev.currentTarget.classList.add('mat-over'); }
function matDragLeave(ev) { ev.currentTarget.classList.remove('mat-over'); }
function matDrop(toIndex, ev) {
    ev.preventDefault();
    const fromIndex = state._matDragIndex;
    if (fromIndex === null || fromIndex === toIndex) { matDragEnd(ev); return; }

    const item = state.tempMaterials.splice(fromIndex, 1)[0];
    state.tempMaterials.splice(toIndex, 0, item);

    // Sıraları güncelle
    state.tempMaterials.forEach((m, i) => m.order = i + 1);

    matDragEnd(ev);
    renderMaterials();
    scheduleAutosave();
}
function matDragEnd(ev) {
    state._matDragIndex = null;
    document.querySelectorAll('.mat-card').forEach(el => {
        el.classList.remove('mat-dragging', 'mat-over');
    });
}

// ============================================================
// --- TEST WIZARD (SORU HAVUZU) ---
// ============================================================

async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value.trim();
    if (!code) return alert("Lütfen bir Mevzuat Kodu girin (Örn: 5271).");

    const poolList = document.getElementById('poolList');
    if (poolList) poolList.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"></div><br>Sorular Taranıyor...</div>';

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

            const artNo = parseInt(d.legislationRef?.article);
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
        renderPoolList();

    } catch (error) {
        console.error("Sorgu Hatası:", error);
        if (poolList) poolList.innerHTML = `<div class="text-center text-danger p-3">Hata: ${error.message}</div>`;
    }
}

function autoGenerateTest() {
    if (state.poolQuestions.length === 0) {
        if (document.getElementById('wizLegislation').value) {
            searchQuestions().then(() => {
                if (state.poolQuestions.length > 0) performSmartSelection();
                else alert("Kriterlere uygun soru bulunamadı.");
            });
        } else {
            alert("Lütfen önce Mevzuat Kodu girin.");
        }
    } else {
        performSmartSelection();
    }
}

function performSmartSelection() {
    const targetCount = parseInt(document.getElementById('wizTargetCount')?.value) || 15;
    let pool = [...state.poolQuestions];

    // Zaten eklenenleri çıkar
    const addedIds = new Set(state.tempQuestions.map(q => q.id));
    pool = pool.filter(q => !addedIds.has(q.id));

    if (pool.length === 0) return alert("Havuzdaki tüm sorular zaten eklendi.");

    let selection = [];
    // Basit rastgele seçim (İleride zorluk dağılımı eklenebilir)
    selection = pool.sort(() => 0.5 - Math.random()).slice(0, targetCount);
    selection.sort((a, b) => a.artNo - b.artNo);

    state.tempQuestions = [...state.tempQuestions, ...selection];
    renderTestPaper();
    renderPoolList();
    scheduleAutosave();
}

function renderPoolList() {
    const list = document.getElementById('poolList');
    if (!list) return;

    if (state.poolQuestions.length === 0) {
        list.innerHTML = '<div class="text-center text-muted mt-5 small">Bu filtreye uygun soru bulunamadı.</div>';
        return;
    }

    list.innerHTML = state.poolQuestions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        const shortText = (q.text || '').replace(/<[^>]*>?/gm, '').substring(0, 60) + '...';

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
    if (!list) return;

    if (state.tempQuestions.length === 0) {
        list.innerHTML = `
            <div class="empty-paper-state">
                <div class="icon">📝</div>
                <h5>Test Kağıdı Boş</h5>
                <p>Soldaki panelden filtreleme yaparak soru ekleyin.</p>
            </div>`;
        return;
    }

    list.innerHTML = state.tempQuestions.map((q, i) => {
        const shortText = (q.text || '').replace(/<[^>]*>?/gm, '').substring(0, 100) + '...';
        return `
        <div class="question-card" draggable="true" 
            ondragstart="window.Studio.wizard.dragStart(${i},event)" 
            ondragover="window.Studio.wizard.dragOver(${i},event)" 
            ondragleave="window.Studio.wizard.dragLeave(event)" 
            ondrop="window.Studio.wizard.drop(${i},event)" 
            ondragend="window.Studio.wizard.dragEnd(event)">
            
            <div class="qc-left">
                <span class="qc-handle">:::</span>
                <span class="qc-number">${i + 1}</span>
            </div>
            <div class="qc-body">
                <div class="qc-meta">
                    <span class="badge-outline">Md. ${q.artNo || '?'}</span>
                    <span class="badge-outline" style="border:none; color:#94a3b8">${q.category || 'Genel'}</span>
                </div>
                <div class="qc-text">${shortText}</div>
            </div>
            <div class="qc-actions">
                <button class="btn-icon delete" onclick="event.stopPropagation(); window.Studio.wizard.remove(${i})" title="Çıkar">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function addToTestPaper(id) {
    const q = state.poolQuestions.find(x => x.id === id);
    if (q && !state.tempQuestions.some(x => x.id === id)) {
        state.tempQuestions.push(q);
        renderTestPaper();
        renderPoolList();
        scheduleAutosave();
    }
}

function removeFromTestPaper(i) {
    state.tempQuestions.splice(i, 1);
    renderTestPaper();
    renderPoolList();
    scheduleAutosave();
}

// Soru DnD
function qDragStart(index, ev) {
    state._dragIndex = index;
    try { ev.dataTransfer.setData('text/plain', String(index)); } catch (e) { }
    ev.currentTarget.classList.add('dragging');
}
function qDragOver(index, ev) { ev.preventDefault(); ev.currentTarget.classList.add('drag-over'); }
function qDragLeave(ev) { ev.currentTarget.classList.remove('drag-over'); }
function qDrop(toIndex, ev) {
    ev.preventDefault();
    const fromIndex = state._dragIndex;
    if (fromIndex === null || fromIndex === toIndex) { qDragEnd(ev); return; }

    const item = state.tempQuestions.splice(fromIndex, 1)[0];
    state.tempQuestions.splice(toIndex, 0, item);

    qDragEnd(ev);
    renderTestPaper();
    scheduleAutosave();
}
function qDragEnd(ev) {
    state._dragIndex = null;
    document.querySelectorAll('.question-card').forEach(el => el.classList.remove('dragging', 'drag-over'));
}

// ============================================================
// --- ÇÖP KUTUSU ---
// ============================================================

async function openTrash() {
    const modal = document.getElementById('trashModal');
    const tbody = document.getElementById('trashTableBody');
    if (!modal) return;
    modal.style.display = 'flex';
    if (tbody) tbody.innerHTML = '<tr><td>Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snap = await getDocs(q);

    if (tbody) {
        if (snap.empty) { tbody.innerHTML = '<tr><td colspan="2">Çöp kutusu boş</td></tr>'; return; }
        tbody.innerHTML = snap.docs.map(d => `<tr><td>${d.data().title}</td><td class="text-end"><button class="btn btn-success btn-sm" onclick="window.Studio.trash.restore('${d.id}')">Geri Al</button></td></tr>`).join('');
    }
}

async function restoreItem(id) { await updateDoc(doc(db, "topics", id), { status: 'active' }); openTrash(); loadTopics(); }

// İçerik Çöp Kutusu
async function openContentTrash() {
    if (!state.activeTopicId) return alert("Önce bir konu seçin.");
    const modal = document.getElementById('contentTrashModal');
    const tbody = document.getElementById('contentTrashTableBody');
    if (!modal) return;
    modal.style.display = 'flex';

    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="p-3">Yükleniyor...</td></tr>';

    try {
        const q = query(
            collection(db, `topics/${state.activeTopicId}/lessons`),
            where("status", "==", "deleted"),
            orderBy("updatedAt", "desc")
        );
        const snap = await getDocs(q);
        const rows = [];
        const isTest = state.sidebarTab === 'test';

        snap.forEach(d => {
            const data = d.data();
            const type = data.type || 'lesson';
            if (isTest && type !== 'test') return;
            if (!isTest && type === 'test') return;
            rows.push({ id: d.id, ...data });
        });

        if (!tbody) return;
        if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-muted">Bu sekmede silinmiş içerik yok.</td></tr>`; return; }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td><strong>${(r.title || '(başlıksız)')}</strong></td>
                <td class="text-center">${r.order ?? ''}</td>
                <td class="text-center"><span class="badge bg-light text-dark border">${r.type === 'test' ? 'Test' : 'Ders'}</span></td>
                <td class="text-end">
                    <button class="btn btn-success btn-sm" onclick="window.Studio.contentTrash.restore('${r.id}')">Geri Al</button>
                    <button class="btn btn-danger btn-sm" onclick="window.Studio.contentTrash.purgeOne('${r.id}')">Kalıcı Sil</button>
                </td>
            </tr>`).join('');
    } catch (e) { console.error(e); }
}

async function restoreContentItem(id) {
    if (!state.activeTopicId) return;
    await updateDoc(doc(db, `topics/${state.activeTopicId}/lessons`, id), { status: 'active', isActive: true, deletedAt: null });
    loadLessons(state.activeTopicId);
    openContentTrash();
}

async function purgeOneDeletedContent(id) {
    if (!state.activeTopicId || !confirm("Kalıcı olarak silinecek?")) return;
    await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, id));
    openContentTrash();
}

async function purgeAllDeletedContent() {
    if (!state.activeTopicId || !confirm("Tümünü kalıcı sil?")) return;
    // Batch silme işlemi yapılabilir, şimdilik basit tutuyoruz
    alert("Bu işlem toplu silme gerektirir, güvenlik nedeniyle şimdilik devre dışı.");
}