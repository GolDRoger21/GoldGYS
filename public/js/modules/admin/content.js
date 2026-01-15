import { db } from "../../firebase-config.js";
import {
    collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global State
let state = {
    currentTopicId: null,
    currentSubTopicId: null,
    editingContentId: null,
    topicsMap: {},
    // Quiz Builder State
    quizQuestions: []
};

// UI Template (Inlined for Theme Consistency)
const UI_TEMPLATE = `
<div class="d-flex h-100" style="gap: 20px;">
    <!-- Sidebar: Konu Ağacı -->
    <aside class="card" style="width: 300px; padding: 0; display: flex; flex-direction: column; overflow: hidden; margin-bottom: 0;">
        <div class="p-3 border-bottom border-secondary">
            <h5 class="mb-2 fw-bold text-white"><i class="bi bi-journal-bookmark-fill me-2 text-warning"></i>Müfredat</h5>
            <input type="text" id="topicSearch" class="form-control form-control-sm" placeholder="Konu ara...">
        </div>
        <div id="topicTreeList" class="flex-grow-1 p-2">
            <!-- Konular buraya JS ile gelecek -->
        </div>
    </aside>

    <!-- Main: İçerik Alanı -->
    <main class="flex-grow-1 card d-flex flex-column position-relative p-0" style="margin-bottom: 0;">
        
        <!-- Empty State -->
        <div id="emptyState" class="d-flex flex-column align-items-center justify-content-center h-100 text-center p-5">
            <i class="bi bi-collection-play fs-1 text-muted mb-3"></i>
            <h4 class="text-white fw-bold">İçerik Yönetimi</h4>
            <p class="text-muted">İçerikleri yönetmek için soldaki menüden bir konu seçiniz.</p>
        </div>

        <!-- Content Panel -->
        <div id="contentPanel" class="d-none flex-column h-100">
            <!-- Header -->
            <div class="p-4 border-bottom border-secondary">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <span class="badge border border-warning text-warning" id="headerCategoryBadge">Kategori</span>
                            <span class="badge border border-secondary text-muted" id="contentCountBadge">0 İçerik</span>
                        </div>
                        <h2 class="mb-0 fw-bold text-white" id="headerTitle">Konu Başlığı</h2>
                        <p class="text-muted mb-0 small" id="headerSubTitle">Alt başlık</p>
                    </div>
                </div>

                <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-sm border-secondary text-white" onclick="window.ContentManager.openModal('video')">
                        <i class="bi bi-youtube me-1 text-danger"></i> Video
                    </button>
                    <button class="btn btn-sm border-secondary text-white" onclick="window.ContentManager.openModal('pdf')">
                        <i class="bi bi-file-earmark-pdf me-1 text-warning"></i> PDF
                    </button>
                    <button class="btn btn-sm border-secondary text-white" onclick="window.ContentManager.openModal('html')">
                        <i class="bi bi-file-text me-1 text-success"></i> Not
                    </button>
                    <div class="vr mx-1 bg-secondary"></div>
                    <button class="btn btn-primary btn-sm fw-bold" onclick="window.ContentManager.openModal('quiz')">
                        <i class="bi bi-ui-checks me-1"></i> Test Oluştur
                    </button>
                </div>
            </div>

            <!-- List Area -->
            <div id="contentWorkspace" class="p-4 flex-grow-1 overflow-auto" style="background: rgba(0,0,0,0.2);">
                <!-- İçerik kartları buraya -->
            </div>
        </div>
    </main>
</div>

<!-- Modal -->
<div id="contentModal" class="modal-overlay" style="display:none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:2000; align-items:center; justify-content:center;">
    <div class="card shadow-lg" style="width: 90%; max-width: 800px; max-height: 90vh; display:flex; flex-direction:column; padding:0;">
        <div class="p-3 border-bottom border-secondary d-flex justify-content-between align-items-center">
            <h5 class="mb-0 fw-bold text-white" id="modalTitle">İçerik Ekle</h5>
            <button type="button" class="btn btn-sm btn-outline-secondary text-white" onclick="window.ContentManager.closeModal()"><i class="bi bi-x-lg"></i></button>
        </div>
        
        <div class="p-4 overflow-auto custom-scrollbar">
            <input type="hidden" id="inpContentType">
            
            <div class="row mb-3">
                <div class="col-md-9">
                    <label class="form-label text-muted small fw-bold">BAŞLIK</label>
                    <input type="text" id="inpTitle" class="form-control bg-dark text-white border-secondary" placeholder="Örn: Konu Anlatımı">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-muted small fw-bold">SIRA NO</label>
                    <input type="number" id="inpOrder" class="form-control bg-dark text-white border-secondary text-center" value="1">
                </div>
            </div>

            <div id="dynamicFields" class="mb-4">
                <!-- Dinamik Alanlar -->
            </div>
        </div>

        <div class="p-3 border-top border-secondary d-flex justify-content-end gap-2 bg-panel">
            <button onclick="window.ContentManager.closeModal()" class="btn btn-outline-secondary text-white px-4">İptal</button>
            <button onclick="window.ContentManager.saveContent()" class="btn btn-primary px-4" id="btnSave">
                <i class="bi bi-check-lg"></i> Kaydet
            </button>
        </div>
    </div>
</div>
`;

// Başlatıcı Fonksiyon
export async function initContentPage() {
    console.log("🚀 İçerik Yönetim Modülü Başlatılıyor...");
    const container = document.getElementById('section-content');
    container.innerHTML = UI_TEMPLATE;

    bindEvents();
    loadTopics();
}

// ==========================================
// 1. VERİ YÖNETİMİ & LİSTELEME
// ==========================================

async function loadTopics() {
    const listContainer = document.getElementById('topicTreeList');
    listContainer.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-warning spinner-border-sm"></div></div>';

    try {
        const q = query(collection(db, "topics"), orderBy("order"));
        const snapshot = await getDocs(q);

        state.topicsMap = {};
        let topics = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            state.topicsMap[doc.id] = data;
            topics.push({ id: doc.id, ...data });
        });

        renderTopicTree(topics);

    } catch (e) {
        listContainer.innerHTML = `<div class="text-danger p-3">Konular yüklenemedi: ${e.message}</div>`;
    }
}

