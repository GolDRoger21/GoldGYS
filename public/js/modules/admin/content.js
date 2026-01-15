import { db } from "../../firebase-config.js";
import {
    collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global State
let state = {
    currentTopicId: null,
    currentSubTopicId: null,
    editingContentId: null,
    topicsMap: {},
    contentItems: [],
    contentFilters: {
        search: '',
        type: 'all',
        sort: 'order-asc'
    },
    // Quiz Builder State
    quizQuestions: []
};

// ==========================================
// 1. INITIALIZATION & LAYOUT
// ==========================================

export async function initContentPage() {
    console.log("🚀 İçerik Yönetim Modülü Başlatılıyor...");
    const container = document.getElementById('section-content');

    // Load Partial
    try {
        const response = await fetch('../partials/admin/content-manager.html');
        if (!response.ok) throw new Error("Partial yüklenemedi");
        const html = await response.text();
        container.innerHTML = html;

        // Initialize
        bindEvents();
        loadTopics();
    } catch (e) {
        console.error("Content partial load error:", e);
        container.innerHTML = `<div class="alert alert-danger">Modül yüklenirken hata oluştu: ${e.message}</div>`;
    }
}

function bindEvents() {
    const searchInput = document.getElementById('topicSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const val = e.target.value.toLowerCase();
            document.querySelectorAll('.topic-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                const isMatch = text.includes(val);
                el.parentElement.style.display = isMatch ? 'block' : 'none';
                // Note: This simple filter might need refinement for nested structure
            });
        });
    }

    // Content Toolbar Events
    const contentSearch = document.getElementById('contentSearchInput');
    if (contentSearch) {
        contentSearch.addEventListener('input', (e) => {
            state.contentFilters.search = e.target.value;
            renderContentList();
        });
    }

    const sortSelect = document.getElementById('contentSortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            state.contentFilters.sort = e.target.value;
            renderContentList();
        });
    }

    const refreshButton = document.getElementById('contentRefreshBtn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            loadContents();
        });
    }

    // Summary Statistics Filter
    const summary = document.getElementById('contentSummary');
    if (summary) {
        summary.addEventListener('click', (event) => {
            const button = event.target.closest('.stat-item');
            if (!button) return;

            // Remove active from all
            summary.querySelectorAll('.stat-item').forEach(el => el.classList.remove('active'));
            button.classList.add('active');

            state.contentFilters.type = button.dataset.type || 'all';
            renderContentList();
        });
    }
}


// ==========================================
// 2. DATA MANAGEMENT (TOPICS & CONTENT)
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
        groupHeader.className = 'topic-group-header';
        groupHeader.innerText = group.title;
        listContainer.appendChild(groupHeader);

        group.items.forEach(topic => {
            // Topic Container
            const topicEl = document.createElement('div');

            // Main Topic Item
            const mainItem = document.createElement('div');
            mainItem.className = 'topic-item';
            mainItem.innerHTML = `
                <i class="bi bi-folder2 me-2 opacity-75"></i>
                <span class="text-truncate">${topic.title}</span>
                ${topic.subTopics ? '<i class="bi bi-chevron-down ms-auto small opacity-50"></i>' : ''}
            `;
            mainItem.onclick = () => selectTopic(topic.id, null, mainItem);
            topicEl.appendChild(mainItem);

            // Subtopics
            if (topic.subTopics && topic.subTopics.length > 0) {
                const subWrapper = document.createElement('div');
                subWrapper.className = 'subtopic-wrapper';

                topic.subTopics.forEach(sub => {
                    const subItem = document.createElement('div');
                    subItem.className = 'topic-item sub-topic';
                    subItem.innerHTML = `<i class="bi bi-dot me-1"></i> ${sub.title}`;
                    subItem.onclick = (e) => {
                        e.stopPropagation();
                        selectTopic(topic.id, sub.id, subItem);
                    };
                    subWrapper.appendChild(subItem);
                });

                topicEl.appendChild(subWrapper);
            }

            listContainer.appendChild(topicEl);
        });
    });
}

