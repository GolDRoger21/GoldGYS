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
    contentFilters: { search: '', type: 'all', sort: 'order-asc' },
    quizQuestions: [], // Test sorularını geçici tutar
    quillInstance: null // Editör referansı
};

// ==========================================
// 1. BAŞLATMA (INIT)
// ==========================================

export async function initContentPage() {
    console.log("🚀 İçerik Yönetimi Modülü Yükleniyor...");
    const container = document.getElementById('section-content');

    try {
        // HTML Şablonunu Yükle (Absolute Path)
        const response = await fetch('/public/partials/admin/content-manager.html');
        
        // Eğer /public/ ile bulamazsa (Firebase serve yapısına göre) bir de kökten deneyelim
        if (!response.ok) {
            const fallbackResponse = await fetch('/partials/admin/content-manager.html');
            if(!fallbackResponse.ok) throw new Error("HTML Şablonu yüklenemedi.");
            container.innerHTML = await fallbackResponse.text();
        } else {
            container.innerHTML = await response.text();
        }

        // Olay Dinleyicilerini Başlat
        bindEvents();
        
        // Konu Ağacını Çek
        await loadTopics();

        console.log("✅ İçerik Yönetimi Hazır.");
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert alert-danger m-4">Modül yükleme hatası: ${e.message}</div>`;
    }
}

function bindEvents() {
    // Konu Arama
    const topicSearch = document.getElementById('topicSearch');
    if (topicSearch) {
        topicSearch.addEventListener('keyup', (e) => {
            const val = e.target.value.toLowerCase();
            document.querySelectorAll('.topic-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(val) ? 'flex' : 'none';
            });
        });
    }

    // İçerik Arama ve Filtreleme
    const contentSearch = document.getElementById('contentSearchInput');
    if (contentSearch) {
        contentSearch.addEventListener('input', (e) => {
            state.contentFilters.search = e.target.value;
            renderContentList();
        });
    }
}

// ==========================================
// 2. KONU YÖNETİMİ (SOL PANEL)
// ==========================================

async function loadTopics() {
    const listContainer = document.getElementById('topicTreeList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="text-center mt-4"><div class="spinner-border text-gold spinner-border-sm"></div></div>';

    try {
        const q = query(collection(db, "topics"), orderBy("order"));
        const snapshot = await getDocs(q);

        state.topicsMap = {};
        let topics = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            state.topicsMap[doc.id] = { id: doc.id, ...data };
            topics.push(state.topicsMap[doc.id]);
        });

        renderTopicTree(topics);
    } catch (e) {
        console.error(e);
        listContainer.innerHTML = `<div class="text-danger p-2 small">Konular yüklenemedi.</div>`;
    }
}

function renderTopicTree(topics) {
    const listContainer = document.getElementById('topicTreeList');
    listContainer.innerHTML = '';

    if (topics.length === 0) {
        listContainer.innerHTML = '<div class="text-muted text-center p-3 small">Henüz konu eklenmemiş.</div>';
        return;
    }

    topics.forEach(topic => {
        const wrapper = document.createElement('div');
        
        // Ana Konu Satırı
        const mainItem = document.createElement('div');
        mainItem.className = 'topic-item';
        mainItem.innerHTML = `<i class="bi bi-folder2 text-gold me-2"></i><span>${topic.title}</span>`;
        mainItem.onclick = () => selectTopic(topic.id, null, mainItem);
        wrapper.appendChild(mainItem);

        // Alt Konular (Varsa)
        if (topic.subTopics && Array.isArray(topic.subTopics)) {
            const subWrapper = document.createElement('div');
            // CSS zaten indentation hallediyor
            
            topic.subTopics.forEach(sub => {
                const subItem = document.createElement('div');
                subItem.className = 'topic-item sub-topic';
                subItem.innerHTML = `<i class="bi bi-arrow-return-right me-2 opacity-50"></i>${sub.title}`;
                subItem.onclick = (e) => { 
                    e.stopPropagation(); 
                    selectTopic(topic.id, sub.id, subItem); 
                };
                wrapper.appendChild(subItem);
            });
        }
        listContainer.appendChild(wrapper);
    });
}

