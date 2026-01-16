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
    contentItems: [],
    contentFilters: { search: '', type: 'all', sort: 'order-asc' },
    quizQuestions: [],
    quillInstance: null // Quill editör referansı
};

// ==========================================
// 1. BAŞLATMA
// ==========================================

export async function initContentPage() {
    console.log("🚀 İçerik Yönetim Modülü Başlatılıyor (Template Sürümü)...");
    const container = document.getElementById('section-content');

    try {
        const response = await fetch('../partials/admin/content-manager.html');
        if (!response.ok) throw new Error("HTML yüklenemedi");
        container.innerHTML = await response.text();

        bindEvents();
        loadTopics();
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert alert-danger">Hata: ${e.message}</div>`;
    }
}

function bindEvents() {
    // Arama Kutusu
    const searchInput = document.getElementById('topicSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const val = e.target.value.toLowerCase();
            document.querySelectorAll('.topic-item').forEach(el => {
                el.style.display = el.innerText.toLowerCase().includes(val) ? 'flex' : 'none';
            });
        });
    }

    // Filtreler
    document.getElementById('contentSearchInput')?.addEventListener('input', (e) => {
        state.contentFilters.search = e.target.value;
        renderContentList();
    });
}

// ==========================================
// 2. KONU YÖNETİMİ
// ==========================================

async function loadTopics() {
    const listContainer = document.getElementById('topicTreeList');
    try {
        const q = query(collection(db, "topics"), orderBy("order"));
        const snapshot = await getDocs(q);

        state.topicsMap = {};
        let topics = [];
        snapshot.forEach(doc => {
            state.topicsMap[doc.id] = { id: doc.id, ...doc.data() };
            topics.push(state.topicsMap[doc.id]);
        });

        renderTopicTree(topics);
    } catch (e) {
        listContainer.innerHTML = `<div class="text-danger p-3">Konular yüklenemedi.</div>`;
    }
}

function renderTopicTree(topics) {
    const listContainer = document.getElementById('topicTreeList');
    listContainer.innerHTML = '';

    topics.forEach(topic => {
        const topicEl = document.createElement('div');

        // Ana Konu
        const mainItem = document.createElement('div');
        mainItem.className = 'topic-item p-2 d-flex align-items-center cursor-pointer hover-bg-dark rounded';
        mainItem.innerHTML = `<i class="bi bi-folder2 text-gold me-2"></i><span class="text-white flex-grow-1">${topic.title}</span>`;
        mainItem.onclick = () => selectTopic(topic.id, null, mainItem);
        topicEl.appendChild(mainItem);

        // Alt Konular
        if (topic.subTopics) {
            const subWrapper = document.createElement('div');
            subWrapper.className = 'ms-4 border-start border-secondary ps-2';
            topic.subTopics.forEach(sub => {
                const subItem = document.createElement('div');
                subItem.className = 'topic-item sub-topic p-1 text-muted small cursor-pointer hover-text-white';
                subItem.innerText = sub.title;
                subItem.onclick = (e) => { e.stopPropagation(); selectTopic(topic.id, sub.id, subItem); };
                subWrapper.appendChild(subItem);
            });
            topicEl.appendChild(subWrapper);
        }
        listContainer.appendChild(topicEl);
    });
}

function selectTopic(topicId, subTopicId, element) {
    document.querySelectorAll('.topic-item').forEach(e => e.classList.remove('bg-dark-subtle')); // Basit active class
    if (element) element.classList.add('bg-dark-subtle');

    state.currentTopicId = topicId;
    state.currentSubTopicId = subTopicId;

    const topic = state.topicsMap[topicId];
    document.getElementById('headerTitle').innerText = topic.title;
    document.getElementById('headerSubTitle').innerText = subTopicId ? 'Alt Konu Seçildi' : 'Ana Konu';

    // Yeni Ekle Butonunu Aç
    const btnNew = document.getElementById('btnNewContent');
    btnNew.disabled = false;
    btnNew.innerHTML = `<i class="bi bi-plus-lg me-1"></i>Yeni Ekle`;

    loadContents();
}

// ==========================================
// 3. İÇERİK LİSTELEME (TEMPLATE KULLANIMI)
// ==========================================

