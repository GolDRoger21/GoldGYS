import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// --- GLOBAL STATE ---
// ============================================================
let state = {
    allTopics: [],
    currentLessons: [],
    activeLessonId: null,
    activeLessonType: 'lesson', // 'lesson' | 'test'
    tempMaterials: [],
    tempQuestions: [],
    legislations: [] // Veritabanından çekilecek mevzuat listesi
};

// ============================================================
// --- INIT & EXPOSE API ---
// ============================================================
export function initTopicsPage() {
    console.log("🚀 Studio Pro Modülü Başlatılıyor...");

    // 1. Önce Arayüzü Çiz
    renderMainInterface();

    // 2. Global Fonksiyonları Dışarı Aç (HTML'den erişim için)
    exposeGlobals();

    // 3. Verileri Yükle
    loadTopics();
    fetchLegislationCodes(); // Mevzuat listesini dinamik çek
}

function exposeGlobals() {
    window.Studio = {
        open: openEditor,
        close: () => document.getElementById('topicModal').style.display = 'none',
        settings: showTopicSettings, // Düzeltilen fonksiyon referansı
        saveMeta: saveTopicMeta,
        newContent: createNewContentUI,
        select: selectContentItem,
        saveContent: saveContentData,
        deleteContent: deleteContentItem,
        addMat: addMaterialItem,
        removeMat: removeMaterialItem,
        updateMat: updateMaterialItem,
        trash: {
            open: openTrash,
            restore: restoreItem,
            purge: purgeItem
        },
        wizard: {
            heatmap: renderHeatmap,
            query: runQuery,
            addQ: addQuestion,
            removeQ: removeQuestion
        }
    };
}