function renderTopicTree(topics) {
    const listContainer = document.getElementById('topicTreeList');
    listContainer.innerHTML = '';

    const groups = {
        'ortak': { title: 'ORTAK KONULAR', items: [] },
        'alan': { title: 'ALAN BİLGİSİ', items: [] }
    };

    topics.forEach(t => {
        if (groups[t.category]) groups[t.category].items.push(t);
    });

    Object.values(groups).forEach(group => {
        if (group.items.length === 0) return;

        const groupHeader = document.createElement('div');
        groupHeader.className = 'small fw-bold text-muted mt-3 mb-2 px-3';
        groupHeader.style.fontSize = '0.75rem';
        groupHeader.innerText = group.title;
        listContainer.appendChild(groupHeader);

        group.items.forEach(topic => {
            // Ana Konu
            const el = document.createElement('div');
            el.className = 'topic-item d-flex justify-content-between align-items-center mb-1';
            el.innerHTML = `<span>${topic.title}</span> ${topic.subTopics ? '<i class="bi bi-chevron-down small opacity-50"></i>' : ''}`;
            el.onclick = () => selectTopic(topic.id, null, el);
            listContainer.appendChild(el);

            // Alt Konular
            if (topic.subTopics && topic.subTopics.length > 0) {
                const subWrapper = document.createElement('div');
                topic.subTopics.forEach(sub => {
                    const subEl = document.createElement('div');
                    subEl.className = 'topic-item sub-topic mb-1';
                    subEl.innerHTML = `<i class="bi bi-dot me-1"></i> ${sub.title}`;
                    subEl.onclick = (e) => {
                        e.stopPropagation();
                        selectTopic(topic.id, sub.id, subEl);
                    };
                    subWrapper.appendChild(subEl);
                });
                listContainer.appendChild(subWrapper);
            }
        });
    });
}

function selectTopic(topicId, subTopicId, element) {
    document.querySelectorAll('.topic-item').forEach(e => e.classList.remove('active'));
    element.classList.add('active');

    state.currentTopicId = topicId;
    state.currentSubTopicId = subTopicId;

    const topic = state.topicsMap[topicId];
    const subTitle = subTopicId ? topic.subTopics.find(s => s.id === subTopicId)?.title : 'Genel İçerikler';

    document.getElementById('headerTitle').innerText = topic.title;
    document.getElementById('headerSubTitle').innerText = subTitle;
    document.getElementById('headerCategoryBadge').innerText = topic.category === 'ortak' ? 'Ortak Konu' : 'Alan Bilgisi';

    document.getElementById('emptyState').classList.add('d-none');
    document.getElementById('contentPanel').classList.remove('d-none');
    document.getElementById('contentPanel').classList.add('d-flex');

    loadContents();
}