async function loadContents() {
    const workspace = document.getElementById('contentWorkspace');
    workspace.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-gold"></div></div>';

    let constraints = [
        where("topicId", "==", state.currentTopicId),
        orderBy("order", "asc")
    ];
    if (state.currentSubTopicId) constraints.splice(1, 0, where("subTopicId", "==", state.currentSubTopicId));

    try {
        const q = query(collection(db, "contents"), ...constraints);
        const snapshot = await getDocs(q);
        state.contentItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderContentList();
    } catch (e) {
        console.error(e);
        workspace.innerHTML = '<div class="text-danger text-center">İçerikler yüklenemedi.</div>';
    }
}

function renderContentList() {
    const workspace = document.getElementById('contentWorkspace');
    const template = document.getElementById('tpl-content-card'); // Şablonu al

    workspace.innerHTML = '';

    // Filtreleme mantığı (Basitleştirilmiş)
    let items = state.contentItems.filter(i =>
        i.title.toLowerCase().includes(state.contentFilters.search.toLowerCase())
    );

    if (items.length === 0) {
        workspace.innerHTML = '<div class="text-center text-muted mt-5">İçerik bulunamadı.</div>';
        return;
    }

    items.forEach(item => {
        const clone = template.content.cloneNode(true); // Şablonu kopyala

        // Verileri doldur
        clone.querySelector('.content-order').innerText = item.order;
        clone.querySelector('.content-title').innerText = item.title;
        clone.querySelector('.content-type-badge').innerText = item.type;

        // İkona karar ver
        const iconBox = clone.querySelector('.content-icon i');
        if (item.type === 'video') { iconBox.classList.add('bi-youtube', 'text-danger'); }
        else if (item.type === 'pdf') { iconBox.classList.add('bi-file-earmark-pdf', 'text-warning'); }
        else if (item.type === 'html') { iconBox.classList.add('bi-file-text', 'text-success'); }
        else { iconBox.classList.add('bi-ui-checks', 'text-primary'); }

        // Butonlara event bağla
        clone.querySelector('.btn-edit').onclick = () => editContent(item);
        clone.querySelector('.btn-delete').onclick = () => deleteContent(item.id);

        workspace.appendChild(clone); // Ekrana ekle
    });
}

// ==========================================
// 4. EDİTÖR YÖNETİMİ (QUILL & QUIZ)
// ==========================================

const openEditor = (type, mode = 'create', existingData = null) => {
    if (mode === 'create' && !state.currentTopicId) return alert("Lütfen önce bir konu seçin.");

    const editorView = document.getElementById('contentManagerEditorView');
    editorView.classList.remove('d-none'); // Full ekran aç

    // Formu Sıfırla
    document.getElementById('inpContentType').value = type;
    document.getElementById('inpTitle').value = existingData ? existingData.title : '';
    document.getElementById('inpOrder').value = existingData ? existingData.order : (state.contentItems.length + 1);
    document.getElementById('editorModeBadge').innerText = mode === 'create' ? 'YENİ' : 'DÜZENLEME';

    state.editingContentId = existingData ? existingData.id : null;

    // Alanları Gizle/Göster
    const stdArea = document.getElementById('standardEditorArea');
    const htmlArea = document.getElementById('htmlEditorArea');
    const quizArea = document.getElementById('quizBuilderArea');

    stdArea.innerHTML = '';
    stdArea.classList.add('d-none');
    htmlArea.classList.add('d-none');
    quizArea.classList.add('d-none');

    // Tipe Göre Ayarla
    if (type === 'html') {
        htmlArea.classList.remove('d-none');
        initQuill(); // Editörü başlat
        state.quillInstance.root.innerHTML = existingData?.data?.content || '';
    }
    else if (type === 'quiz') {
        quizArea.classList.remove('d-none');
        state.quizQuestions = existingData?.data?.questions || [];
        renderQuizBuilder();
    }
    else {
        // Video veya PDF
        stdArea.classList.remove('d-none');
        const val = existingData?.data?.url || '';
        stdArea.innerHTML = `
            <div class="card bg-dark border-secondary mb-4">
                <div class="card-body p-4">
                    <label class="form-label text-gold fw-bold">URL / LINK</label>
                    <input type="text" id="inpDataMain" class="form-control bg-black text-white border-secondary" value="${val}" placeholder="https://...">
                </div>
            </div>`;
    }
};

const closeEditor = () => {
    document.getElementById('contentManagerEditorView').classList.add('d-none');
};

// --- QUILL EDITÖR KURULUMU ---
function initQuill() {
    if (state.quillInstance) return; // Zaten varsa tekrar kurma

    state.quillInstance = new Quill('#quillEditorContainer', {
        theme: 'snow',
        placeholder: 'Ders içeriğini buraya yazın, görsel ekleyin, düzenleyin...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image', 'video'],
                ['clean']
            ]
        }
    });
}