// ============================================================
// --- RENDER INTERFACE (HTML YAPISI) ---
// ============================================================
function renderMainInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Stüdyosu</h2>
                <p class="text-muted">Profesyonel içerik yönetim merkezi.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="window.Studio.trash.open()">
                    <i class="fas fa-trash-alt"></i> Çöp Kutusu
                </button>
                <button class="btn btn-primary" onclick="window.Studio.open()">
                    <i class="fas fa-plus"></i> Yeni Konu Başlat
                </button>
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
                    <span class="badge bg-light text-dark border px-3 py-2" id="topicCountBadge">Yükleniyor...</span>
                </div>
            </div>
        </div>

        <div class="card border-0 shadow-sm">
            <div class="table-responsive">
                <table class="admin-table table-hover">
                    <thead>
                        <tr>
                            <th style="width:60px">Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>İçerik</th>
                            <th>Durum</th>
                            <th class="text-end">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody"></tbody>
                </table>
            </div>
        </div>

        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="admin-modal-content">
                
                <div class="modal-header">
                    <div class="modal-title-group d-flex align-items-center">
                        <h3>İçerik Stüdyosu</h3>
                        <span class="badge">PRO</span>
                    </div>
                    <button class="close-btn" onclick="window.Studio.close()">&times;</button>
                </div>

                <div class="studio-grid">
                    
                    <div class="studio-sidebar">
                        
                        <div class="quick-actions">
                            <div class="action-card" onclick="window.Studio.newContent('lesson')">
                                <i>📄</i>
                                <span>Ders Notu</span>
                            </div>
                            <div class="action-card" onclick="window.Studio.newContent('test')">
                                <i>📝</i>
                                <span>Sınav / Test</span>
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-2 px-1">
                            <small class="text-muted fw-bold text-uppercase">İÇERİK AKIŞI</small>
                            <span class="badge bg-dark border border-secondary" id="lessonCountBadge">0</span>
                        </div>

                        <div id="contentListNav" class="flex-grow-1 overflow-auto pe-1"></div>

                        <div class="mt-auto pt-3 border-top border-secondary">
                            <button class="btn btn-secondary w-100 btn-sm" onclick="window.Studio.settings()">
                                ⚙️ Ana Konu Ayarları
                            </button>
                        </div>
                    </div>

                    <div class="studio-main">
                        
                        <div id="metaEditor" class="workspace">
                            <div class="workspace-inner">
                                <h4 class="text-gold mb-4 border-bottom border-secondary pb-2">Ana Konu Yapılandırması</h4>
                                <form id="topicMetaForm">
                                    <input type="hidden" id="editTopicId">
                                    <div class="row g-4">
                                        <div class="col-md-9">
                                            <label class="form-label text-muted">Konu Başlığı</label>
                                            <input type="text" id="inpTopicTitle" class="form-control form-control-lg bg-dark text-white border-secondary" placeholder="Örn: Anayasa Hukuku">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label text-muted">Sıra No</label>
                                            <input type="number" id="inpTopicOrder" class="form-control form-control-lg bg-dark text-white border-secondary">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label text-muted">Kategori</label>
                                            <select id="inpTopicCategory" class="form-select bg-dark text-white border-secondary">
                                                <option value="ortak">Ortak Konular</option>
                                                <option value="alan">Alan Konuları</option>
                                            </select>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label text-muted">Durum</label>
                                            <select id="inpTopicStatus" class="form-select bg-dark text-white border-secondary">
                                                <option value="true">Yayında (Aktif)</option>
                                                <option value="false">Taslak (Pasif)</option>
                                            </select>
                                        </div>
                                        <div class="col-12">
                                            <label class="form-label text-muted">Açıklama</label>
                                            <textarea id="inpTopicDesc" class="form-control bg-dark text-white border-secondary" rows="4"></textarea>
                                        </div>
                                        <div class="col-12 text-end">
                                            <button type="button" class="btn btn-primary px-5" onclick="window.Studio.saveMeta()">
                                                Kaydet ve İlerle
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <div id="contentEditor" style="display:none; height:100%; flex-direction:column;">
                            
                            <div class="editor-toolbar">
                                <div class="d-flex align-items-center gap-3 flex-grow-1">
                                    <span class="badge bg-secondary fs-6" id="editorBadge">DERS</span>
                                    <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı...">
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <input type="number" id="inpContentOrder" class="form-control form-control-sm bg-dark text-white border-secondary text-center" placeholder="#" style="width:60px" title="Sıralama">
                                    
                                    <div class="vr bg-secondary mx-3" style="height:20px;"></div>
                                    
                                    <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                    <button class="btn btn-success btn-sm px-4" onclick="window.Studio.saveContent()">
                                        <i class="fas fa-save"></i> Kaydet
                                    </button>
                                </div>
                            </div>

                            <div class="workspace bg-dark" style="padding:0;">
                                
                                <div id="wsLesson" class="workspace-inner py-4">
                                    <div class="alert alert-dark border-secondary d-flex justify-content-center gap-3 mb-4">
                                        <button class="btn btn-sm btn-outline-info" onclick="window.Studio.addMat('html')">📝 Metin</button>
                                        <button class="btn btn-sm btn-outline-danger" onclick="window.Studio.addMat('pdf')">📄 PDF</button>
                                        <button class="btn btn-sm btn-outline-warning" onclick="window.Studio.addMat('video')">▶️ Video</button>
                                        <button class="btn btn-sm btn-outline-primary" onclick="window.Studio.addMat('podcast')">🎧 Podcast</button>
                                    </div>
                                    <div id="materialsList"></div>
                                </div>

                                <div id="wsTest" class="h-100 p-3" style="display:none;">
                                    <div class="wizard-layout">
                                        
                                        <div class="wizard-pool p-3">
                                            <div class="mb-3 border-bottom border-secondary pb-3">
                                                <label class="text-muted small fw-bold mb-2">MEVZUAT KAYNAĞI</label>
                                                <select id="wizLegislation" class="form-select form-select-sm bg-dark text-white border-secondary mb-2" onchange="window.Studio.wizard.heatmap(this.value)">
                                                    <option value="">Yükleniyor...</option>
                                                </select>
                                                
                                                <div id="legislationHeatmap" class="heatmap-track mb-2"></div>
                                                
                                                <div class="custom-input-group">
                                                    <input type="number" id="wizStart" class="form-control form-control-sm bg-dark text-white border-secondary" placeholder="Başlangıç Md.">
                                                    <input type="number" id="wizEnd" class="form-control form-control-sm bg-dark text-white border-secondary" placeholder="Bitiş Md.">
                                                    <button class="btn btn-primary btn-sm" onclick="window.Studio.wizard.query()">Getir</button>
                                                </div>
                                            </div>
                                            
                                            <div id="questionPoolList" class="flex-grow-1 overflow-auto">
                                                <div class="text-center text-muted small mt-5">
                                                    <i class="fas fa-filter fa-2x mb-2"></i><br>
                                                    Kriter seçip soruları getirin.
                                                </div>
                                            </div>
                                        </div>

                                        <div class="wizard-paper p-3">
                                            <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom border-secondary">
                                                <span class="text-gold fw-bold">OLUŞTURULAN TEST</span>
                                                <span class="badge bg-primary" id="testQCount">0 Soru</span>
                                            </div>
                                            <div id="testPaperList" class="flex-grow-1 overflow-auto"></div>
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
            <div class="admin-modal-content" style="max-width:800px; height:70vh;">
                <div class="modal-header">
                    <h3>Geri Dönüşüm Kutusu</h3>
                    <button class="close-btn" onclick="document.getElementById('trashModal').style.display='none'">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <table class="admin-table"><tbody id="trashTableBody"></tbody></table>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// --- VERİ YÖNETİMİ (TOPIC CRUD) ---