async function loadContents() {
    const workspace = document.getElementById('contentWorkspace');
    workspace.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning"></div></div>';

    let constraints = [
        where("topicId", "==", state.currentTopicId),
        orderBy("order", "asc")
    ];

    if (state.currentSubTopicId) {
        constraints.splice(1, 0, where("subTopicId", "==", state.currentSubTopicId));
    }

    try {
        const q = query(collection(db, "contents"), ...constraints);
        const snapshot = await getDocs(q);

        document.getElementById('contentCountBadge').innerText = `${snapshot.size} İçerik`;

        if (snapshot.empty) {
            workspace.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-1 opacity-25"></i>
                    <p class="mt-2">Bu bölümde henüz içerik yok.</p>
                </div>`;
            return;
        }

        let html = '<div class="d-flex flex-column gap-3">';
        snapshot.forEach(docSnap => {
            html += createContentCard(docSnap.id, docSnap.data());
        });
        html += '</div>';
        workspace.innerHTML = html;

    } catch (error) {
        console.error(error);
        workspace.innerHTML = `<div class="alert alert-warning">Veriler yüklenirken hata oluştu. (İndeks eksik olabilir)</div>`;
    }
}

function createContentCard(id, item) {
    let icon = 'bi-file-earmark';
    let typeClass = 'type-other';
    let metaInfo = '';

    switch (item.type) {
        case 'video': icon = 'bi-play-circle-fill text-danger'; typeClass = 'type-video'; break;
        case 'pdf': icon = 'bi-file-earmark-pdf-fill text-warning'; typeClass = 'type-pdf'; break;
        case 'quiz':
            icon = 'bi-patch-question-fill text-primary';
            typeClass = 'type-quiz';
            metaInfo = `<span class="badge bg-dark border border-secondary text-white ms-2"><i class="bi bi-list-check"></i> ${item.data.questionCount || 0} Soru</span>`;
            break;
        case 'html': icon = 'bi-file-text-fill text-success'; typeClass = 'type-html'; break;
        case 'podcast': icon = 'bi-mic-fill text-info'; typeClass = 'type-podcast'; break;
    }

    return `
        <div class="content-card ${typeClass} p-3 d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
                <div class="me-3 fw-bold text-muted opacity-50 fs-5" style="width:30px;">${item.order}</div>
                <div class="me-3 fs-3 ${icon}"></div>
                <div>
                    <h6 class="mb-1 fw-bold text-white">${item.title}</h6>
                    <div class="small text-muted">
                        ${item.type.toUpperCase()} 
                        ${metaInfo}
                        <span class="ms-2 opacity-50">• ${new Date(item.createdAt?.seconds * 1000).toLocaleDateString('tr-TR')}</span>
                    </div>
                </div>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-secondary text-white border-0" onclick="window.ContentManager.editContent('${id}')" title="Düzenle">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary text-danger border-0" onclick="window.ContentManager.deleteContent('${id}')" title="Sil">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// ==========================================
// 2. MODAL & FORM İŞLEMLERİ (QUESTION BUILDER)
// ==========================================

const openModal = (type, mode = 'create', existingData = null) => {
    if (mode === 'create' && !state.currentTopicId) {
        alert("Lütfen önce listeden bir konu seçiniz.");
        return;
    }

    const modal = document.getElementById('contentModal');
    const container = document.getElementById('dynamicFields');
    const titleInp = document.getElementById('inpTitle');
    const orderInp = document.getElementById('inpOrder');

    document.getElementById('inpContentType').value = type;
    modal.style.display = 'flex';
    container.innerHTML = '';

    // Mod Ayarları
    if (mode === 'edit' && existingData) {
        state.editingContentId = existingData.id;
        document.getElementById('modalTitle').innerText = `Düzenle: ${type.toUpperCase()}`;
        document.getElementById('btnSave').innerHTML = '<i class="bi bi-check-lg"></i> Güncelle';
        titleInp.value = existingData.title;
        orderInp.value = existingData.order;
    } else {
        state.editingContentId = null;
        document.getElementById('modalTitle').innerText = `Yeni ${type.toUpperCase()} Ekle`;
        document.getElementById('btnSave').innerHTML = '<i class="bi bi-check-lg"></i> Kaydet';
        titleInp.value = '';
        orderInp.value = document.querySelectorAll('.content-card').length + 1;
    }

    // Dinamik İçerik Alanları
    let html = '';
    const val = existingData ? (existingData.data.url || existingData.data.content || '') : '';

    if (type === 'video') {
        html = `
            <label class="form-label text-muted small fw-bold">VİDEO EMBED / URL</label>
            <input type="text" id="inpDataMain" class="form-control bg-dark text-white border-secondary" placeholder="https://..." value="${val}">`;
    } else if (type === 'pdf') {
        html = `
            <label class="form-label text-muted small fw-bold">PDF DOSYA LİNKİ</label>
            <input type="text" id="inpDataMain" class="form-control bg-dark text-white border-secondary" placeholder="https://..." value="${val}">`;
    } else if (type === 'html') {
        html = `
            <label class="form-label text-muted small fw-bold">DERS NOTU (HTML)</label>
            <textarea id="inpDataMain" class="form-control bg-dark text-white border-secondary font-monospace" rows="10">${val}</textarea>`;
    } else if (type === 'quiz') {
        // Init Quiz State
        state.quizQuestions = (mode === 'edit' && existingData?.data?.questions) ? existingData.data.questions : [];

        html = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <label class="form-label text-muted small fw-bold mb-0">SORULAR</label>
                <button class="btn btn-sm btn-outline-warning text-warning" onclick="window.ContentManager.addQuestion()">
                    <i class="bi bi-plus-lg"></i> Soru Ekle
                </button>
            </div>
            <div id="quizBuilderContainer" class="d-flex flex-column gap-3"></div>
        `;
        container.innerHTML = html;
        renderQuizBuilder(); // Render questions immediately
        return; // Stop here for quiz
    }
    container.innerHTML = html;
};

// --- Question Builder Logic ---

function renderQuizBuilder() {
    const container = document.getElementById('quizBuilderContainer');
    if (!container) return;

    if (state.quizQuestions.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-3 border border-secondary border-dashed rounded opacity-50">Henüz soru eklenmemiş.</div>';
        return;
    }

    container.innerHTML = '';
    state.quizQuestions.forEach((q, index) => {
        const qEl = document.createElement('div');
        qEl.className = 'qb-question-item';
        qEl.innerHTML = `
            <div class="badge-index">${index + 1}</div>
            <div class="d-flex justify-content-end mb-2">
                <button class="btn btn-sm text-danger p-0" onclick="window.ContentManager.removeQuestion(${index})"><i class="bi bi-trash"></i></button>
            </div>
            
            <textarea class="form-control bg-dark text-white border-secondary mb-3" rows="2" placeholder="Soru metni..." onchange="window.ContentManager.updateQuestion(${index}, 'text', this.value)">${q.text || ''}</textarea>
            
            <div class="qb-options-grid">
                ${['A', 'B', 'C', 'D'].map(opt => `
                    <div class="qb-option-input">
                        <input type="radio" name="correct-${index}" ${q.correct === opt ? 'checked' : ''} onchange="window.ContentManager.updateQuestion(${index}, 'correct', '${opt}')" title="Doğru Şıkkı İşaretle">
                        <input type="text" class="form-control form-control-sm bg-dark text-white border-secondary" placeholder="Seçenek ${opt}" value="${q.options?.[opt] || ''}" onchange="window.ContentManager.updateQuestion(${index}, 'opt-${opt}', this.value)">
                    </div>
                `).join('')}
            </div>
            <div class="mt-2">
                 <input type="text" class="form-control form-control-sm bg-dark text-white border-secondary" placeholder="Çözüm Açıklaması (Opsiyonel)" value="${q.solution || ''}" onchange="window.ContentManager.updateQuestion(${index}, 'solution', this.value)">
            </div>
        `;
        container.appendChild(qEl);
    });
}

function addQuestion() {
    state.quizQuestions.push({
        text: '',
        options: { A: '', B: '', C: '', D: '' },
        correct: 'A',
        solution: ''
    });
    renderQuizBuilder();
}

function removeQuestion(index) {
    if (confirm("Soruyu silmek istediğinize emin misiniz?")) {
        state.quizQuestions.splice(index, 1);
        renderQuizBuilder();
    }
}

function updateQuestion(index, field, value) {
    const q = state.quizQuestions[index];
    if (field === 'text') q.text = value;
    else if (field === 'correct') q.correct = value;
    else if (field === 'solution') q.solution = value;
    else if (field.startsWith('opt-')) {
        const optKey = field.split('-')[1];
        if (!q.options) q.options = {};
        q.options[optKey] = value;
    }
}

const closeModal = () => {
    document.getElementById('contentModal').style.display = 'none';
};

const saveContent = async () => {
    const btn = document.getElementById('btnSave');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Kaydediliyor...';

    try {
        const type = document.getElementById('inpContentType').value;
        const title = document.getElementById('inpTitle').value;
        const order = Number(document.getElementById('inpOrder').value);

        if (!title) throw new Error("Başlık alanı zorunludur.");

        let payload = {
            topicId: state.currentTopicId,
            subTopicId: state.currentSubTopicId,
            type, title, order,
            updatedAt: serverTimestamp()
        };

        if (type === 'quiz') {
            if (state.quizQuestions.length === 0) throw new Error("En az 1 soru eklemelisiniz.");

            // Validate Questions
            state.quizQuestions.forEach((q, i) => {
                if (!q.text) throw new Error(`${i + 1}. Sorunun metni boş olamaz.`);
                if (!q.options.A || !q.options.B) throw new Error(`${i + 1}. Sorunun en az 2 şıkkı olmalıdır.`);
            });

            // 1. Soruları Bankaya Ekle (Question Collection)
            const batch = writeBatch(db);
            const savedQuestions = [];

            // Eğer düzenleme modundaysak eski soruları temizlemek yerine sadece referansları güncelliyoruz
            // Ancak basitlik için: Bu versiyonda soruları 'questions' koleksiyonuna ekliyoruz.
            // Quiz dokümanı içinde soruları gömülü saklamak daha performanslı olabilir bu admin paneli için.
            // Şimdilik 'content' dokümanı içine 'data.questions' olarak gömüyoruz (NoSQL pattern).
            // Ayrıca 'questions' koleksiyonuna da atabiliriz ama test çözerken hangisi kullanılıyor?
            // Mevcut sistemde: Test engine muhtemelen gömülü datayı ya da ayrı koleksiyonu kullanıyor.
            // User requestinde "subject-data.js" kullanılmış. Genelde questions array'i içeriyor.
            // Biz burada content içine GÖMECEĞİZ.

            payload.data = {
                questions: state.quizQuestions,
                questionCount: state.quizQuestions.length,
                quizId: state.editingContentId || 'new' // Eğer ayrı collection kullanılıyorsa buraya ref gelir
            };

        } else {
            const dataMain = document.getElementById('inpDataMain').value;
            if (type === 'html') payload.data = { content: dataMain };
            else payload.data = { url: dataMain };
        }

        // Firestore Kayıt
        if (state.editingContentId) {
            await updateDoc(doc(db, "contents", state.editingContentId), payload);
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "contents"), payload);
        }

        closeModal();
        loadContents();

    } catch (e) {
        alert("Hata: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

const deleteContent = async (id) => {
    if (confirm("Bu içeriği silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "contents", id));
        loadContents();
    }
};

const editContent = async (id) => {
    const docSnap = await getDoc(doc(db, "contents", id));
    if (docSnap.exists()) openModal(docSnap.data().type, 'edit', { id: docSnap.id, ...docSnap.data() });
};

function bindEvents() {
    const searchInput = document.getElementById('topicSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const val = e.target.value.toLowerCase();
            document.querySelectorAll('.topic-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                const isMatch = text.includes(val);
                el.style.display = isMatch ? 'flex' : 'none';
                // Eğer alt başlıksa ve eşleşiyorsa üst başlığı da açmak gerekebilir ama basit tutuyoruz.
            });
        });
    }
}

// Window Objesine Bağlama
window.ContentManager = {
    openModal,
    closeModal,
    saveContent,
    deleteContent,
    editContent,
    addQuestion,
    removeQuestion,
    updateQuestion
};