// --- QUIZ BUILDER (TEMPLATE ILE) ---
function renderQuizBuilder() {
    const list = document.getElementById('quizQuestionsList');
    const template = document.getElementById('tpl-quiz-question-card');

    list.innerHTML = '';
    document.getElementById('qbQuestionCount').innerText = state.quizQuestions.length;

    state.quizQuestions.forEach((q, idx) => {
        const clone = template.content.cloneNode(true);

        // Başlıklar
        clone.querySelector('.q-number').innerText = idx + 1;
        clone.querySelector('.q-preview-text').innerText = q.text || 'Metin girilmedi...';

        // Inputlar
        const txtInput = clone.querySelector('.q-text-input');
        txtInput.value = q.text || '';
        txtInput.onchange = (e) => { q.text = e.target.value; renderQuizBuilder(); }; // Basit re-render

        const solInput = clone.querySelector('.q-solution-input');
        solInput.value = q.solution || '';
        solInput.onchange = (e) => { q.solution = e.target.value; };

        // Şıkları Döngüyle Oluştur
        const optsArea = clone.querySelector('.q-options-area');
        ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
            const div = document.createElement('div');
            div.className = 'col-md-6';
            const isChecked = q.correct === opt ? 'checked' : '';
            div.innerHTML = `
                <div class="input-group input-group-sm">
                    <div class="input-group-text bg-dark border-secondary">
                        <input class="form-check-input mt-0" type="radio" name="correct-${idx}" ${isChecked} onchange="window.ContentManager.setCorrect(${idx}, '${opt}')">
                        <span class="ms-2 fw-bold text-white">${opt}</span>
                    </div>
                    <input type="text" class="form-control bg-black text-white border-secondary" value="${q.options?.[opt] || ''}" onchange="window.ContentManager.setOption(${idx}, '${opt}', this.value)">
                </div>`;
            optsArea.appendChild(div);
        });

        // Silme Butonu
        clone.querySelector('.btn-delete-q').onclick = () => removeQuestion(idx);

        list.appendChild(clone);
    });
}

// --- KAYDETME ---
const saveContent = async () => {
    const btn = document.getElementById('btnSaveEditor');
    const originalText = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = 'Kaydediliyor...';

    try {
        const type = document.getElementById('inpContentType').value;
        const title = document.getElementById('inpTitle').value;
        const order = Number(document.getElementById('inpOrder').value);

        if (!title) throw new Error("Başlık giriniz.");

        let payload = {
            topicId: state.currentTopicId,
            subTopicId: state.currentSubTopicId,
            type, title, order,
            updatedAt: serverTimestamp()
        };

        // Veriyi Hazırla
        if (type === 'html') {
            payload.data = { content: state.quillInstance.root.innerHTML };
        } else if (type === 'quiz') {
            payload.data = { questions: state.quizQuestions, questionCount: state.quizQuestions.length };
        } else {
            payload.data = { url: document.getElementById('inpDataMain').value };
        }

        if (state.editingContentId) {
            await updateDoc(doc(db, "contents", state.editingContentId), payload);
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "contents"), payload);
        }

        closeEditor();
        loadContents();
        alert("Başarıyla kaydedildi!");

    } catch (e) {
        alert("Hata: " + e.message);
    } finally {
        btn.disabled = false; btn.innerHTML = originalText;
    }
};

// --- YARDIMCI FONKSİYONLAR (GLOBAL ERİŞİM İÇİN) ---
window.ContentManager = {
    openEditor,
    closeEditor,
    saveContent,
    editContent: (item) => openEditor(item.type, 'edit', item),
    deleteContent: async (id) => { if (confirm('Silinsin mi?')) { await deleteDoc(doc(db, "contents", id)); loadContents(); } },
    addQuestion: () => { state.quizQuestions.push({ text: '', options: {}, correct: 'A' }); renderQuizBuilder(); },
    removeQuestion: (idx) => { state.quizQuestions.splice(idx, 1); renderQuizBuilder(); },
    setCorrect: (idx, val) => { state.quizQuestions[idx].correct = val; },
    setOption: (idx, opt, val) => { if (!state.quizQuestions[idx].options) state.quizQuestions[idx].options = {}; state.quizQuestions[idx].options[opt] = val; }
};