// ============================================================

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Yükleniyor...</td></tr>';

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snap = await getDocs(q);

        state.allTopics = [];
        snap.forEach(doc => {
            if (doc.data().status !== 'deleted') {
                state.allTopics.push({ id: doc.id, ...doc.data() });
            }
        });

        window.filterTopics(); // Helper çağrısı
    } catch (e) { console.error(e); }
}

window.filterTopics = () => {
    const search = document.getElementById('searchTopic').value.toLowerCase();
    const cat = document.getElementById('filterCategory').value;
    const tbody = document.getElementById('topicsTableBody');

    const filtered = state.allTopics.filter(t =>
        (cat === 'all' || t.category === cat) &&
        (t.title || '').toLowerCase().includes(search)
    );

    document.getElementById('topicCountBadge').innerText = `${filtered.length} Kayıt`;

    tbody.innerHTML = filtered.map((t, index) => `
        <tr>
            <td>${t.order}</td>
            <td><strong>${t.title}</strong></td>
            <td><span class="badge bg-dark border border-secondary">${t.category === 'ortak' ? 'Ortak' : 'Alan'}</span></td>
            <td>${t.lessonCount || 0} İçerik</td>
            <td>${t.isActive ? '<span class="text-success">● Yayında</span>' : '<span class="text-muted">○ Taslak</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-primary" onclick="window.Studio.open('${t.id}')">Stüdyo</button>
            </td>
        </tr>
    `).join('');
};

// ============================================================
// --- STUDIO ENGINE ---
// ============================================================

async function openEditor(id = null) {
    document.getElementById('topicModal').style.display = 'flex';
    document.getElementById('contentListNav').innerHTML = '';

    // Varsayılan olarak Ayarlar panelini aç
    showTopicSettings();

    if (id) {
        // Düzenleme Modu
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
        // Yeni Kayıt Modu
        document.getElementById('editTopicId').value = "";
        document.getElementById('topicMetaForm').reset();
        document.getElementById('inpTopicOrder').value = state.allTopics.length + 1;
        document.getElementById('contentListNav').innerHTML = '<div class="text-center text-muted mt-4 p-3 small">Yeni konu oluşturuluyor...<br>Lütfen önce konu bilgilerini kaydedin.</div>';
    }
}

async function loadContents(topicId) {
    const list = document.getElementById('contentListNav');
    list.innerHTML = '<div class="text-center text-muted mt-3"><small>Yükleniyor...</small></div>';

    try {
        const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
        const snap = await getDocs(q);

        state.currentLessons = [];
        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<div class="text-center text-muted mt-4 small">Henüz içerik eklenmemiş.</div>';
            return;
        }

        snap.forEach(doc => {
            const d = { id: doc.id, ...doc.data() };
            state.currentLessons.push(d);

            const icon = d.type === 'test' ? '📝' : '📄';
            const activeClass = d.isActive ? '' : 'text-decoration-line-through opacity-50';

            const div = document.createElement('div');
            div.className = 'content-nav-item';
            div.innerHTML = `
                <div class="nav-item-icon">${icon}</div>
                <div class="nav-item-meta ${activeClass}">
                    <div class="nav-item-title">${d.title}</div>
                    <div class="nav-item-sub">Sıra: ${d.order}</div>
                </div>
            `;
            div.onclick = () => selectContentItem(d.id, div);
            list.appendChild(div);
        });

        document.getElementById('lessonCountBadge').innerText = state.currentLessons.length;

    } catch (e) { console.error(e); }
}

