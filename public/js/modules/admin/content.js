import { db } from "../../firebase-config.js";
import { 
    collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global State
let state = {
    currentTopicId: null,
    currentSubTopicId: null,
    editingContentId: null,
    topicsMap: {}
};

// Başlatıcı Fonksiyon
export async function initContentPage() {
    console.log("🚀 İçerik Yönetim Modülü (MVC) Başlatılıyor...");
    const container = document.getElementById('section-content');
    
    // 1. Şablonu Yükle
    try {
        const response = await fetch('/partials/admin/content-manager.html');
        if (!response.ok) throw new Error("Şablon yüklenemedi.");
        const html = await response.text();
        container.innerHTML = html;
        
        // 2. Event Listener'ları Tanımla (Search vb.)
        bindEvents();

        // 3. Verileri Çek
        loadTopics();

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert alert-danger">Modül yüklenirken hata oluştu: ${e.message}</div>`;
    }
}

// ==========================================
// 1. VERİ YÖNETİMİ & LİSTELEME
// ==========================================

async function loadTopics() {
    const listContainer = document.getElementById('topicTreeList');
    
    try {
        const q = query(collection(db, "topics"), orderBy("order"));
        const snapshot = await getDocs(q);
        
        state.topicsMap = {}; // Reset
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

    // Kategorilere Ayır
    const groups = {
        'ortak': { title: 'ORTAK KONULAR', items: [] },
        'alan': { title: 'ALAN BİLGİSİ', items: [] }
    };

    topics.forEach(t => {
        if(groups[t.category]) groups[t.category].items.push(t);
    });

    // Listeyi Oluştur
    Object.values(groups).forEach(group => {
        if(group.items.length === 0) return;

        const groupHeader = document.createElement('div');
        groupHeader.className = 'small fw-bold text-uppercase text-muted mt-3 mb-2 px-2';
        groupHeader.innerText = group.title;
        listContainer.appendChild(groupHeader);

        group.items.forEach(topic => {
            // Ana Konu
            const el = document.createElement('div');
            el.className = 'topic-item d-flex justify-content-between align-items-center';
            el.innerHTML = `<span>${topic.title}</span> ${topic.subTopics ? '<i class="bi bi-chevron-down small opacity-50"></i>' : ''}`;
            el.onclick = () => selectTopic(topic.id, null, el);
            listContainer.appendChild(el);

            // Alt Konular
            if (topic.subTopics && topic.subTopics.length > 0) {
                const subWrapper = document.createElement('div');
                topic.subTopics.forEach(sub => {
                    const subEl = document.createElement('div');
                    subEl.className = 'topic-item sub-topic';
                    subEl.innerHTML = `<i class="bi bi-arrow-return-right me-1 opacity-50"></i> ${sub.title}`;
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
    // UI Güncelleme
    document.querySelectorAll('.topic-item').forEach(e => e.classList.remove('active'));
    element.classList.add('active');

    // State Güncelleme
    state.currentTopicId = topicId;
    state.currentSubTopicId = subTopicId;

    // Başlıkları Güncelle
    const topic = state.topicsMap[topicId];
    const subTitle = subTopicId ? topic.subTopics.find(s => s.id === subTopicId)?.title : 'Genel İçerikler';

    document.getElementById('headerTitle').innerText = topic.title;
    document.getElementById('headerSubTitle').innerText = subTitle;
    document.getElementById('headerCategoryBadge').innerText = topic.category === 'ortak' ? 'Ortak Konu' : 'Alan Bilgisi';

    // Panelleri Değiştir
    document.getElementById('emptyState').classList.add('d-none');
    document.getElementById('contentPanel').classList.remove('d-none');
    document.getElementById('contentPanel').classList.add('d-flex');

    loadContents();
}

async function loadContents() {
    const workspace = document.getElementById('contentWorkspace');
    workspace.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

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
                    <i class="bi bi-inbox fs-1 opacity-50"></i>
                    <p class="mt-2">Bu bölümde henüz içerik yok.</p>
                </div>`;
            return;
        }

        let html = '<div class="d-flex flex-column gap-3">';
        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            html += createContentCard(docSnap.id, item);
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

    switch(item.type) {
        case 'video': icon = 'bi-play-circle-fill text-danger'; typeClass = 'type-video'; break;
        case 'pdf': icon = 'bi-file-earmark-pdf-fill text-danger'; typeClass = 'type-pdf'; break;
        case 'quiz': 
            icon = 'bi-patch-question-fill text-primary'; 
            typeClass = 'type-quiz'; 
            metaInfo = `<span class="badge bg-light text-dark border ms-2"><i class="bi bi-list-check"></i> ${item.data.questionCount || 0} Soru</span>`;
            break;
        case 'html': icon = 'bi-file-text-fill text-success'; typeClass = 'type-html'; break;
        case 'podcast': icon = 'bi-mic-fill text-warning'; typeClass = 'type-podcast'; break;
    }

    return `
        <div class="content-card ${typeClass} p-3 d-flex align-items-center justify-content-between shadow-sm">
            <div class="d-flex align-items-center">
                <div class="me-3 fw-bold text-muted opacity-50 fs-5" style="width:30px;">${item.order}</div>
                <div class="me-3 fs-3 ${icon}"></div>
                <div>
                    <h6 class="mb-0 fw-bold text-dark">${item.title}</h6>
                    <div class="small text-muted">
                        ${item.type.toUpperCase()} 
                        ${metaInfo}
                        <span class="ms-2 opacity-50">• ${new Date(item.createdAt?.seconds * 1000).toLocaleDateString('tr-TR')}</span>
                    </div>
                </div>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-light border" onclick="window.ContentManager.editContent('${id}')" title="Düzenle">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-light border text-danger" onclick="window.ContentManager.deleteContent('${id}')" title="Sil">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// ==========================================
// 2. MODAL & FORM İŞLEMLERİ
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
        document.getElementById('btnSave').innerHTML = 'Güncelle';
        titleInp.value = existingData.title;
        orderInp.value = existingData.order;
    } else {
        state.editingContentId = null;
        document.getElementById('modalTitle').innerText = `Yeni ${type === 'quiz' ? 'Test' : type.toUpperCase()} Ekle`;
        document.getElementById('btnSave').innerHTML = 'Kaydet';
        titleInp.value = '';
        orderInp.value = document.querySelectorAll('.content-card').length + 1;
    }

    // Dinamik İçerik Alanları
    let html = '';
    const val = existingData ? (existingData.data.url || existingData.data.content || '') : '';

    if (type === 'video') {
        html = `
            <label class="form-label fw-bold">Video Embed Kodu / URL</label>
            <input type="text" id="inpDataMain" class="form-control" placeholder="https://youtube.com/embed/..." value="${val}">
            <div class="form-text">Youtube videosuna sağ tıklayıp 'Embed Kodu'nu alarak yapıştırın.</div>`;
    } else if (type === 'pdf') {
        html = `
            <label class="form-label fw-bold">PDF Dosya Linki</label>
            <input type="text" id="inpDataMain" class="form-control" placeholder="https://firebasestorage..." value="${val}">`;
    } else if (type === 'html') {
        html = `
            <label class="form-label fw-bold">Ders Notu (HTML)</label>
            <textarea id="inpDataMain" class="form-control font-monospace" rows="10" placeholder="<p>İçerik...</p>">${val}</textarea>`;
    } else if (type === 'quiz') {
        if (mode === 'edit') {
            html = `
                <div class="alert alert-warning small"><i class="bi bi-info-circle"></i> Sadece başlığı güncellemek için burayı boş bırakın. Soruları değiştirmek için yeni JSON yapıştırın.</div>
                <textarea id="inpDataMain" class="form-control font-monospace" rows="5" placeholder="Yeni JSON Verisi..."></textarea>`;
        } else {
            html = `
                <div class="alert alert-info small border-info bg-info-subtle">
                    <strong>Test Ekleme:</strong> Hazırladığınız JSON formatındaki soruları aşağıya yapıştırın. Sistem otomatik olarak soru bankasına ve konuya ekleyecektir.
                </div>
                <label class="form-label fw-bold">Soru Listesi (JSON)</label>
                <textarea id="inpDataMain" class="form-control font-monospace" rows="10" placeholder='[{"text":"Soru...","options":{...},"correct":"A","solution":"..."}]'></textarea>`;
        }
    }
    container.innerHTML = html;
};

const closeModal = () => {
    document.getElementById('contentModal').style.display = 'none';
};

const saveContent = async () => {
    const btn = document.getElementById('btnSave');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
        const type = document.getElementById('inpContentType').value;
        const title = document.getElementById('inpTitle').value;
        const order = Number(document.getElementById('inpOrder').value);
        const dataMain = document.getElementById('inpDataMain').value;

        if (!title) throw new Error("Başlık alanı zorunludur.");

        let payload = {
            topicId: state.currentTopicId,
            subTopicId: state.currentSubTopicId,
            type, title, order,
            updatedAt: serverTimestamp()
        };

        // İçerik İşleme
        if (type === 'quiz') {
            if (dataMain.trim().length > 0) {
                const questions = JSON.parse(dataMain);
                if (!Array.isArray(questions)) throw new Error("JSON formatı hatalı.");

                // 1. Soruları Bankaya Ekle
                const batch = writeBatch(db);
                const qPromises = questions.map(q => addDoc(collection(db, "questions"), {
                    ...q, topicId: state.currentTopicId, isActive: true, createdAt: serverTimestamp()
                }));
                await Promise.all(qPromises);

                // 2. Paket Oluştur
                const quizRef = await addDoc(collection(db, "quizzes"), {
                    title, questions, type: 'subject_test', createdAt: serverTimestamp()
                });

                payload.data = { quizId: quizRef.id, questionCount: questions.length };
            } else if (!state.editingContentId) {
                throw new Error("Test verisi (JSON) girilmedi.");
            }
        } else {
            // Diğer türler (Video, PDF, HTML)
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
    if(confirm("Bu içeriği silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "contents", id));
        loadContents();
    }
};

const editContent = async (id) => {
    const docSnap = await getDoc(doc(db, "contents", id));
    if(docSnap.exists()) openModal(docSnap.data().type, 'edit', { id: docSnap.id, ...docSnap.data() });
};

// GLOBAL EVENT BAĞLAMA (HTML'den erişim için)
function bindEvents() {
    const searchInput = document.getElementById('topicSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const val = e.target.value.toLowerCase();
            document.querySelectorAll('.topic-item').forEach(el => {
                el.style.display = el.innerText.toLowerCase().includes(val) ? 'flex' : 'none';
            });
        });
    }
}

// Window Objesine Bağlama (OnClick Handlerlar İçin)
window.ContentManager = {
    openModal,
    closeModal,
    saveContent,
    deleteContent,
    editContent
};