function selectTopic(topicId, subTopicId, element) {
    // UI Update
    document.querySelectorAll('.topic-item').forEach(e => e.classList.remove('active'));
    element.classList.add('active');

    state.currentTopicId = topicId;
    state.currentSubTopicId = subTopicId;

    const topic = state.topicsMap[topicId];
    const subTitle = subTopicId ? topic.subTopics.find(s => s.id === subTopicId)?.title : 'Genel Konu İçerikleri';

    document.getElementById('headerTitle').innerText = topic.title;
    document.getElementById('headerSubTitle').innerText = subTitle;
    document.getElementById('headerCategoryBadge').innerText = topic.category === 'ortak' ? 'Ortak Konu' : 'Alan Bilgisi';

    // Show Panel
    document.getElementById('emptyState').classList.add('d-none');

    const panel = document.getElementById('contentPanel');
    panel.classList.remove('d-none');
    panel.classList.add('d-flex');

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

        state.contentItems = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        updateContentSummary(state.contentItems);
        renderContentList();

    } catch (error) {
        console.error(error);
        workspace.innerHTML = `<div class="alert alert-warning">Veriler yüklenirken hata oluştu. Lütfen ilgili index'i oluşturduğunuzdan emin olun.<br><small>${error.message}</small></div>`;
    }
}

function renderContentList() {
    const workspace = document.getElementById('contentWorkspace');
    const items = applyContentFilters(state.contentItems);

    document.getElementById('contentCountBadge').innerText = `${items.length} İçerik`;

    if (items.length === 0) {
        workspace.innerHTML = `
            <div class="text-center py-5 text-muted opacity-50">
                <i class="bi bi-inbox fs-1"></i>
                <p class="mt-2">İçerik bulunamadı.</p>
            </div>`;
        return;
    }

    let html = '<div class="d-flex flex-column gap-3">';
    items.forEach(item => {
        html += createContentCard(item.id, item);
    });
    html += '</div>';
    workspace.innerHTML = html;
}

function applyContentFilters(items) {
    const searchTerm = state.contentFilters.search.trim().toLowerCase();
    const typeFilter = state.contentFilters.type;

    let filtered = items.filter(item => {
        const matchesType = typeFilter === 'all' ? true : item.type === typeFilter;
        if (!matchesType) return false;

        if (!searchTerm) return true;
        const haystack = `${item.title || ''} ${item.data?.url || ''} ${item.data?.content || ''}`.toLowerCase();
        return haystack.includes(searchTerm);
    });

    const sortKey = state.contentFilters.sort;
    filtered = filtered.sort((a, b) => {
        if (sortKey === 'order-asc') return (a.order || 0) - (b.order || 0);
        if (sortKey === 'order-desc') return (b.order || 0) - (a.order || 0);
        const dateA = getContentTimestamp(a);
        const dateB = getContentTimestamp(b);
        if (sortKey === 'date-new') return dateB - dateA;
        if (sortKey === 'date-old') return dateA - dateB;
        return 0;
    });

    return filtered;
}

function updateContentSummary(items) {
    const counts = {
        total: items.length,
        video: 0,
        pdf: 0,
        html: 0,
        quiz: 0
    };

    items.forEach(item => {
        if (counts[item.type] !== undefined) counts[item.type] += 1;
    });

    document.getElementById('contentTotalCount').innerText = counts.total;
    document.getElementById('contentVideoCount').innerText = counts.video;
    document.getElementById('contentPdfCount').innerText = counts.pdf;
    document.getElementById('contentHtmlCount').innerText = counts.html;
    document.getElementById('contentQuizCount').innerText = counts.quiz;
}

function getContentTimestamp(item) {
    const created = item.createdAt?.seconds ? item.createdAt.seconds * 1000 : 0;
    const updated = item.updatedAt?.seconds ? item.updatedAt.seconds * 1000 : 0;
    return Math.max(created, updated, 0);
}

function createContentCard(id, item) {
    let icon = 'bi-file-earmark';
    let typeClass = 'type-other';
    let metaInfo = '';

    switch (item.type) {
        case 'video': icon = 'bi-youtube text-danger'; typeClass = 'type-video'; break;
        case 'pdf': icon = 'bi-file-earmark-pdf-fill text-warning'; typeClass = 'type-pdf'; break;
        case 'quiz':
            icon = 'bi-ui-check text-primary';
            typeClass = 'type-quiz';
            metaInfo = `<span class="badge bg-dark border border-secondary text-white ms-2"><i class="bi bi-list-check"></i> ${item.data.questionCount || 0} Soru</span>`;
            break;
        case 'html': icon = 'bi-file-text-fill text-success'; typeClass = 'type-html'; break;
    }

    // Date
    const dateValue = getContentTimestamp(item);
    const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString('tr-TR') : '-';

    return `
        <div class="content-card p-3 d-flex align-items-center justify-content-between ${typeClass}">
            <div class="d-flex align-items-center gap-3">
                <div class="order-badge text-muted fw-bold">${item.order}</div>
                <div class="icon-box fs-3 ${icon}"></div>
                <div>
                    <h6 class="mb-1 text-white fw-bold">${item.title}</h6>
                    <div class="d-flex align-items-center gap-2 small text-muted">
                        <span class="text-uppercase">${item.type}</span>
                        <span>•</span>
                        <span>${dateLabel}</span>
                        ${metaInfo ? `<span>•</span> ${metaInfo}` : ''}
                    </div>
                </div>
            </div>
            
            <div class="action-group">
                <button class="btn btn-sm btn-icon-only text-secondary" onclick="window.ContentManager.editContent('${id}')" title="Düzenle">
                    <i class="bi bi-pencil-square fs-6"></i>
                </button>
                 <button class="btn btn-sm btn-icon-only text-danger" onclick="window.ContentManager.deleteContent('${id}')" title="Sil">
                    <i class="bi bi-trash fs-6"></i>
                </button>
            </div>
        </div>
    `;
}

