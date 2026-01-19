import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- GLOBAL STATE ---
let state = {
    allTopics: [],
    currentLessons: [],
    activeTopicId: null,
    activeLessonId: null,
    activeLessonType: 'lesson', // 'lesson' (Ders) veya 'test' (Sınav)
    tempMaterials: [], // Ders notları için geçici hafıza
    tempQuestions: [], // Test soruları için geçici hafıza
    legislationCache: null // Mevzuat kodlarını önbelleğe alacağız
};

export function initTopicsPage() {
    console.log("🚀 Studio Pro v2 Başlatılıyor...");
    renderMainInterface();
    loadTopics();

    // Global erişim (HTML onclick için)
    window.Studio = {
        open: openEditor,
        close: () => document.getElementById('topicModal').style.display = 'none',
        saveMeta: saveTopicMeta,
        newContent: createNewContent,
        selectContent: selectContent,
        saveContent: saveContent,
        deleteContent: deleteContent,
        addMaterial: addMaterialUI,
        removeMaterial: removeMaterialUI,
        wizard: {
            analyze: analyzeLegislation,
            addQ: addQuestionToTest,
            removeQ: removeQuestionFromTest
        }
    };
}

// --- 1. ANA ARAYÜZ ---
function renderMainInterface() {
    const container = document.getElementById('section-topics');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Konuları yönetin, ders notları ekleyin veya akıllı testler oluşturun.</p>
            </div>
            <button class="btn btn-primary" onclick="window.Studio.open()">
                <i class="fas fa-plus"></i> Yeni Konu Ekle
            </button>
        </div>

        <!-- Konu Listesi -->
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

        <!-- STUDIO MODAL (TAM EKRAN) -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content">
                
                <!-- Header -->
                <div class="studio-header">
                    <div class="studio-title">
                        <span class="icon">⚡</span> İçerik Stüdyosu
                    </div>
                    <button class="close-btn" onclick="window.Studio.close()">&times;</button>
                </div>

                <!-- Layout -->
                <div class="studio-layout">
                    
                    <!-- SOL: Navigasyon -->
                    <div class="studio-sidebar">
                        <div class="d-grid gap-2 mb-4">
                            <button class="btn btn-secondary btn-sm" onclick="window.Studio.newContent('lesson')">
                                + Ders Notu Ekle
                            </button>
                            <button class="btn btn-warning btn-sm" style="color:#000;" onclick="window.Studio.newContent('test')">
                                + Test Oluştur
                            </button>
                        </div>

                        <div class="sidebar-section-title">İÇERİK AKIŞI</div>
                        <div id="contentListNav"></div>

                        <div class="mt-auto pt-3 border-top border-color">
                            <button class="btn btn-outline w-100 btn-sm" onclick="window.Studio.open(state.activeTopicId, true)">
                                ⚙️ Konu Ayarları
                            </button>
                        </div>
                    </div>

                    <!-- SAĞ: Editör -->
                    <div class="studio-editor">
                        
                        <!-- A. Konu Ayarları Formu -->
                        <div id="metaEditor" class="editor-workspace">
                            <div class="studio-card" style="max-width:800px; margin:0 auto;">
                                <h3 class="mb-4">Ana Konu Bilgileri</h3>
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
                                            <option value="true">Yayında (Aktif)</option>
                                            <option value="false">Taslak (Pasif)</option>
                                        </select>
                                    </div>
                                    <div class="text-right mt-3">
                                        <button type="submit" class="btn btn-primary">Kaydet ve Devam Et</button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- B. İçerik (Ders/Test) Editörü -->
                        <div id="contentEditor" style="display:none; flex-direction:column; height:100%;">
                            
                            <!-- Toolbar -->
                            <div class="editor-toolbar">
                                <div style="flex:1; margin-right:20px;">
                                    <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı Giriniz...">
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <input type="number" id="inpContentOrder" class="form-control" style="width:70px;" placeholder="Sıra">
                                    <button class="btn btn-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                    <button class="btn btn-success btn-sm" onclick="window.Studio.saveContent()">Kaydet</button>
                                </div>
                            </div>

                            <!-- Workspace -->
                            <div class="editor-workspace">
                                
                                <!-- 1. Ders Notu Modu -->
                                <div id="wsLessonMode" style="display:none;">
                                    <div class="d-flex gap-2 mb-3">
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMaterial('html')">+ Metin</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMaterial('pdf')">+ PDF</button>
                                        <button class="btn btn-sm btn-secondary" onclick="window.Studio.addMaterial('video')">+ Video</button>
                                    </div>
                                    <div id="materialsContainer"></div>
                                </div>

                                <!-- 2. Test Sihirbazı Modu -->
                                <div id="wsTestMode" style="display:none; height:100%;">
                                    <div class="wizard-container">
                                        <!-- Sol: Kaynak Seçimi -->
                                        <div class="wizard-col">
                                            <div class="wizard-header">1. Soru Kaynağı</div>
                                            <div class="wizard-body">
                                                <div class="form-group">
                                                    <label>Mevzuat Seçin</label>
                                                    <select id="wizLegislation" class="form-control" onchange="window.Studio.wizard.analyze()">
                                                        <option value="">Yükleniyor...</option>
                                                    </select>
                                                </div>
                                                <div id="sourceStats" class="mb-3 text-muted small"></div>
                                                <div id="sourceQuestionsList"></div>
                                            </div>
                                        </div>

                                        <!-- Sağ: Test Kağıdı -->
                                        <div class="wizard-col">
                                            <div class="wizard-header d-flex justify-content-between">
                                                <span>2. Test Kağıdı</span>
                                                <span class="badge bg-primary" id="testCountBadge">0 Soru</span>
                                            </div>
                                            <div class="wizard-body" id="testPaperList">
                                                <div class="text-center text-muted mt-5">Soldan soru ekleyin.</div>
                                            </div>
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

// --- 2. VERİ YÖNETİMİ (TOPICS) ---
async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), orderBy("order", "asc"));
    const snap = await getDocs(q);

    state.allTopics = [];
    snap.forEach(doc => state.allTopics.push({ id: doc.id, ...doc.data() }));

    renderTopicList();
}