function showTopicSettings() {
    document.getElementById('metaEditor').style.display = 'block';
    document.getElementById('contentEditor').style.display = 'none';
    // Aktif classları temizle
    document.querySelectorAll('.content-nav-item').forEach(el => el.classList.remove('active'));
}

async function saveTopicMeta() {
    const id = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpTopicTitle').value;

    if (!title) return alert("Konu başlığı boş olamaz.");

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
            data.lessonCount = 0;
            const ref = await addDoc(collection(db, "topics"), data);
            document.getElementById('editTopicId').value = ref.id;
        }
        alert("Konu bilgileri başarıyla kaydedildi.");
        loadTopics(); // Arka planda listeyi yenile
    } catch (e) { alert("Hata: " + e.message); }
}

// ============================================================
// --- İÇERİK EDİTÖRÜ ---
// ============================================================

function createNewContentUI(type) {
    const topicId = document.getElementById('editTopicId').value;
    if (!topicId) return alert("Lütfen önce ana konuyu kaydedin!");

    state.activeLessonId = null;
    state.activeLessonType = type;

    // UI Geçişi
    document.getElementById('metaEditor').style.display = 'none';
    document.getElementById('contentEditor').style.display = 'flex';
    document.querySelectorAll('.content-nav-item').forEach(el => el.classList.remove('active'));

    // Form Sıfırla
    document.getElementById('inpContentTitle').value = "";
    document.getElementById('inpContentTitle').focus();
    document.getElementById('inpContentOrder').value = state.currentLessons.length + 1;

    const badge = document.getElementById('editorBadge');
    const wsLesson = document.getElementById('wsLesson');
    const wsTest = document.getElementById('wsTest');

    if (type === 'test') {
        badge.innerText = "SINAV / TEST";
        badge.className = "badge bg-warning text-dark fs-6";
        wsLesson.style.display = 'none';
        wsTest.style.display = 'block';
        state.tempQuestions = [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-primary fs-6";
        wsLesson.style.display = 'block';
        wsTest.style.display = 'none';
        state.tempMaterials = [];
        renderMaterials();
    }
}

function selectContentItem(id, element) {
    // Görsel seçim
    if (element) {
        document.querySelectorAll('.content-nav-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
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
    const wsLesson = document.getElementById('wsLesson');
    const wsTest = document.getElementById('wsTest');

    if (state.activeLessonType === 'test') {
        badge.innerText = "SINAV / TEST";
        badge.className = "badge bg-warning text-dark fs-6";
        wsLesson.style.display = 'none';
        wsTest.style.display = 'block';
        state.tempQuestions = item.questions || [];
        renderTestPaper();
    } else {
        badge.innerText = "DERS NOTU";
        badge.className = "badge bg-primary fs-6";
        wsLesson.style.display = 'block';
        wsTest.style.display = 'none';
        state.tempMaterials = item.materials || [];
        renderMaterials();
    }
}

async function saveContentData() {
    const topicId = document.getElementById('editTopicId').value;
    const title = document.getElementById('inpContentTitle').value;

    if (!title) return alert("İçerik başlığı giriniz.");

    const data = {
        title,
        type: state.activeLessonType,
        order: parseInt(document.getElementById('inpContentOrder').value) || 0,
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

        // Buton Feedback
        const btn = document.querySelector('#contentEditor .btn-success');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Kaydedildi';
        setTimeout(() => btn.innerHTML = oldHtml, 2000);

        loadContents(topicId); // Listeyi yenile
    } catch (e) { alert("Hata: " + e.message); }
}

async function deleteContentItem() {
    if (!state.activeLessonId) return;
    if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;

    const topicId = document.getElementById('editTopicId').value;
    try {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, state.activeLessonId));
        showTopicSettings();
        loadContents(topicId);
    } catch (e) { alert(e.message); }
}

// ============================================================
// --- MATERYAL YÖNETİMİ ---
// ============================================================

function addMaterialItem(type) {
    state.tempMaterials.push({
        id: Date.now(),
        type: type,
        title: '',
        url: ''
    });
    renderMaterials();
}

function removeMaterialItem(id) {
    state.tempMaterials = state.tempMaterials.filter(m => m.id !== id);
    renderMaterials();
}

function updateMaterialItem(id, field, value) {
    const item = state.tempMaterials.find(m => m.id === id);
    if (item) item[field] = value;
}

function renderMaterials() {
    const list = document.getElementById('materialsList');
    list.innerHTML = state.tempMaterials.map(m => {
        const inputHtml = m.type === 'html'
            ? `<textarea class="form-control form-control-sm bg-dark text-white border-secondary mt-2" rows="3" placeholder="İçerik..." oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">${m.url}</textarea>`
            : `<input type="text" class="form-control form-control-sm bg-dark text-white border-secondary mt-2" placeholder="URL..." value="${m.url}" oninput="window.Studio.updateMat(${m.id}, 'url', this.value)">`;

        return `
            <div class="material-item">
                <div class="material-icon type-${m.type}">
                    ${m.type === 'video' ? '▶️' : m.type === 'podcast' ? '🎧' : m.type === 'pdf' ? '📄' : '📝'}
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between mb-1">
                        <span class="badge bg-dark border border-secondary">${m.type.toUpperCase()}</span>
                        <button class="btn btn-sm text-danger p-0" onclick="window.Studio.removeMat(${m.id})">&times;</button>
                    </div>
                    <input type="text" class="form-control form-control-sm bg-transparent border-0 text-white fw-bold p-0 mb-1" 
                        placeholder="Materyal Başlığı Giriniz..." value="${m.title}" 
                        oninput="window.Studio.updateMat(${m.id}, 'title', this.value)" style="font-size:1rem;">
                    ${inputHtml}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// --- TEST SİHİRBAZI & DİNAMİK VERİ ---
// ============================================================

// 1. MEVZUAT LİSTESİNİ DİNAMİK ÇEK
async function fetchLegislationCodes() {
    const select = document.getElementById('wizLegislation');
    select.innerHTML = '<option value="">Mevzuat Yükleniyor...</option>';

    try {
        // Not: Gerçek sistemde binlerce soru varsa "questions" koleksiyonunu taramak pahalıdır.
        // İdeal olan "legislations" diye ayrı bir koleksiyon tutmaktır. 
        // Ancak şu an mevcut sorulardan unique kodları çekeceğiz.

        // Son eklenen 500 soruyu çekip kodları ayrıştır (Örnekleme)
        const q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(500));
        const snap = await getDocs(q);

        const codes = new Set();
        snap.forEach(doc => {
            const data = doc.data();
            if (data.legislationRef && data.legislationRef.code) {
                codes.add(data.legislationRef.code);
            }
        });

        // Standart Kodlar (DB boşsa veya eksikse görünsün diye)
        const standards = ["2709", "657", "5271", "5237", "2577", "4483", "3628"];
        standards.forEach(c => codes.add(c));

        const sortedCodes = Array.from(codes).sort();

        select.innerHTML = '<option value="">Mevzuat Seçiniz...</option>';
        sortedCodes.forEach(code => {
            select.innerHTML += `<option value="${code}">${code} Sayılı Kanun</option>`;
        });

    } catch (e) {
        console.error("Mevzuat listesi hatası:", e);
        select.innerHTML = '<option value="">Hata Oluştu</option>';
    }
}

// 2. ISI HARİTASI
async function renderHeatmap(code) {
    if (!code) return;
    const div = document.getElementById('legislationHeatmap');
    div.innerHTML = '<small class="text-muted">Analiz...</small>';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code));
    const snap = await getDocs(q);

    const counts = {};
    let maxArt = 0;

    snap.forEach(d => {
        const art = parseInt(d.data().legislationRef?.article);
        if (!isNaN(art)) {
            counts[art] = (counts[art] || 0) + 1;
            if (art > maxArt) maxArt = art;
        }
    });

    div.innerHTML = '';
    const limit = maxArt || 100;
    const step = Math.ceil(limit / 40); // 40 bar

    for (let i = 1; i <= limit; i += step) {
        let total = 0;
        for (let j = 0; j < step; j++) total += (counts[i + j] || 0);

        const bar = document.createElement('div');
        bar.className = 'heatmap-segment';
        bar.style.flex = '1';
        bar.style.marginRight = '1px';
        bar.style.height = '100%';
        bar.title = `Madde ${i}-${i + step}: ${total} Soru`;

        // Renk
        if (total === 0) bar.style.background = 'rgba(255,255,255,0.1)';
        else if (total < 3) bar.style.background = '#f59e0b'; // Turuncu
        else bar.style.background = '#10b981'; // Yeşil

        bar.onclick = () => {
            document.getElementById('wizStart').value = i;
            document.getElementById('wizEnd').value = i + step;
        };
        div.appendChild(bar);
    }
}

// 3. SORGULAMA
async function runQuery() {
    const code = document.getElementById('wizLegislation').value;
    const s = parseInt(document.getElementById('wizStart').value);
    const e = parseInt(document.getElementById('wizEnd').value);

    if (!code) return alert("Mevzuat seçiniz.");

    const list = document.getElementById('questionPoolList');
    list.innerHTML = '<div class="text-center p-4 text-muted">Aranıyor...</div>';

    const q = query(collection(db, "questions"), where("legislationRef.code", "==", code), limit(100));
    const snap = await getDocs(q);

    const arr = [];
    snap.forEach(d => {
        const art = parseInt(d.data().legislationRef?.article);
        // Client-side range filter
        if (!isNaN(art) && (!s || art >= s) && (!e || art <= e)) {
            arr.push({ id: d.id, ...d.data(), artNo: art });
        }
    });

    arr.sort((a, b) => a.artNo - b.artNo);

    if (arr.length === 0) {
        list.innerHTML = '<div class="text-center p-4 text-muted">Bu aralıkta soru bulunamadı.</div>';
        return;
    }

    list.innerHTML = arr.map(q => {
        const isSelected = state.tempQuestions.some(x => x.id === q.id);
        const style = isSelected ? 'opacity:0.5; pointer-events:none;' : '';
        const badge = isSelected ? '<span class="badge bg-success">Eklendi</span>' : '';

        return `
            <div class="q-item" style="${style}" onclick="window.Studio.wizard.addQ('${q.id}')">
                <div class="d-flex justify-content-between">
                    <strong>Madde ${q.artNo}</strong>
                    ${badge}
                </div>
                <div class="text-truncate text-muted small mt-1">${q.text}</div>
                <input type="hidden" id="raw_${q.id}" value='${JSON.stringify(q).replace(/'/g, "&#39;")}'>
            </div>
        `;
    }).join('');
}

function addQuestion(id) {
    if (state.tempQuestions.some(x => x.id === id)) return;
    const rawVal = document.getElementById(`raw_${id}`).value;
    const raw = JSON.parse(rawVal);

    state.tempQuestions.push(raw);
    renderTestPaper();
    runQuery(); // Listeyi güncelle (disable etmek için)
}

function removeQuestion(idx) {
    state.tempQuestions.splice(idx, 1);
    renderTestPaper();
    runQuery();
}

function renderTestPaper() {
    const list = document.getElementById('testPaperList');
    document.getElementById('testQCount').innerText = `${state.tempQuestions.length} Soru`;

    list.innerHTML = state.tempQuestions.map((q, i) => `
        <div class="d-flex gap-2 border-bottom border-secondary py-2 align-items-center">
            <span class="text-gold fw-bold">${i + 1}.</span>
            <div class="flex-grow-1 overflow-hidden">
                <div class="small fw-bold text-white">Md. ${q.legislationRef?.article}</div>
                <div class="text-truncate text-muted small">${q.text}</div>
            </div>
            <button class="btn btn-sm text-danger" onclick="window.Studio.wizard.removeQ(${i})">&times;</button>
        </div>
    `).join('');
}

// ============================================================
// --- ÇÖP KUTUSU ---
// ============================================================

async function openTrash() {
    document.getElementById('trashModal').style.display = 'flex';
    const tbody = document.getElementById('trashTableBody');
    tbody.innerHTML = '<tr><td colspan="2">Yükleniyor...</td></tr>';

    const q = query(collection(db, "topics"), where("status", "==", "deleted"));
    const snap = await getDocs(q);

    tbody.innerHTML = '';
    if (snap.empty) tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Çöp kutusu boş.</td></tr>';

    snap.forEach(doc => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${doc.data().title}</td>
            <td class="text-end">
                <button class="btn btn-success btn-sm" onclick="window.Studio.trash.restore('${doc.id}')">Geri Al</button>
                <button class="btn btn-danger btn-sm" onclick="window.Studio.trash.purge('${doc.id}')">Sil</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function restoreItem(id) {
    await updateDoc(doc(db, "topics", id), { status: 'active' });
    openTrash(); loadTopics();
}

async function purgeItem(id) {
    if (confirm("Kalıcı olarak silinecek!")) {
        await deleteDoc(doc(db, "topics", id));
        openTrash();
    }
}