function selectTopic(topicId, subTopicId, element) {
    // Görsel Seçim (Active State)
    document.querySelectorAll('.topic-item').forEach(e => e.classList.remove('active'));
    if (element) element.classList.add('active');

    state.currentTopicId = topicId;
    state.currentSubTopicId = subTopicId;

    // Header Güncelleme
    const topic = state.topicsMap[topicId];
    if(topic) {
        document.getElementById('headerTitle').innerText = topic.title;
        document.getElementById('headerSubTitle').innerText = subTopicId ? 'Alt Konu Seçildi' : 'Ana Konu';
    }

    // "Yeni Ekle" Butonunu Aktif Et
    const btnNew = document.getElementById('btnNewContent');
    if(btnNew) {
        btnNew.disabled = false;
        // Butonu vurgula
        btnNew.classList.add('btn-gold'); 
    }

    loadContents();
}

// ==========================================
// 3. İÇERİK LİSTELEME (ORTA PANEL)
// ==========================================

async function loadContents() {
    const workspace = document.getElementById('contentWorkspace');
    workspace.innerHTML = '<div class="d-flex justify-content-center pt-5"><div class="spinner-border text-gold"></div></div>';

    try {
        // Sorgu Oluştur
        let constraints = [
            where("topicId", "==", state.currentTopicId),
            orderBy("order", "asc")
        ];
        
        // Alt konu seçiliyse filtreye ekle
        if (state.currentSubTopicId) {
            constraints.splice(1, 0, where("subTopicId", "==", state.currentSubTopicId));
        }

        const q = query(collection(db, "contents"), ...constraints);
        const snapshot = await getDocs(q);
        
        state.contentItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderContentList();

    } catch (e) {
        console.error("İçerik yükleme hatası:", e);
        // Index hatası varsa konsola linki basar
        workspace.innerHTML = `<div class="text-danger text-center p-4">İçerikler yüklenemedi.<br><small>${e.message}</small></div>`;
    }
}

function renderContentList() {
    const workspace = document.getElementById('contentWorkspace');
    const template = document.getElementById('tpl-content-card');
    
    workspace.innerHTML = '';

    // İstemci Tarafı Arama Filtresi
    const filterText = state.contentFilters.search.toLowerCase();
    const items = state.contentItems.filter(i => 
        i.title.toLowerCase().includes(filterText)
    );

    if (items.length === 0) {
        workspace.innerHTML = `
            <div class="h-100 d-flex flex-column align-items-center justify-content-center text-muted opacity-50">
                <i class="bi bi-inbox display-1 mb-3"></i>
                <p>Bu başlık altında içerik yok.</p>
            </div>`;
        return;
    }

    items.forEach(item => {
        // Template Clone
        const clone = template.content.cloneNode(true);
        
        // Verileri Doldur
        clone.querySelector('.content-order').innerText = item.order || '-';
        clone.querySelector('.content-title').innerText = item.title;
        clone.querySelector('.content-type-badge').innerText = item.type ? item.type.toUpperCase() : 'Diğer';
        
        // Tarih Formatı
        let dateStr = "";
        if(item.updatedAt && item.updatedAt.toDate) {
            dateStr = item.updatedAt.toDate().toLocaleDateString('tr-TR');
        }
        clone.querySelector('.content-date').innerText = dateStr;

        // İkon Seçimi
        const iconBox = clone.querySelector('.content-icon i');
        iconBox.className = 'bi'; // Reset
        switch(item.type) {
            case 'video': iconBox.classList.add('bi-play-circle-fill', 'text-danger'); break;
            case 'pdf': iconBox.classList.add('bi-file-earmark-pdf-fill', 'text-warning'); break;
            case 'html': iconBox.classList.add('bi-file-richtext-fill', 'text-success'); break;
            case 'quiz': iconBox.classList.add('bi-ui-checks', 'text-primary'); break;
            default: iconBox.classList.add('bi-file-earmark');
        }

        // Buton Eventleri
        clone.querySelector('.btn-edit').onclick = () => openEditor(item.type, 'edit', item);
        clone.querySelector('.btn-delete').onclick = () => deleteContent(item.id);

        workspace.appendChild(clone);
    });
}

// ==========================================
// 4. EDİTÖR YÖNETİMİ (SAĞ/MODAL PANEL)
// ==========================================