function renderTopicList() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = state.allTopics.map(t => `
        <tr>
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge bg-dark border border-secondary">${t.category}</span></td>
            <td>${t.lessonCount || 0}</td>
            <td>${t.isActive ? '<span class="text-success">Yayında</span>' : '<span class="text-muted">Taslak</span>'}</td>
            <td><button class="btn btn-sm btn-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button></td>
        </tr>
    `).join('');
}

// --- 3. STUDIO MANTIĞI ---

async function openEditor(id = null, forceSettings = false) {
    document.getElementById('topicModal').style.display = 'flex';
    state.activeTopicId = id;

    // Mevzuat listesini arka planda çek (Cache yoksa)
    if (!state.legislationCache) fetchLegislationCodes();

    if (id) {
        const topic = state.allTopics.find(t => t.id === id);
        // Formu doldur
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = topic.title;
        document.getElementById('inpTopicOrder').value = topic.order;
        document.getElementById('inpTopicCategory').value = topic.category;
        document.getElementById('inpTopicStatus').value = topic.isActive.toString();

        await loadLessons(id);

        if (forceSettings || state.currentLessons.length === 0) {
            showMetaEditor();
        } else {
            // İlk dersi otomatik seç
            selectContent(state.currentLessons[0].id);
        }
    } else {
        // Yeni Konu
        document.getElementById('topicMetaForm').reset();
        document.getElementById('editTopicId').value = "";
        document.getElementById('contentListNav').innerHTML = '';
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    const list = document.getElementById('contentListNav');
    list.innerHTML = '<div class="text-center p-2">Yükleniyor...</div>';

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);

    state.currentLessons = [];
    snap.forEach(doc => state.currentLessons.push({ id: doc.id, ...doc.data() }));

    renderContentNav();
}

function renderContentNav() {
    const list = document.getElementById('contentListNav');
    list.innerHTML = state.currentLessons.map(l => `
        <div class="content-item ${state.activeLessonId === l.id ? 'active' : ''}" onclick="window.Studio.selectContent('${l.id}')">
            <span class="content-icon">${l.type === 'test' ? '📝' : '📄'}</span>
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <div style="font-weight:600;">${l.title}</div>
                <small style="opacity:0.7;">Sıra: ${l.order}</small>
            </div>
        </div>
    `).join('');
}

