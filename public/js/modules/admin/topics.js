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

    // Tab butonlarını resetle
    document.getElementById('tabLesson').classList.add('active');
    document.getElementById('tabTest').classList.remove('active');

    if (id) {
        const t = state.allTopics.find(x => x.id === id);
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = t.title;
        document.getElementById('inpTopicOrder').value = t.order;
        document.getElementById('inpTopicCategory').value = t.category;
        document.getElementById('inpTopicStatus').value = t.isActive;

        document.getElementById('activeTopicTitleDisplay').innerText = t.title; // BAŞLIK GÜNCELLEME

        state.autoFilter = t.title;
        await loadLessons(id);

        // İçerik varsa ilkini seçme, yoksa "Empty State" göster
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

// UI State Yönetimi Güncellemesi
function prepareEditorUI(type) {
    // Tüm ekranları gizle
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex'; // Flex ile aç

    const badge = document.getElementById('editorBadge');

    if (type === 'test') {
        badge.innerText = "TEST EDİTÖRÜ";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'flex'; // Split view için flex
    } else {
        badge.innerText = "DERS EDİTÖRÜ";
        badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block'; // Normal akış
        document.getElementById('wsTestMode').style.display = 'none';
    }
}

// Konu Ayarlarını Açma
function showMetaEditor() {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'none';
    document.getElementById('metaEditor').style.display = 'flex'; // Flex ile ortala

    state.activeLessonId = null;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Aktif konu başlığını header'da güncelle
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
// Materyal Render Fonksiyonu (Daha temiz HTML)
function renderMaterials() {
    const container = document.getElementById('materialsContainer');
    if (state.tempMaterials.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-4 border dashed rounded">Henüz materyal eklenmedi. Yukarıdan seçin.</div>';
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
            <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.removeMat(${m.id})" title="Kaldır">
                <span style="font-size:1.2rem;">&times;</span>
            </button>
        </div>
    `).join('');
}

// ============================================================
// --- GELİŞMİŞ ALGORİTMA VE SORGULAMA ---
// ============================================================

async function searchQuestions() {
    const code = document.getElementById('wizLegislation').value.trim();
    if (!code) return alert("Lütfen bir Mevzuat Kodu (Örn: 5271) girin.");

    document.getElementById('poolList').innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"></div><br>Sorular Getiriliyor...</div>';

    try {
        // 1. ADIM: Firestore'dan sadece Kanun Koduna göre çek (Client-side filtreleme daha güvenli)
        // Çünkü "Madde No" string ("1", "10", "2") olarak saklanıyor olabilir, bu da sorgu hatası yaratır.
        const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
        const snap = await getDocs(q);

        // Filtre Değerlerini Al
        const startArt = parseInt(document.getElementById('wizStart').value) || 0;
        const endArt = parseInt(document.getElementById('wizEnd').value) || 99999;
        const diffFilter = document.getElementById('wizDifficulty').value; // Boş ise hepsi
        const txtFilter = document.getElementById('wizSearchText').value.toLowerCase();

        let filteredArr = [];

        snap.forEach(doc => {
            const d = doc.data();
            if (d.isDeleted) return;

            // Güvenli Madde No Çevirimi (String -> Integer)
            // Eğer madde "Geçici 1" gibi ise 0 veya NaN dönebilir, bunları sona atabiliriz.
            const artRaw = d.legislationRef?.article;
            const artNo = parseInt(artRaw);

            // A. Madde Aralığı Filtresi (Eğer sayısal bir değerse)
            if (!isNaN(artNo)) {
                if (artNo < startArt || artNo > endArt) return;
            }

            // B. Zorluk Filtresi (Eğer seçildiyse)
            if (diffFilter) {
                // Seçilen zorluk seviyesi ve civarını al (Örn: 3 seçilirse 3 gelir)
                // "1" seçilirse kolaylar (1-2), "5" seçilirse zorlar (4-5)
                if (diffFilter === "1" && d.difficulty > 2) return;
                if (diffFilter === "3" && d.difficulty !== 3) return;
                if (diffFilter === "5" && d.difficulty < 4) return;
            }

            // C. Metin Arama
            if (txtFilter && !d.text.toLowerCase().includes(txtFilter)) return;

            filteredArr.push({ id: doc.id, ...d, artNo: isNaN(artNo) ? 99999 : artNo });
        });

        // Küçükten büyüğe madde numarasına göre sırala
        filteredArr.sort((a, b) => a.artNo - b.artNo);

        state.poolQuestions = filteredArr;
        renderPoolList();

    } catch (error) {
        console.error("Sorgu Hatası:", error);
        document.getElementById('poolList').innerHTML = `<div class="text-center text-danger p-3">Hata: ${error.message}</div>`;
    }
}

// Akıllı Test Oluşturucu
function autoGenerateTest() {
    if (state.poolQuestions.length === 0) {
        // Eğer havuz boşsa, mevcut filtrelerle otomatik arama yap
        if (document.getElementById('wizLegislation').value) {
            searchQuestions().then(() => {
                // Arama bitince tekrar çağır (Recursive değil, one-off)
                if (state.poolQuestions.length > 0) performSmartSelection();
                else alert("Kriterlere uygun soru bulunamadı.");
            });
            return;
        } else {
            return alert("Lütfen önce Mevzuat Kodu girin ve filtreleyin.");
        }
    } else {
        performSmartSelection();
    }
}

// Algoritmanın Kalbi
function performSmartSelection() {
    const targetCount = 15;
    let pool = [...state.poolQuestions];

    // Zaten ekli olanları havuzdan çıkar (Mükerrer önleme)
    const addedIds = new Set(state.tempQuestions.map(q => q.id));
    pool = pool.filter(q => !addedIds.has(q.id));

    if (pool.length === 0) return alert("Havuzdaki tüm sorular zaten eklendi.");

    let selection = [];
    const difficultyMode = document.getElementById('wizDifficulty').value;

    if (!difficultyMode) {
        // --- DENGELİ DAĞILIM MODU (Eğer zorluk seçilmediyse) ---
        // Hedef: %20 Kolay, %60 Orta, %20 Zor
        const easy = pool.filter(q => q.difficulty <= 2);
        const medium = pool.filter(q => q.difficulty === 3);
        const hard = pool.filter(q => q.difficulty >= 4);

        const countEasy = Math.ceil(targetCount * 0.2);
        const countHard = Math.ceil(targetCount * 0.2);
        const countMedium = targetCount - countEasy - countHard;

        // Shuffle ve Seç
        selection = [
            ...easy.sort(() => 0.5 - Math.random()).slice(0, countEasy),
            ...medium.sort(() => 0.5 - Math.random()).slice(0, countMedium),
            ...hard.sort(() => 0.5 - Math.random()).slice(0, countHard)
        ];

        // Eğer kota dolmadıysa (örneğin hiç zor soru yoksa), kalanlardan rastgele tamamla
        if (selection.length < targetCount) {
            const currentIds = new Set(selection.map(q => q.id));
            const remaining = pool.filter(q => !currentIds.has(q.id));
            const needed = targetCount - selection.length;
            selection = [...selection, ...remaining.sort(() => 0.5 - Math.random()).slice(0, needed)];
        }

    } else {
        // --- SPESİFİK ZORLUK MODU ---
        // Direkt filtrelenmiş havuzdan rastgele seç
        selection = pool.sort(() => 0.5 - Math.random()).slice(0, targetCount);
    }

    // Seçilenleri Madde Numarasına Göre Sırala (Pedagojik Akış)
    selection.sort((a, b) => a.artNo - b.artNo);

    // Ekle
    state.tempQuestions = [...state.tempQuestions, ...selection];

    // UI Güncelle
    renderTestPaper();
    renderPoolList(); // Eklendi etiketlerini güncellemek için

    // Kullanıcıya bilgi ver
    const actualAdded = selection.length;
    // Toast veya basit log (Opsiyonel)
    console.log(`${actualAdded} soru akıllı algoritma ile eklendi.`);
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