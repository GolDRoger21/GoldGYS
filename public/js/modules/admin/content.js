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
    console.log("🚀 İçerik Yönetim Modülü Başlatılıyor (Revamped)...");
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
    // Topic Search
    const searchInput = document.getElementById('topicSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const val = e.target.value.toLowerCase();
            document.querySelectorAll('.topic-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                const isMatch = text.includes(val);
                el.style.display = isMatch ? 'flex' : 'none';
                // If it's a subtopic and matches, show parent wrapper?
                // For simplicity, just exact match hiding
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

    const refreshButton = document.getElementById('btnRefresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            // Add spinning animation
            refreshButton.querySelector('i').classList.add('bi-spin');
            loadContents().finally(() => refreshButton.querySelector('i').classList.remove('bi-spin'));
        });
    }

    // Summary Statistics Filter
    const summary = document.getElementById('contentSummary');
    if (summary) {
        summary.addEventListener('click', (event) => {
            const button = event.target.closest('.stat-card');
            if (!button) return;

            // Remove active from all
            summary.querySelectorAll('.stat-card').forEach(el => el.classList.remove('active'));
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
    // Keep spinner if initial load

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
            mainItem.dataset.id = topic.id;
            mainItem.innerHTML = `
                <i class="bi bi-folder2 me-2 opacity-75"></i>
                <span class="text-truncate flex-grow-1">${topic.title}</span>
                ${topic.subTopics ? '<i class="bi bi-chevron-down ms-autosmall opacity-50" style="font-size: 0.7em;"></i>' : ''}
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
                    subItem.dataset.id = sub.id;
                    subItem.dataset.parentId = topic.id;
                    subItem.innerHTML = `<i class="bi bi-arrow-return-right me-2 opacity-50"></i> ${sub.title}`;
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
    document.getElementById('headerSubTitle').innerText = `${topic.id} / ${subTitle}`;
    document.getElementById('headerCategoryBadge').innerText = topic.category === 'ortak' ? 'Ortak Konu' : 'Alan Bilgisi';

    // Show Panel
    document.getElementById('emptyState').classList.add('d-none');
    document.getElementById('emptyState').classList.remove('d-flex');

    const panel = document.getElementById('contentPanel');
    panel.classList.remove('d-none');
    panel.classList.add('d-flex');

    loadContents();
}

async function loadContents() {
    const workspace = document.getElementById('contentWorkspace');
    workspace.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-gold"></div></div>';

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
        workspace.innerHTML = `<div class="alert alert-warning">Veriler yüklenirken hata oluştu.<br><small>${error.message}</small></div>`;
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
                <p class="mt-2">Bu filtreye uygun içerik bulunamadı.</p>
            </div>`;
        return;
    }

    let html = '<div class="d-flex flex-column gap-2">';
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
    const counts = { total: items.length, video: 0, pdf: 0, html: 0, quiz: 0 };
    items.forEach(item => { if (counts[item.type] !== undefined) counts[item.type] += 1; });

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
    let typeClass = 'text-muted';
    let metaInfo = '';

    switch (item.type) {
        case 'video': icon = 'bi-youtube'; typeClass = 'text-danger'; break;
        case 'pdf': icon = 'bi-file-earmark-pdf-fill'; typeClass = 'text-warning'; break;
        case 'quiz':
            icon = 'bi-ui-check';
            typeClass = 'text-primary';
            metaInfo = `<span class="badge bg-dark border border-secondary text-muted ms-2 rounded-pill"><i class="bi bi-list-check me-1"></i>${item.data.questionCount || 0}</span>`;
            break;
        case 'html': icon = 'bi-file-text-fill'; typeClass = 'text-success'; break;
    }

    const dateLabel = getContentTimestamp(item) ? new Date(getContentTimestamp(item)).toLocaleDateString('tr-TR') : '-';

    return `
        <div class="content-card-item">
            <div class="d-flex align-items-center gap-3">
                <div class="badge bg-dark border border-secondary text-muted" style="width: 32px;">${item.order}</div>
                <div class="icon-box fs-4 ${typeClass}"><i class="bi ${icon}"></i></div>
                <div>
                    <h6 class="mb-1 text-white fw-bold">${item.title}</h6>
                    <div class="d-flex align-items-center gap-2 small text-muted">
                        <span class="text-uppercase fw-bold" style="font-size: 0.7rem;">${item.type}</span>
                        <span>•</span>
                        <span>${dateLabel}</span>
                        ${metaInfo}
                    </div>
                </div>
            </div>
            
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-icon btn-dark border-secondary text-white" onclick="window.ContentManager.editContent('${id}')" title="Düzenle">
                    <i class="bi bi-pencil-square"></i>
                </button>
                 <button class="btn btn-sm btn-icon btn-dark border-secondary text-danger" onclick="window.ContentManager.deleteContent('${id}')" title="Sil">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// ==========================================
// 3. EDITOR & QUESTION BUILDER (Full SCreen)
// ==========================================

const openEditor = (type, mode = 'create', existingData = null) => {
    if (mode === 'create' && !state.currentTopicId) {
        alert("Lütfen önce listeden bir konu seçiniz.");
        return;
    }

    const editorView = document.getElementById('contentManagerEditorView');
    const listView = document.getElementById('contentManagerListView');

    // Toggle Views
    // We keep list view in DOM but hide it visually or via d-none? 
    // The CSS for editor-modal is fixed full screen, so just showing it is enough.
    editorView.classList.remove('d-none');
    editorView.classList.add('d-flex');

    // Reset Fields
    document.getElementById('inpContentType').value = type;
    document.getElementById('inpTitle').value = '';
    document.getElementById('inpOrder').value = state.contentItems.length + 1;
    document.getElementById('metaDynamicFields').innerHTML = '';

    const editorWorkspace = document.getElementById('standardEditorArea');
    const quizWrapper = document.getElementById('quizBuilderArea');

    // Set Header Info
    const badge = document.getElementById('editorModeBadge');
    badge.innerText = mode === 'create' ? 'YENİ EKLE' : 'DÜZENLE';
    badge.className = mode === 'create' ? 'badge bg-gold text-dark fw-bold' : 'badge bg-info text-dark fw-bold';

    document.getElementById('editorTitle').innerText = `${type.toUpperCase()} - ${state.topicsMap[state.currentTopicId]?.title || ''}`;

    state.editingContentId = (mode === 'edit' && existingData) ? existingData.id : null;
    if (state.editingContentId) {
        document.getElementById('inpTitle').value = existingData.title;
        document.getElementById('inpOrder').value = existingData.order;
    }

    // Helper: Initial Value
    const getVal = (field) => existingData?.data?.[field] || '';

    // Logic Switch
    if (type === 'quiz') {
        quizWrapper.classList.remove('d-none');
        editorWorkspace.classList.add('d-none');
        state.quizQuestions = existingData?.data?.questions || [];
        renderQuizBuilder();
    } else {
        quizWrapper.classList.add('d-none');
        editorWorkspace.classList.remove('d-none');

        let html = '';
        if (type === 'video') {
            html = `
                <div class="card bg-dark border-secondary mb-4">
                    <div class="card-body p-4">
                        <label class="form-label text-gold fw-bold mb-3"><i class="bi bi-youtube me-2"></i>Video Bağlantısı</label>
                        <input type="text" id="inpDataMain" class="form-control bg-black text-white border-secondary p-3" 
                            placeholder="https://www.youtube.com/embed/..." value="${getVal('url')}">
                        <div class="form-text text-muted mt-2">Youtube videosunun Embed linkini veya normal linkini yapıştırabilirsiniz.</div>
                    </div>
                </div>
            `;
        } else if (type === 'pdf') {
            html = `
                <div class="card bg-dark border-secondary mb-4">
                    <div class="card-body p-4">
                        <label class="form-label text-gold fw-bold mb-3"><i class="bi bi-file-earmark-pdf me-2"></i>PDF Dosya URL</label>
                        <input type="text" id="inpDataMain" class="form-control bg-black text-white border-secondary p-3" 
                            placeholder="https://firebasestorage.googleapis.com/..." value="${getVal('url')}">
                    </div>
                </div>
            `;
        } else if (type === 'html') {
            html = `
                <div class="d-flex flex-column h-100">
                    <label class="form-label text-gold fw-bold mb-3"><i class="bi bi-code-square me-2"></i>HTML İçerik</label>
                    <textarea id="inpDataMain" class="form-control bg-black text-white border-secondary font-monospace p-3 flex-grow-1" 
                        style="min-height: 500px;">${getVal('content')}</textarea>
                </div>
            `;
        }
        editorWorkspace.innerHTML = html;
    }
};

const closeEditor = () => {
    if (confirm('Kaydedilmemiş değişiklikler kaybolabilir. Çıkmak istediğinize emin misiniz?')) {
        const editorView = document.getElementById('contentManagerEditorView');
        editorView.classList.add('d-none');
        editorView.classList.remove('d-flex');
    }
};

// --- QUIZ BUILDER FUNCTIONS ---

function renderQuizBuilder() {
    const list = document.getElementById('quizQuestionsList');
    list.innerHTML = '';

    document.getElementById('qbQuestionCount').innerText = state.quizQuestions.length;

    if (state.quizQuestions.length === 0) {
        list.innerHTML = `
            <div class="text-center py-5 border border-secondary border-dashed rounded opacity-50 select-none">
                <i class="bi bi-patch-question fs-1 mb-3 d-block text-gold"></i>
                <h5 class="fw-bold">Buralar çok sessiz...</h5>
                <p>Henüz hiç soru eklenmemiş.</p>
            </div>`;
        return;
    }

    state.quizQuestions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'qb-question-card bg-dark-subtle border border-secondary rounded overflow-hidden';
        item.id = `qCard-${idx}`;

        // Header
        const header = document.createElement('div');
        header.className = 'qb-header d-flex justify-content-between align-items-center p-3 bg-dark border-bottom border-secondary';
        header.onclick = (e) => {
            if (!e.target.closest('.btn-delete')) toggleQuestionCard(idx);
        };

        const previewText = q.text ? (q.text.length > 50 ? q.text.substring(0, 50) + '...' : q.text) : 'Yeni Soru';

        header.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="badge bg-gold text-dark rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width:28px; height:28px;">${idx + 1}</div>
                <span class="fw-bold text-white text-truncate" style="max-width: 600px;">${previewText}</span>
            </div>
            <div class="d-flex align-items-center gap-2">
                <button class="btn btn-sm btn-icon-only text-danger btn-delete" onclick="window.ContentManager.removeQuestion(${idx})">
                    <i class="bi bi-trash"></i>
                </button>
                <i class="bi bi-chevron-down transition-transform text-muted" id="qIcon-${idx}"></i>
            </div>
        `;

        // Body
        const body = document.createElement('div');
        body.className = 'qb-body p-4 bg-dark';
        body.innerHTML = `
            <div class="mb-4">
                <label class="form-label text-muted small fw-bold">SORU METNİ</label>
                <textarea class="form-control bg-black text-white border-secondary p-3" rows="3" 
                    placeholder="Soru metnini buraya yazınız..." 
                    onchange="window.ContentManager.updateQuestion(${idx}, 'text', this.value)">${q.text || ''}</textarea>
            </div>

            <div class="mb-4">
                <label class="form-label text-muted small fw-bold mb-3">SEÇENEKLER & DOĞRU CEVAP</label>
                <div class="row g-3">
                    ${['A', 'B', 'C', 'D', 'E'].map(opt => `
                        <div class="col-md-6">
                            <div class="option-input-group d-flex">
                                <div class="position-relative">
                                    <input type="radio" name="qCorrect-${idx}" class="option-radio btn-check" id="radio-${idx}-${opt}" 
                                        ${q.correct === opt ? 'checked' : ''} 
                                        onchange="window.ContentManager.updateQuestion(${idx}, 'correct', '${opt}')">
                                    <label class="option-marker btn btn-outline-secondary border-end-0 rounded-start" for="radio-${idx}-${opt}">
                                        ${opt}
                                    </label>
                                </div>
                                <input type="text" class="form-control bg-black text-white border-secondary rounded-0 rounded-end" 
                                    value="${q.options?.[opt] || ''}" 
                                    placeholder="${opt} şıkkı metni"
                                    onchange="window.ContentManager.updateQuestion(${idx}, 'opt-${opt}', this.value)">
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="">
                <label class="form-label text-muted small fw-bold">ÇÖZÜM / AÇIKLAMA</label>
                <div class="input-group">
                    <span class="input-group-text bg-dark border-secondary text-success"><i class="bi bi-check-circle"></i></span>
                    <input type="text" class="form-control bg-black text-white border-secondary" 
                        placeholder="Doğru cevabın açıklaması (Öğrenci cevabı gördükten sonra çıkacak)" 
                         value="${q.solution || ''}" onchange="window.ContentManager.updateQuestion(${idx}, 'solution', this.value)">
                </div>
            </div>
        `;

        item.appendChild(header);
        item.appendChild(body);
        list.appendChild(item);
    });
}

function toggleQuestionCard(idx) {
    const card = document.getElementById(`qCard-${idx}`);
    card.classList.toggle('collapsed');
    const icon = document.getElementById(`qIcon-${idx}`);
    icon.style.transform = card.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
}

function toggleAllQuestions(expand) {
    state.quizQuestions.forEach((_, idx) => {
        const card = document.getElementById(`qCard-${idx}`);
        const icon = document.getElementById(`qIcon-${idx}`);
        if (expand) {
            card.classList.remove('collapsed');
            icon.style.transform = 'rotate(180deg)';
        } else {
            card.classList.add('collapsed');
            icon.style.transform = 'rotate(0deg)';
        }
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
    // Scroll to bottom and ensure expanded
    setTimeout(() => {
        const list = document.getElementById('quizQuestionsList');
        list.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
        // Expand the last one (it is expanded by default render)
    }, 100);
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
    const btn = document.getElementById('btnSaveEditor');
    const status = document.getElementById('saveStatusIndicator');
    const originalContent = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Kaydediliyor...';
    status.innerText = 'İşleniyor...';

    try {
        const type = document.getElementById('inpContentType').value;
        const title = document.getElementById('inpTitle').value;
        const order = Number(document.getElementById('inpOrder').value);

        if (!title) throw new Error("Başlık alanı zorunludur.");

        let payload = {
            topicId: state.currentTopicId,
            subTopicId: state.currentSubTopicId,
            topicTitle: state.topicsMap[state.currentTopicId]?.title, // Denormalize for easier search
            type, title, order,
            updatedAt: serverTimestamp()
        };

        if (type === 'quiz') {
            if (state.quizQuestions.length === 0) throw new Error("En az 1 soru eklemelisiniz.");

            // Validate
            state.quizQuestions.forEach((q, i) => {
                if (!q.text) throw new Error(`${i + 1}. Soru metni boş olamaz.`);
                if (!q.options.A || !q.options.B) throw new Error(`${i + 1}. soru için en az A ve B şıkları girilmelidir.`);
            });

            payload.data = {
                questions: state.quizQuestions,
                questionCount: state.quizQuestions.length,
            };
        } else {
            const dataMain = document.getElementById('inpDataMain').value;
            if (type === 'html') payload.data = { content: dataMain };
            else payload.data = { url: dataMain }; // Video or PDF
        }

        if (state.editingContentId) {
            await updateDoc(doc(db, "contents", state.editingContentId), payload);
            status.innerText = 'Güncellendi!';
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "contents"), payload);
            status.innerText = 'Oluşturuldu!';
        }

        // Close after short delay
        setTimeout(() => {
            const editorView = document.getElementById('contentManagerEditorView');
            editorView.classList.add('d-none');
            editorView.classList.remove('d-flex');
            loadContents();
            status.innerText = '';
        }, 1000);

    } catch (e) {
        alert("Hata: " + e.message);
        status.innerText = 'Hata oluştu!';
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
};

const deleteContent = async (id) => {
    if (confirm("Bu içerik kalıcı olarak silinecek. Emin misiniz?")) {
        try {
            await deleteDoc(doc(db, "contents", id));
            loadContents();
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
            openEditor(snap.data().type, 'edit', { id: snap.id, ...snap.data() });
        }
    } catch (e) {
        console.error(e);
        alert("İçerik yüklenirken hata oluştu.");
    }
};

// ==========================================
// 5. PUBLIC API
// ==========================================

window.ContentManager = {
    openEditor,
    closeEditor,
    saveContent,
    deleteContent,
    editContent,
    addQuestion,
    removeQuestion,
    updateQuestion,
    toggleAllQuestions
};