function showMetaEditor() {
    document.getElementById('metaEditor').style.display = 'block';
    document.getElementById('contentEditor').style.display = 'none';
    state.activeLessonId = null;
    renderContentNav(); // Active class'ı temizle
}

async function saveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const data = {
        title: document.getElementById('inpTopicTitle').value,
        order: parseInt(document.getElementById('inpTopicOrder').value),
        category: document.getElementById('inpTopicCategory').value,
        isActive: document.getElementById('inpTopicStatus').value === 'true',
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "topics", id), data);
        } else {
            data.createdAt = serverTimestamp();
            data.lessonCount = 0;
            const ref = await addDoc(collection(db, "topics"), data);
            state.activeTopicId = ref.id;
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Konu kaydedildi.");
        loadTopics(); // Ana listeyi yenile
    } catch (e) { alert(e.message); }
}

// --- 4. İÇERİK (DERS/TEST) YÖNETİMİ ---

function createNewContent(type) {
    if (!state.activeTopicId) return alert("Önce konuyu kaydedin.");

    state.activeLessonId = null;
    state.activeLessonType = type;

    // UI Hazırla
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;

    // Mod Seçimi
    const wsLesson = document.getElementById('wsLessonMode');
    const wsTest = document.getElementById('wsTestMode');

    if (type === 'test') {
        wsLesson.style.display = 'none';
        wsTest.style.display = 'block';
        state.tempQuestions = [];
        renderTestPaper();
    } else {
        wsLesson.style.display = 'block';
        wsTest.style.display = 'none';
        state.tempMaterials = [];
        renderMaterials();
    }

    renderContentNav(); // Active class temizle
}

function selectContent(id) {
    const lesson = state.currentLessons.find(l => l.id === id);
    if (!lesson) return;

    state.activeLessonId = id;
    state.activeLessonType = lesson.type || 'lesson';

    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';

    document.getElementById('inpContentTitle').value = lesson.title;
    document.getElementById('inpContentOrder').value = lesson.order;

    if (state.activeLessonType === 'test') {
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = lesson.questions || [];
        renderTestPaper();
    } else {
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
        state.tempMaterials = lesson.materials || [];
        renderMaterials();
    }

    renderContentNav();
}

async function saveContent() {
    const title = document.getElementById('inpContentTitle').value;
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
            // Konu sayacını güncelle
            await updateDoc(doc(db, "topics", state.activeTopicId), { lessonCount: state.currentLessons.length + 1 });
        }
        alert("İçerik kaydedildi.");
        loadLessons(state.activeTopicId);
    } catch (e) { alert(e.message); }
}