const openEditor = (type, mode = 'create', existingData = null) => {
    // Eğer yeni kayıt ise ve konu seçilmediyse uyar
    if (mode === 'create' && !state.currentTopicId) {
        alert("Lütfen önce sol menüden bir konu seçiniz.");
        return;
    }

    const editorEl = document.getElementById('contentManagerEditorView');
    editorEl.classList.remove('d-none'); // Modalı Aç

    // Form Değerlerini Hazırla
    document.getElementById('inpContentType').value = type;
    document.getElementById('editorModeBadge').innerText = mode === 'create' ? 'YENİ İÇERİK' : 'İÇERİK DÜZENLEME';
    document.getElementById('editorTitle').innerText = mode === 'create' ? `${type.toUpperCase()} Ekle` : 'İçeriği Düzenle';

    document.getElementById('inpTitle').value = existingData ? existingData.title : '';
    document.getElementById('inpOrder').value = existingData ? existingData.order : (state.contentItems.length + 1);
    
    // Duration alanı opsiyonel
    const durEl = document.getElementById('inpDuration');
    if(durEl) durEl.value = existingData?.duration || '';

    state.editingContentId = existingData ? existingData.id : null;

    // Alanları Temizle ve Gizle
    const stdArea = document.getElementById('standardEditorArea');
    const htmlArea = document.getElementById('htmlEditorArea');
    const quizArea = document.getElementById('quizBuilderArea');
    
    stdArea.innerHTML = ''; 
    stdArea.classList.add('d-none');
    htmlArea.classList.add('d-none');
    quizArea.classList.add('d-none');

    // Tipe Göre Alan Göster
    if (type === 'html') {
        htmlArea.classList.remove('d-none');
        initQuill();
        // Editör içeriğini ayarla
        if (state.quillInstance) {
            state.quillInstance.root.innerHTML = existingData?.data?.content || '';
        }
    } 
    else if (type === 'quiz') {
        quizArea.classList.remove('d-none');
        state.quizQuestions = existingData?.data?.questions || [];
        renderQuizBuilder();
    } 
    else {
        // Video, PDF, Link
        stdArea.classList.remove('d-none');
        const val = existingData?.data?.url || '';
        // NOT: Tema uyumu için "bg-black" yerine "form-control" kullanıyoruz.
        // admin.css içinde form-control rengi değişkene bağlandı.
        stdArea.innerHTML = `
            <div class="card admin-card mb-4">
                <div class="card-body p-4">
                    <label class="form-label text-gold fw-bold">DOSYA URL / VIDEO LINK</label>
                    <input type="text" id="inpDataMain" class="form-control form-control-lg" 
                           value="${val}" placeholder="https://...">
                    <div class="form-text text-muted">YouTube linki veya PDF dosya yolu yapıştırın.</div>
                </div>
            </div>`;
    }
};

const closeEditor = () => {
    document.getElementById('contentManagerEditorView').classList.add('d-none');
};

// --- QUILL EDITÖR BAŞLATICI ---
function initQuill() {
    if (state.quillInstance) return; // Zaten varsa tekrar kurma
    
    // Quill global window nesnesinde mi kontrol et
    if (typeof Quill === 'undefined') {
        alert("Editör kütüphanesi yüklenemedi. Lütfen sayfayı yenileyin.");
        return;
    }

    state.quillInstance = new Quill('#quillEditorContainer', {
        theme: 'snow',
        placeholder: 'Ders notlarını buraya giriniz...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'image', 'video', 'blockquote', 'code-block'],
                ['clean']
            ]
        }
    });
}