// ==========================================
// 3. EDITOR & QUESTION BUILDER
// ==========================================

const openModal = (type, mode = 'create', existingData = null) => {
    if (mode === 'create' && !state.currentTopicId) {
        alert("Lütfen önce listeden bir konu seçiniz.");
        return;
    }

    const modal = document.getElementById('contentModal');
    const editorWorkspace = document.getElementById('editorWorkspace');
    const quizWrapper = document.getElementById('quizBuilderWrapper');
    const metaFields = document.getElementById('metaDynamicFields');

    // Reset Fields
    document.getElementById('inpContentType').value = type;
    document.getElementById('inpTitle').value = '';
    document.getElementById('inpOrder').value = state.contentItems.length + 1;
    editorWorkspace.innerHTML = '';
    metaFields.innerHTML = '';

    // Show Modal
    modal.classList.add('active'); // CSS ile gösterilecek (dsplay:none -> flex)
    modal.style.display = 'flex';

    // Set Title
    const titleAction = mode === 'create' ? 'Yeni Ekle' : 'Düzenle';
    document.getElementById('modalTitle').innerText = `${titleAction}: ${type.toUpperCase()}`;

    // Helper: Initial Value
    const getVal = (field) => existingData?.data?.[field] || '';

    // Load Data if editing
    if (mode === 'edit' && existingData) {
        state.editingContentId = existingData.id;
        document.getElementById('inpTitle').value = existingData.title;
        document.getElementById('inpOrder').value = existingData.order;
    } else {
        state.editingContentId = null;
    }


    // --- QUIZ LOGIC INTERCEPTION ---
    if (type === 'quiz') {
        quizWrapper.classList.remove('d-none');
        editorWorkspace.classList.add('d-none');

        state.quizQuestions = existingData?.data?.questions || [];
        renderQuizBuilder();
        return;
    } else {
        quizWrapper.classList.add('d-none');
        editorWorkspace.classList.remove('d-none');
    }

    // Standard Content Types
    let html = '';

    if (type === 'video') {
        html = `
            <div class="bg-dark-subtle p-4 rounded border border-secondary mb-3">
                <label class="form-label text-white fw-bold"><i class="bi bi-youtube me-2"></i>Video URL / Embed Linki</label>
                <input type="text" id="inpDataMain" class="form-control bg-black text-white border-secondary" placeholder="https://www.youtube.com/embed/..." value="${getVal('url')}">
                <div class="form-text text-muted">Youtube videosunun "Embed/Yerleştir" kodundaki src linkini veya doğrudan video linkini yapıştırın.</div>
            </div>
            <div class="ratio ratio-16x9 bg-black border border-secondary rounded d-flex align-items-center justify-content-center text-muted">
                <div id="videoPreviewPlaceholder">Önizleme alanı</div>
                <iframe id="videoPreviewFrame" src="" class="d-none" allowfullscreen></iframe>
            </div>`;
    }
    else if (type === 'pdf') {
        html = `
            <div class="bg-dark-subtle p-4 rounded border border-secondary mb-3">
                <label class="form-label text-white fw-bold"><i class="bi bi-file-earmark-pdf me-2"></i>PDF Dosya Linki</label>
                <input type="text" id="inpDataMain" class="form-control bg-black text-white border-secondary" placeholder="https://firebasestorage.googleapis.com/..." value="${getVal('url')}">
            </div>`;
    }
    else if (type === 'html') {
        html = `
            <div class="d-flex flex-column h-100">
                <label class="form-label text-white fw-bold mb-2"><i class="bi bi-code-square me-2"></i>HTML İçerik Editörü</label>
                <textarea id="inpDataMain" class="form-control bg-black text-white border-secondary font-monospace flex-grow-1 p-3" style="min-height: 400px; line-height: 1.5;">${getVal('content')}</textarea>
            </div>`;
    }

    editorWorkspace.innerHTML = html;
};