async function deleteContent() {
    if (!state.activeLessonId) return;
    if (confirm("Silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, `topics/${state.activeTopicId}/lessons`, state.activeLessonId));
        loadLessons(state.activeTopicId);
        showMetaEditor();
    }
}

// --- 5. MATERYAL (DERS NOTU) FONKSİYONLARI ---

function addMaterialUI(type) {
    state.tempMaterials.push({ id: Date.now(), type, title: '', url: '' });
    renderMaterials();
}

function removeMaterialUI(id) {
    state.tempMaterials = state.tempMaterials.filter(m => m.id !== id);
    renderMaterials();
}

function renderMaterials() {
    const container = document.getElementById('materialsContainer');
    container.innerHTML = state.tempMaterials.map(m => `
        <div class="material-row">
            <div class="h4 m-0">${m.type === 'video' ? '▶️' : '📄'}</div>
            <div style="flex:1;">
                <div class="d-flex justify-content-between mb-2">
                    <span class="badge bg-secondary">${m.type.toUpperCase()}</span>
                    <button class="btn btn-sm text-danger p-0" onclick="window.Studio.removeMaterial(${m.id})">&times;</button>
                </div>
                <input type="text" class="form-control form-control-sm mb-2" placeholder="Başlık" value="${m.title}" 
                    oninput="this.value=this.value; state.tempMaterials.find(x=>x.id==${m.id}).title=this.value">
                ${m.type === 'html'
            ? `<textarea class="form-control form-control-sm" rows="3" placeholder="İçerik..." oninput="state.tempMaterials.find(x=>x.id==${m.id}).url=this.value">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm" placeholder="URL / Link" value="${m.url}" oninput="state.tempMaterials.find(x=>x.id==${m.id}).url=this.value">`
        }
            </div>
        </div>
    `).join('');
}

// --- 6. TEST SİHİRBAZI (GELİŞMİŞ) ---

// Mevzuat Kodlarını Çek (Limit sorununu çözmek için genişletilmiş sorgu)
async function fetchLegislationCodes() {
    const select = document.getElementById('wizLegislation');
    if (!select) return; // Modal kapalıysa hata vermesin

    select.innerHTML = '<option>Yükleniyor...</option>';

    try {
        // 2000 soruya kadar tara (Admin için kabul edilebilir maliyet)
        const q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(2000));
        const snap = await getDocs(q);

        const codes = new Set();
        snap.forEach(doc => {
            const c = doc.data().legislationRef?.code;
            if (c) codes.add(c);
        });

        // Standart kodları da ekle (Veri yoksa bile görünsün)
        ["657", "2709", "5271", "5237", "2577"].forEach(c => codes.add(c));

        const sorted = Array.from(codes).sort();
        select.innerHTML = '<option value="">Seçiniz...</option>' +
            sorted.map(c => `<option value="${c}">${c} Sayılı Kanun</option>`).join('');

        state.legislationCache = sorted;

    } catch (e) { console.error(e); select.innerHTML = '<option>Hata</option>'; }
}

async function analyzeLegislation() {
    const code = document.getElementById('wizLegislation').value;
    if (!code) return;

    const list = document.getElementById('sourceQuestionsList');
    list.innerHTML = '<div class="text-center p-3">Sorular getiriliyor...</div>';

    // Seçilen kanuna ait TÜM soruları çek
    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
    const snap = await getDocs(q);

    const questions = [];
    snap.forEach(doc => {
        const d = doc.data();
        questions.push({
            id: doc.id,
            ...d,
            artNo: parseInt(d.legislationRef?.article || 0)
        });
    });

    // Madde numarasına göre sırala
    questions.sort((a, b) => a.artNo - b.artNo);

    document.getElementById('sourceStats').innerText = `Toplam ${questions.length} soru bulundu.`;

    list.innerHTML = questions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        return `
            <div class="q-select-item" onclick="window.Studio.wizard.addQ('${q.id}')" style="${isAdded ? 'opacity:0.5; pointer-events:none;' : ''}">
                <div class="d-flex justify-content-between">
                    <strong>Md. ${q.artNo}</strong>
                    ${isAdded ? '✅' : ''}
                </div>
                <div class="text-truncate text-muted small">${q.text}</div>
                <!-- Gizli Veri -->
                <textarea id="raw_${q.id}" style="display:none;">${JSON.stringify(q)}</textarea>
            </div>
        `;
    }).join('');
}

function addQuestionToTest(id) {
    const raw = document.getElementById(`raw_${id}`).value;
    const q = JSON.parse(raw);
    state.tempQuestions.push(q);

    renderTestPaper();
    analyzeLegislation(); // Listeyi güncelle (disable etmek için)
}

function removeQuestionFromTest(idx) {
    state.tempQuestions.splice(idx, 1);
    renderTestPaper();
    analyzeLegislation(); // Listeyi güncelle (enable etmek için)
}

function renderTestPaper() {
    const list = document.getElementById('testPaperList');
    document.getElementById('testCountBadge').innerText = `${state.tempQuestions.length} Soru`;

    if (state.tempQuestions.length === 0) {
        list.innerHTML = '<div class="text-center text-muted mt-5">Test boş.</div>';
        return;
    }

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="d-flex gap-2 border-bottom py-2 align-items-center">
            <span class="fw-bold text-primary">${i + 1}.</span>
            <div class="flex-grow-1 overflow-hidden">
                <div class="small fw-bold">Md. ${q.artNo}</div>
                <div class="text-truncate text-muted small">${q.text}</div>
            </div>
            <button class="btn btn-sm text-danger" onclick="window.Studio.wizard.removeQ(${i})">&times;</button>
        </div>
    `).join('');
}