// --- QUIZ SORU YÖNETİCİSİ ---
function renderQuizBuilder() {
    const list = document.getElementById('quizQuestionsList');
    const template = document.getElementById('tpl-quiz-question-card');
    
    if(!list || !template) return;

    list.innerHTML = '';
    const qCountEl = document.getElementById('qbQuestionCount');
    if(qCountEl) qCountEl.innerText = state.quizQuestions.length;

    state.quizQuestions.forEach((q, idx) => {
        const clone = template.content.cloneNode(true);
        
        clone.querySelector('.q-number').innerText = idx + 1;
        clone.querySelector('.q-preview-text').innerText = q.text ? q.text.substring(0, 50) + '...' : 'Yeni Soru';

        // Soru Metni
        const txtInput = clone.querySelector('.q-text-input');
        txtInput.value = q.text || '';
        txtInput.onchange = (e) => { q.text = e.target.value; renderQuizBuilder(); };

        // Çözüm
        const solInput = clone.querySelector('.q-solution-input');
        solInput.value = q.solution || '';
        solInput.onchange = (e) => { q.solution = e.target.value; };

        // Şıklar (HTML içinde CSS classlarına dikkat)
        const optsArea = clone.querySelector('.q-options-area');
        ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
            const div = document.createElement('div');
            div.className = 'col-md-6 mb-2';
            const isChecked = q.correct === opt ? 'checked' : '';
            
            // Burada tema uyumu için input-group-text ve form-control kullanıyoruz.
            // admin.css bu sınıfları renklendiriyor.
            div.innerHTML = `
                <div class="input-group input-group-sm">
                    <div class="input-group-text">
                        <input class="form-check-input mt-0" type="radio" name="correct-${idx}" ${isChecked} 
                               onchange="window.ContentManager.setCorrect(${idx}, '${opt}')">
                        <span class="ms-2 fw-bold">${opt}</span>
                    </div>
                    <input type="text" class="form-control" 
                           value="${q.options?.[opt] || ''}" 
                           onchange="window.ContentManager.setOption(${idx}, '${opt}', this.value)">
                </div>`;
            optsArea.appendChild(div);
        });

        // Silme
        clone.querySelector('.btn-delete-q').onclick = () => removeQuestion(idx);

        list.appendChild(clone);
    });
}

// --- KAYDETME İŞLEMİ ---
const saveContent = async () => {
    const btn = document.getElementById('btnSaveEditor');
    const originalText = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Kaydediliyor...';

    try {
        const type = document.getElementById('inpContentType').value;
        const title = document.getElementById('inpTitle').value;
        const order = Number(document.getElementById('inpOrder').value);
        const durationInput = document.getElementById('inpDuration');
        const duration = durationInput ? Number(durationInput.value) : 0;

        if(!title) throw new Error("Lütfen bir başlık giriniz.");

        // Temel Payload
        let payload = {
            topicId: state.currentTopicId,
            subTopicId: state.currentSubTopicId,
            type, 
            title, 
            order,
            duration,
            updatedAt: serverTimestamp()
        };

        // Tip Özel Veriler
        if (type === 'html') {
            if(!state.quillInstance) throw new Error("Editör başlatılamadı.");
            payload.data = { content: state.quillInstance.root.innerHTML };
        } 
        else if (type === 'quiz') {
            payload.data = { 
                questions: state.quizQuestions, 
                questionCount: state.quizQuestions.length 
            };
        } 
        else {
            const urlInput = document.getElementById('inpDataMain');
            if(!urlInput || !urlInput.value) throw new Error("Lütfen URL giriniz.");
            payload.data = { url: urlInput.value };
        }

        // Firestore İşlemi
        if (state.editingContentId) {
            await updateDoc(doc(db, "contents", state.editingContentId), payload);
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "contents"), payload);
        }

        closeEditor();
        loadContents(); // Listeyi yenile
        alert("İçerik başarıyla kaydedildi!");

    } catch (e) {
        alert("Hata: " + e.message);
        console.error(e);
    } finally {
        btn.disabled = false; 
        btn.innerHTML = originalText;
    }
};

// --- YARDIMCI FONKSİYONLAR (Global Scope Erişimi İçin) ---
// HTML'deki onclick="..." attributeleri modül içindeki fonksiyonları göremez.
// Bu yüzden window nesnesine bağlıyoruz.

async function deleteContent(id) {
    if(confirm('Bu içeriği kalıcı olarak silmek istiyor musunuz?')) { 
        try {
            await deleteDoc(doc(db, "contents", id)); 
            loadContents(); 
        } catch(e) {
            alert("Silme hatası: " + e.message);
        }
    } 
}

function removeQuestion(idx) {
    if(confirm('Bu soruyu silmek istediğinize emin misiniz?')) {
        state.quizQuestions.splice(idx, 1); 
        renderQuizBuilder(); 
    }
}

window.ContentManager = {
    openEditor,
    closeEditor,
    saveContent,
    addQuestion: () => { 
        state.quizQuestions.push({text:'', options:{}, correct:'A'}); 
        renderQuizBuilder(); 
    },
    removeQuestion,
    setCorrect: (idx, val) => { state.quizQuestions[idx].correct = val; },
    setOption: (idx, opt, val) => { 
        if(!state.quizQuestions[idx].options) state.quizQuestions[idx].options={}; 
        state.quizQuestions[idx].options[opt] = val; 
    },
    deleteContent
};