// --- QUIZ BUILDER FUNCTIONS ---

function renderQuizBuilder() {
    const list = document.getElementById('quizQuestionsList');
    list.innerHTML = '';

    if (state.quizQuestions.length === 0) {
        list.innerHTML = `
            <div class="text-center py-5 border border-secondary border-dashed rounded opacity-50 select-none">
                <i class="bi bi-patch-question fs-1 mb-3 d-block"></i>
                <h5 class="fw-bold">Hiç soru yok</h5>
                <p>Yukarıdaki "Soru Ekle" butonu ile başlayın.</p>
            </div>`;
        return;
    }

    state.quizQuestions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'qb-question-card bg-dark-subtle p-3 rounded border border-secondary position-relative';

        // Question Header
        item.innerHTML = `
            <div class="d-flex justify-content-between mb-3">
                <div class="badge bg-gold text-dark fs-6 rounded-circle d-flex align-items-center justify-content-center" style="width:32px; height:32px;">${idx + 1}</div>
                <button class="btn btn-sm btn-outline-danger border-0" onclick="window.ContentManager.removeQuestion(${idx})"><i class="bi bi-trash"></i></button>
            </div>
            
            <div class="mb-3">
                <textarea class="form-control bg-black text-white border-secondary" rows="2" placeholder="Soru metni buraya..." onchange="window.ContentManager.updateQuestion(${idx}, 'text', this.value)">${q.text || ''}</textarea>
            </div>

            <div class="row g-2 mb-3">
                ${['A', 'B', 'C', 'D', 'E'].map(opt => `
                    <div class="col-6">
                        <div class="input-group input-group-sm">
                            <div class="input-group-text bg-dark border-secondary">
                                <input class="form-check-input mt-0" type="radio" name="qCorrect-${idx}" ${q.correct === opt ? 'checked' : ''} onchange="window.ContentManager.updateQuestion(${idx}, 'correct', '${opt}')">
                            </div>
                            <span class="input-group-text bg-dark border-secondary text-muted text-uppercase fw-bold" style="width: 30px; justify-content:center;">${opt}</span>
                            <input type="text" class="form-control bg-black text-white border-secondary" value="${q.options?.[opt] || ''}" onchange="window.ContentManager.updateQuestion(${idx}, 'opt-${opt}', this.value)">
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="">
                <input type="text" class="form-control form-control-sm bg-black text-white border-secondary text-muted fst-italic" placeholder="Çözüm / Açıklama (Opsiyonel)" value="${q.solution || ''}" onchange="window.ContentManager.updateQuestion(${idx}, 'solution', this.value)">
            </div>
        `;
        list.appendChild(item);
    });
}

function addQuestion() {
    state.quizQuestions.push({
        text: '',
        options: { A: '', B: '', C: '', D: '', E: '' },
        correct: 'A',
        solution: ''
    });
    renderQuizBuilder();
    // Scroll to bottom
    const list = document.getElementById('quizQuestionsList');
    list.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
}

function removeQuestion(index) {
    if (confirm('Bu soruyu silmek istediğinize emin misiniz?')) {
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
        const key = field.split('-')[1];
        if (!q.options) q.options = {};
        q.options[key] = value;
    }
}

// ==========================================
// 4. PERSISTENCE
// ==========================================

const saveContent = async () => {
    const btn = document.getElementById('btnSave');
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Kaydediliyor...';

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

            // Validate
            state.quizQuestions.forEach((q, i) => {
                if (!q.text) throw new Error(`${i + 1}. Soru metni boş olamaz.`);
            });

            payload.data = {
                questions: state.quizQuestions,
                questionCount: state.quizQuestions.length,
                quizId: state.editingContentId || 'new'
            };
        } else {
            const dataMain = document.getElementById('inpDataMain').value;
            if (type === 'html') payload.data = { content: dataMain };
            else payload.data = { url: dataMain }; // Video or PDF
        }

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
        btn.innerHTML = originalContent;
    }
};

const deleteContent = async (id) => {
    if (confirm("Bu içerik kalıcı olarak silinecek. Emin misiniz?")) {
        try {
            await deleteDoc(doc(db, "contents", id));
            loadContents(); // Refresh list
        } catch (e) {
            alert("Silme başarısız: " + e.message);
        }
    }
};

const editContent = async (id) => {
    try {
        const ref = doc(db, "contents", id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            openModal(snap.data().type, 'edit', { id: snap.id, ...snap.data() });
        }
    } catch (e) {
        console.error(e);
    }
};

const closeModal = () => {
    const modal = document.getElementById('contentModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
};


// Public API
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
