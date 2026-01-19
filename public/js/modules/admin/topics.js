import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    legislationList: new Set() // Mevzuat kodlarını burada toplayacağız
};

// ============================================================
// --- INIT ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro v3 (Auto-Gen) Başlatılıyor...");
    renderMainInterface();

    // Global API (HTML'den erişim için)
    window.Studio = {
        open: openEditor,
        close: () => document.getElementById('topicModal').style.display = 'none',
        saveMeta: saveTopicMeta,
        newContent: createNewContent,
        selectContent: selectContentItem, // İsim düzeltildi
        saveContent: saveContent,
        deleteContent: deleteContent,
        addMat: addMaterialUI,
        removeMat: removeMaterialUI,
        updateMat: updateMaterialItem,
        wizard: {
            analyze: analyzeLegislation,
            addQ: addQuestionToTest,
            removeQ: removeQuestionFromTest,
            autoGenerate: openAutoGenerator // Yeni Özellik
        },
        trash: { open: openTrash, restore: restoreItem, purge: purgeItem }
    };

    loadTopics();
}

// ============================================================
// --- ARAYÜZ ---
// ============================================================
function renderMainInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Konuları yönetin, ders notları ekleyin ve otomatik testler oluşturun.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="window.Studio.trash.open()">🗑️ Çöp Kutusu</button>
                <button class="btn btn-primary" onclick="window.Studio.open()">➕ Yeni Konu</button>
            </div>
        </div>

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

        <!-- STUDIO MODAL -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content">
                
                <div class="studio-header">
                    <div class="studio-title"><span class="icon">⚡</span> İçerik Stüdyosu</div>
                    <button class="close-btn" onclick="window.Studio.close()">&times;</button>
                </div>

                <div class="studio-layout">
                    <!-- SOL PANEL -->
                    <div class="studio-sidebar">
                        <div class="d-grid gap-2 mb-3">
                            <button class="btn btn-secondary btn-sm" onclick="window.Studio.newContent('lesson')">📄 Ders Notu</button>
                            <button class="btn btn-warning btn-sm" style="color:#000" onclick="window.Studio.newContent('test')">📝 Test Oluştur</button>
                        </div>
                        
                        <div class="sidebar-section-title">İÇERİK AKIŞI</div>
                        <div id="contentListNav"></div>

                        <div class="mt-auto pt-3 border-top border-color">
                            <button class="btn btn-outline w-100 btn-sm" onclick="window.Studio.open(state.activeTopicId, true)">⚙️ Konu Ayarları</button>
                        </div>
                    </div>

                    <!-- SAĞ PANEL -->
                    <div class="studio-editor">
                        
                        <!-- A. KONU AYARLARI -->
                        <div id="metaEditor" class="editor-workspace">
                            <div class="studio-card" style="max-width:800px; margin:0 auto;">
                                <h3 class="mb-4">Konu Bilgileri</h3>
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
                                            <option value="true">Yayında</option>
                                            <option value="false">Taslak</option>
                                        </select>
                                    </div>
                                    <button type="submit" class="btn btn-primary w-100 mt-3">Kaydet</button>
                                </form>
                            </div>
                        </div>

                        <!-- B. İÇERİK EDİTÖRÜ -->
                        <div id="contentEditor" style="display:none; flex-direction:column; height:100%;">
                            
                            <div class="editor-toolbar">
                                <div class="editor-title-group">
                                    <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="Başlık giriniz...">
                                </div>
                                <div class="editor-actions">
                                    <input type="number" id="inpContentOrder" placeholder="Sıra" title="Sıralama">
                                    <div class="vr-separator"></div>
                                    <button class="btn btn-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                    <button class="btn btn-success btn-sm" onclick="window.Studio.saveContent()">Kaydet</button>
                                </div>
                            </div>

                            <div class="editor-workspace p-0">
                                
                                <!-- 1. DERS NOTU MODU -->
                                <div id="wsLessonMode" class="p-4" style="max-width:1000px; margin:0 auto;">
                                    <div class="d-flex justify-content-center gap-2 mb-4">
                                        <button class="btn btn-sm btn-outline" onclick="window.Studio.addMat('html')">+ Metin</button>
                                        <button class="btn btn-sm btn-outline" onclick="window.Studio.addMat('pdf')">+ PDF</button>
                                        <button class="btn btn-sm btn-outline" onclick="window.Studio.addMat('video')">+ Video</button>
                                    </div>
                                    <div id="materialsContainer"></div>
                                </div>

                                <!-- 2. TEST SİHİRBAZI MODU -->
                                <div id="wsTestMode" class="h-100 p-3" style="display:none;">
                                    <div class="wizard-layout">
                                        
                                        <!-- Sol: Kaynak -->
                                        <div class="wizard-pool">
                                            <div class="wizard-header">1. SORU HAVUZU</div>
                                            <div class="p-3 border-bottom border-color">
                                                <label class="small text-muted mb-1">Mevzuat Kaynağı</label>
                                                <select id="wizLegislation" class="form-control mb-2" onchange="window.Studio.wizard.analyze()">
                                                    <option value="">Seçiniz...</option>
                                                </select>
                                                
                                                <div id="autoGenBox" class="mt-3 p-2 bg-hover rounded border border-color" style="display:none;">
                                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                                        <strong class="text-gold">🤖 Otomatik Test Robotu</strong>
                                                    </div>
                                                    <p class="small text-muted mb-2">Bu mevzuata ait tüm soruları 15'erli testlere bölüp otomatik oluşturur.</p>
                                                    <button class="btn btn-warning btn-sm w-100" onclick="window.Studio.wizard.autoGenerate()">
                                                        Otomatik Oluştur ve Kaydet
                                                    </button>
                                                </div>
                                            </div>
                                            <div id="questionPoolList" class="wizard-body"></div>
                                        </div>

                                        <!-- Sağ: Test Kağıdı -->
                                        <div class="wizard-col">
                                            <div class="wizard-header d-flex justify-content-between">
                                                <span>2. TEST KAĞIDI</span>
                                                <span class="badge bg-primary" id="testCountBadge">0</span>
                                            </div>
                                            <div id="testPaperList" class="wizard-body">
                                                <div class="text-center text-muted mt-5">Manuel seçim için soldan soru ekleyin.</div>
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
        
        <!-- Çöp Kutusu Modal -->
        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content" style="max-width:600px; height:auto; max-height:80vh;">
                <div class="modal-header"><h3>Çöp Kutusu</h3><button class="close-btn" onclick="document.getElementById('trashModal').style.display='none'">&times;</button></div>
                <div class="modal-body-scroll"><table class="admin-table"><tbody id="trashTableBody"></tbody></table></div>
            </div>
        </div>
    `;
}

// ============================================================
// --- VERİ YÖNETİMİ ---
// ============================================================

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), orderBy("order", "asc"));
    const snap = await getDocs(q);

    state.allTopics = [];
    state.legislationList.clear(); // Listeyi temizle

    snap.forEach(doc => {
        const d = doc.data();
        if (d.status !== 'deleted') {
            state.allTopics.push({ id: doc.id, ...d });

            // Mevzuat kodlarını topla (Seed verisinden gelen lessons içinden)
            if (d.lessons && Array.isArray(d.lessons)) {
                d.lessons.forEach(l => {
                    if (l.legislationCode) state.legislationList.add(l.legislationCode);
                });
            }
        }
    });

    // Standart kodları da ekle (Garanti olsun)
    ["2709", "657", "5271", "5237", "2577", "4483", "3628", "5018", "4982", "3071", "7201"].forEach(c => state.legislationList.add(c));

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
            <td class="text-end">
                <button class="btn btn-sm btn-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// --- STUDIO MANTIĞI ---
// ============================================================

async function openEditor(id = null, forceSettings = false) {
    document.getElementById('topicModal').style.display = 'flex';
    document.getElementById('contentListNav').innerHTML = '';
    state.activeTopicId = id;

    // Mevzuat listesini doldur
    populateLegislationSelect();

    if (id) {
        const topic = state.allTopics.find(t => t.id === id);
        document.getElementById('editTopicId').value = id;
        document.getElementById('inpTopicTitle').value = topic.title;
        document.getElementById('inpTopicOrder').value = topic.order;
        document.getElementById('inpTopicCategory').value = topic.category;
        document.getElementById('inpTopicStatus').value = topic.isActive.toString();

        await loadLessons(id);

        if (forceSettings || state.currentLessons.length === 0) {
            showMetaEditor();
        } else {
            selectContentItem(state.currentLessons[0].id);
        }
    } else {
        document.getElementById('topicMetaForm').reset();
        document.getElementById('editTopicId').value = "";
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        showMetaEditor();
    }
}

async function loadLessons(topicId) {
    const list = document.getElementById('contentListNav');
    list.innerHTML = '<div class="text-center p-2 text-muted">Yükleniyor...</div>';

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
    renderContentNav();
}

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
        if (id) {
            await updateDoc(doc(db, "topics", id), data);
        } else {
            data.createdAt = serverTimestamp();
            data.lessonCount = 0;
            const ref = await addDoc(collection(db, "topics"), data);
            state.activeTopicId = ref.id;
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Kaydedildi.");
        loadTopics();
    } catch (e) { alert(e.message); }
}

// --- İÇERİK YÖNETİMİ ---

function createNewContent(type) {
    if (!state.activeTopicId) return alert("Önce konuyu kaydedin.");
    state.activeLessonId = null;
    state.activeLessonType = type;

    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';
    renderContentNav();

    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;

    const badge = document.getElementById('editorBadge');
    if (type === 'test') {
        badge.innerText = "TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS";
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

    renderContentNav();

    const badge = document.getElementById('editorBadge');
    if (state.activeLessonType === 'test') {
        badge.innerText = "TEST";
        badge.className = "badge bg-warning text-dark";
        document.getElementById('wsLessonMode').style.display = 'none';
        document.getElementById('wsTestMode').style.display = 'block';
        state.tempQuestions = item.questions || [];
        renderTestPaper();

        // Eğer test ise, mevzuat seçimi için dropdown'ı hazırla
        // (Otomatik seçtirmek zor çünkü testin hangi mevzuattan olduğu veride yoksa bilemeyiz)
    } else {
        badge.innerText = "DERS";
        badge.className = "badge bg-primary";
        document.getElementById('wsLessonMode').style.display = 'block';
        document.getElementById('wsTestMode').style.display = 'none';
        state.tempMaterials = item.materials || [];
        renderMaterials();
    }
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
            await updateDoc(doc(db, "topics", state.activeTopicId), { lessonCount: state.currentLessons.length + 1 });
        }

        // Görsel Geri Bildirim
        const btn = document.querySelector('#contentEditor .btn-success');
        const old = btn.innerHTML;
        btn.innerHTML = '✓';
        setTimeout(() => btn.innerHTML = old, 1000);

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

// --- MATERYAL YÖNETİMİ ---
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
            <div class="h4 m-0">${m.type === 'video' ? '▶️' : '📄'}</div>
            <div style="flex:1;">
                <div class="d-flex justify-content-between mb-1">
                    <span class="badge bg-secondary">${m.type.toUpperCase()}</span>
                    <button class="btn btn-sm text-danger p-0" onclick="window.Studio.removeMat(${m.id})">&times;</button>
                </div>
                <input type="text" class="form-control form-control-sm mb-2" placeholder="Başlık" value="${m.title}" 
                    oninput="window.Studio.updateMat(${m.id}, 'title', this.value)">
                ${m.type === 'html'
            ? `<textarea class="form-control form-control-sm" rows="3" placeholder="İçerik..." oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm" placeholder="URL" value="${m.url}" oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">`
        }
            </div>
        </div>
    `).join('');
}

// ============================================================
// --- TEST SİHİRBAZI & OTOMATİK ÜRETİM ---
// ============================================================

function populateLegislationSelect() {
    const select = document.getElementById('wizLegislation');
    if (!select) return;

    const sorted = Array.from(state.legislationList).sort();
    select.innerHTML = '<option value="">Seçiniz...</option>' +
        sorted.map(c => `<option value="${c}">${c} Sayılı Kanun</option>`).join('');
}

async function analyzeLegislation() {
    const code = document.getElementById('wizLegislation').value;
    const list = document.getElementById('questionPoolList');
    const autoBox = document.getElementById('autoGenBox');

    if (!code) {
        list.innerHTML = '';
        autoBox.style.display = 'none';
        return;
    }

    list.innerHTML = '<div class="text-center p-3">Sorular taranıyor...</div>';

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

    // Global değişkene at (Otomatik üretim için)
    window.currentPool = questions;

    // Otomatik Üretim Kutusunu Göster
    autoBox.style.display = 'block';

    // Listeyi Göster
    list.innerHTML = questions.map(q => {
        const isAdded = state.tempQuestions.some(x => x.id === q.id);
        return `
            <div class="q-select-item" onclick="window.Studio.wizard.addQ('${q.id}')" style="${isAdded ? 'opacity:0.5; pointer-events:none;' : ''}">
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

// --- YENİ: OTOMATİK TEST ÜRETİCİ ---
async function openAutoGenerator() {
    const pool = window.currentPool;
    if (!pool || pool.length === 0) return alert("Soru bulunamadı.");

    const code = document.getElementById('wizLegislation').value;
    const batchSize = 15; // Her testte kaç soru olacak
    const totalTests = Math.ceil(pool.length / batchSize);

    if (!confirm(`${pool.length} soru bulundu.\nBu sorulardan ${totalTests} adet sıralı test oluşturulacak.\nOnaylıyor musunuz?`)) return;

    try {
        const topicId = state.activeTopicId;
        let currentOrder = state.currentLessons.length + 1;

        // Batch işlemi (Firestore batch limiti 500, biz burada her test için ayrı işlem yapacağız güvenli olsun)
        for (let i = 0; i < totalTests; i++) {
            const start = i * batchSize;
            const end = start + batchSize;
            const chunk = pool.slice(start, end);

            // Test Başlığı: "657 DMK - Test 1 (Md. 1-20)"
            const startArt = chunk[0].artNo;
            const endArt = chunk[chunk.length - 1].artNo;
            const title = `${code} Sayılı Kanun - Test ${i + 1} (Md. ${startArt}-${endArt})`;

            await addDoc(collection(db, `topics/${topicId}/lessons`), {
                title: title,
                type: 'test',
                order: currentOrder++,
                isActive: true,
                questions: chunk,
                qCount: chunk.length,
                createdAt: serverTimestamp()
            });
        }

        // Konu sayacını güncelle
        await updateDoc(doc(db, "topics", topicId), { lessonCount: currentOrder - 1 });

        alert(`✅ Başarıyla ${totalTests} test oluşturuldu!`);
        loadLessons(topicId); // Listeyi yenile

    } catch (e) {
        console.error(e);
        alert("Hata oluştu: " + e.message);
    }
}

function addQuestionToTest(id) {
    const raw = document.getElementById(`raw_${id}`).value;
    state.tempQuestions.push(JSON.parse(raw));
    renderTestPaper();
    analyzeLegislation(); // Listeyi güncelle
}

function removeQuestionFromTest(idx) {
    state.tempQuestions.splice(idx, 1);
    renderTestPaper();
    analyzeLegislation();
}

function renderTestPaper() {
    const list = document.getElementById('testPaperList');
    document.getElementById('testCountBadge').innerText = `${state.tempQuestions.length}`;

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