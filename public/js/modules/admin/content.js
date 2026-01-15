import { db } from "../../firebase-config.js";
import { 
    collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global Durum
let state = {
    currentTopicId: null,
    currentSubTopicId: null,
    editingContentId: null,
    topics: [],
    contents: []
};

export function initContentPage() {
    console.log("🚀 Pro Content Manager Başlatıldı");
    renderMainLayout();
    loadTopics();
}

// ==========================================
// 1. ANA YERLEŞİM (LAYOUT)
// ==========================================
function renderMainLayout() {
    const container = document.getElementById('section-content');
    if(!container) return;

    // CSS Reset & Custom Styles for this module
    const style = document.createElement('style');
    style.innerHTML = `
        .topic-tree-item { cursor: pointer; padding: 10px 15px; border-radius: 6px; transition: all 0.2s; font-size: 0.95rem; color: #4b5563; }
        .topic-tree-item:hover { background-color: #f3f4f6; color: #111827; }
        .topic-tree-item.active { background-color: #e0e7ff; color: #3730a3; font-weight: 600; border-left: 4px solid #3730a3; }
        .sub-topic-item { font-size: 0.9rem; padding-left: 20px; border-left: 1px solid #e5e7eb; margin-left: 10px; }
        .sub-topic-item:hover { border-left-color: #3730a3; }
        .content-card { transition: transform 0.2s, box-shadow 0.2s; border: 1px solid #e5e7eb; }
        .content-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border-color: #c7d2fe; }
        .badge-type { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .empty-state { text-align: center; padding: 3rem; color: #9ca3af; background: #f9fafb; border-radius: 12px; border: 2px dashed #e5e7eb; }
    `;
    container.appendChild(style);

    container.innerHTML += `
        <div class="d-flex h-100" style="min-height: 80vh; gap: 20px;">
            <div class="bg-white rounded-3 shadow-sm border" style="width: 320px; flex-shrink: 0; overflow: hidden; display: flex; flex-direction: column;">
                <div class="p-3 border-bottom bg-light">
                    <h5 class="mb-2 fw-bold text-dark">🗂️ Müfredat</h5>
                    <input type="text" id="topicSearch" class="form-control form-control-sm" placeholder="Konu ara..." onkeyup="window.filterTopics(this.value)">
                </div>
                <div id="topicTreeList" class="p-2 overflow-auto custom-scrollbar" style="flex: 1;">
                    <div class="text-center py-4"><div class="spinner-border spinner-border-sm text-secondary"></div></div>
                </div>
            </div>

            <div class="flex-grow-1 bg-white rounded-3 shadow-sm border d-flex flex-column">
                
                <div id="contentHeader" class="p-4 border-bottom bg-white" style="display:none;">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div>
                            <span class="badge bg-indigo-100 text-indigo-800 mb-2" id="headerCategoryBadge">Kategori</span>
                            <h2 class="mb-1 fw-bold text-dark" id="headerTitle">Konu Başlığı</h2>
                            <p class="text-muted mb-0 small" id="headerSubTitle">Alt başlık seçilmedi</p>
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-light border btn-sm" type="button" data-bs-toggle="dropdown">
                                <i class="bi bi-three-dots-vertical"></i>
                            </button>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item" href="#">Konuyu Düzenle</a></li>
                            </ul>
                        </div>
                    </div>

                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-primary btn-sm px-3 shadow-sm" onclick="window.openModal('video')">
                            <i class="bi bi-play-circle-fill me-1"></i> Video
                        </button>
                        <button class="btn btn-danger btn-sm px-3 shadow-sm" onclick="window.openModal('pdf')">
                            <i class="bi bi-file-earmark-pdf-fill me-1"></i> PDF
                        </button>
                        <button class="btn btn-success btn-sm px-3 shadow-sm" onclick="window.openModal('html')">
                            <i class="bi bi-file-earmark-richtext-fill me-1"></i> Ders Notu
                        </button>
                        <button class="btn btn-warning btn-sm px-3 shadow-sm text-dark" onclick="window.openModal('podcast')">
                            <i class="bi bi-mic-fill me-1"></i> Podcast
                        </button>
                        <div class="vr mx-1"></div>
                        <button class="btn btn-dark btn-sm px-3 shadow-sm" onclick="window.openModal('quiz')">
                            <i class="bi bi-patch-question-fill me-1"></i> <b>Konu Testi Ekle</b>
                        </button>
                    </div>
                </div>

                <div id="contentWorkspace" class="p-4 bg-light flex-grow-1 overflow-auto">
                    <div class="empty-state d-flex flex-column align-items-center justify-content-center h-100">
                        <i class="bi bi-arrow-left-circle fs-1 mb-3 text-secondary"></i>
                        <h5>Bir Konu Seçin</h5>
                        <p class="text-muted">İçerikleri yönetmek için soldaki menüden bir konu başlığına tıklayın.</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="contentModal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; align-items:center; justify-content:center;">
            <div class="modal-dialog bg-white rounded-3 shadow-lg" style="width:90%; max-width:700px; max-height:90vh; overflow-y:auto;">
                <div class="modal-header p-3 border-bottom bg-light d-flex justify-content-between align-items-center">
                    <h5 class="mb-0 fw-bold" id="modalTitle">İçerik Ekle</h5>
                    <button type="button" class="btn-close" onclick="window.closeModal()"></button>
                </div>
                <div class="modal-body p-4">
                    <input type="hidden" id="inpContentType">
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-uppercase text-muted">Başlık</label>
                        <input type="text" id="inpTitle" class="form-control" placeholder="Örn: Ders 1 - Giriş">
                    </div>
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-uppercase text-muted">Sıra No</label>
                        <input type="number" id="inpOrder" class="form-control" value="1" style="width:100px;">
                    </div>
                    <div id="dynamicFields" class="mb-4"></div>
                    <div class="d-grid">
                        <button onclick="window.saveContent()" class="btn btn-primary py-2" id="btnSave">Kaydet</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// 2. KONULARI YÜKLEME (SOL PANEL)
// ==========================================
async function loadTopics() {
    const listContainer = document.getElementById('topicTreeList');
    
    try {
        const q = query(collection(db, "topics"), orderBy("order"));
        const snapshot = await getDocs(q);
        
        state.topics = [];
        snapshot.forEach(doc => state.topics.push({ id: doc.id, ...doc.data() }));

        renderTopicTree(state.topics);

    } catch (e) {
        console.error(e);
        listContainer.innerHTML = `<div class="alert alert-danger m-2">Hata: ${e.message}</div>`;
    }
}

function renderTopicTree(topics) {
    const listContainer = document.getElementById('topicTreeList');
    listContainer.innerHTML = '';

    // Gruplama
    const groups = {
        'ortak': { title: 'ORTAK KONULAR', items: [] },
        'alan': { title: 'ALAN BİLGİSİ', items: [] }
    };

    topics.forEach(t => {
        if(groups[t.category]) groups[t.category].items.push(t);
    });

    // Render
    Object.values(groups).forEach(group => {
        if(group.items.length === 0) return;

        const groupTitle = document.createElement('div');
        groupTitle.className = 'small fw-bold text-muted mt-3 mb-2 px-2';
        groupTitle.innerText = group.title;
        listContainer.appendChild(groupTitle);

        group.items.forEach(topic => {
            // Ana Konu Öğesi
            const item = document.createElement('div');
            item.className = 'topic-tree-item';
            item.innerHTML = `<div class="d-flex align-items-center justify-content-between">
                                <span>${topic.title}</span>
                                ${topic.subTopics ? '<i class="bi bi-chevron-down small text-muted"></i>' : ''}
                              </div>`;
            
            item.onclick = (e) => selectTopic(topic.id, null, item);
            listContainer.appendChild(item);

            // Alt Konular (Varsa)
            if (topic.subTopics && topic.subTopics.length > 0) {
                const subContainer = document.createElement('div');
                subContainer.className = 'mb-1';
                subContainer.style.display = 'none'; // Başlangıçta gizli olsun mu? İsteğe bağlı. Şimdilik açık yapalım ya da tıklayınca açalım.
                // Biz açık yapalım daha kolay olsun.
                subContainer.style.display = 'block';

                topic.subTopics.forEach(sub => {
                    const subItem = document.createElement('div');
                    subItem.className = 'topic-tree-item sub-topic-item';
                    subItem.innerHTML = `<i class="bi bi-arrow-return-right me-2 text-muted small"></i> ${sub.title}`;
                    subItem.onclick = (e) => {
                        e.stopPropagation();
                        selectTopic(topic.id, sub.id, subItem);
                    };
                    subContainer.appendChild(subItem);
                });
                listContainer.appendChild(subContainer);
            }
        });
    });
}

// Filtreleme Fonksiyonu
window.filterTopics = (text) => {
    const val = text.toLowerCase();
    const items = document.querySelectorAll('.topic-tree-item');
    items.forEach(el => {
        el.style.display = el.innerText.toLowerCase().includes(val) ? 'block' : 'none';
    });
};

// ==========================================
// 3. KONU SEÇİMİ & İÇERİK YÜKLEME
// ==========================================
function selectTopic(topicId, subTopicId, domElement) {
    // UI Güncelleme (Aktif Sınıfı)
    document.querySelectorAll('.topic-tree-item').forEach(el => el.classList.remove('active'));
    domElement.classList.add('active');

    // State Güncelleme
    state.currentTopicId = topicId;
    state.currentSubTopicId = subTopicId;

    // Başlık Güncelleme
    const topic = state.topics.find(t => t.id === topicId);
    let subTitleText = "Genel";
    
    if (subTopicId && topic.subTopics) {
        const sub = topic.subTopics.find(s => s.id === subTopicId);
        if(sub) subTitleText = sub.title;
    }

    document.getElementById('contentHeader').style.display = 'block';
    document.getElementById('headerTitle').innerText = topic.title;
    document.getElementById('headerSubTitle').innerText = subTopicId ? subTitleText : 'Bu konuya ait genel içerikler';
    document.getElementById('headerCategoryBadge').innerText = topic.category === 'ortak' ? 'Ortak Konu' : 'Alan Bilgisi';

    // İçerikleri Getir
    loadContents();
}

async function loadContents() {
    const workspace = document.getElementById('contentWorkspace');
    workspace.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">İçerikler getiriliyor...</p></div>';

    // Sorgu
    let constraints = [
        where("topicId", "==", state.currentTopicId),
        orderBy("order")
    ];

    if (state.currentSubTopicId) {
        constraints.splice(1, 0, where("subTopicId", "==", state.currentSubTopicId));
    }

    try {
        const q = query(collection(db, "contents"), ...constraints);
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            workspace.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-folder2-open fs-1 text-secondary mb-3"></i>
                    <h5>Henüz İçerik Yok</h5>
                    <p>Bu başlık altında henüz ders, video veya test bulunmuyor.</p>
                    <p class="small text-muted">Yukarıdaki butonları kullanarak ekleme yapabilirsiniz.</p>
                </div>`;
            return;
        }

        // KART GÖRÜNÜMÜ OLUŞTURMA
        let html = '<div class="row g-3">';
        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            const id = docSnap.id;
            
            // Kart İkonu ve Rengi
            let icon = 'bi-file-text';
            let color = 'secondary';
            let badge = 'Diğer';

            if(item.type === 'video') { icon = 'bi-youtube'; color = 'danger'; badge='VIDEO'; }
            if(item.type === 'pdf') { icon = 'bi-file-pdf-fill'; color = 'danger'; badge='PDF'; }
            if(item.type === 'html') { icon = 'bi-file-richtext'; color = 'success'; badge='NOT'; }
            if(item.type === 'quiz') { icon = 'bi-ui-checks'; color = 'primary'; badge='TEST'; }
            if(item.type === 'podcast') { icon = 'bi-mic-fill'; color = 'warning'; badge='PODCAST'; }

            html += `
                <div class="col-md-12">
                    <div class="card content-card h-100 border-0 shadow-sm">
                        <div class="card-body d-flex align-items-center p-3">
                            <div class="me-3 text-muted fw-bold" style="width: 30px; font-size:1.1rem;">${item.order}.</div>
                            
                            <div class="rounded-3 d-flex align-items-center justify-content-center me-3" style="width: 48px; height: 48px; background-color: var(--bs-${color}-bg-subtle); color: var(--bs-${color});">
                                <i class="bi ${icon} fs-4"></i>
                            </div>

                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center mb-1">
                                    <span class="badge bg-${color} badge-type me-2">${badge}</span>
                                    <h6 class="mb-0 fw-bold text-dark text-truncate" style="max-width: 500px;">${item.title}</h6>
                                </div>
                                <small class="text-muted">
                                    ${item.type === 'quiz' ? `Soru Sayısı: <b>${item.data.questionCount}</b>` : 'Ders Materyali'}
                                    ${item.createdAt ? ' • ' + new Date(item.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : ''}
                                </small>
                            </div>

                            <div class="ms-3">
                                <button class="btn btn-light btn-sm border text-primary" onclick="window.editContent('${id}')" title="Düzenle"><i class="bi bi-pencil-fill"></i></button>
                                <button class="btn btn-light btn-sm border text-danger" onclick="window.deleteContent('${id}')" title="Sil"><i class="bi bi-trash-fill"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        workspace.innerHTML = html;

    } catch (error) {
        console.error(error);
        if(error.message.includes("index")) {
            workspace.innerHTML = `<div class="alert alert-danger">⚠️ <b>İndeks Gerekli:</b> Firebase konsolundan indeks oluşturmalısınız.<br><small>${error.message}</small></div>`;
        } else {
            workspace.innerHTML = `<div class="alert alert-danger">Hata: ${error.message}</div>`;
        }
    }
}

// ==========================================
// 4. EKLEME & DÜZENLEME (MODAL)
// ==========================================
window.openModal = (type, mode = 'create', existingData = null) => {
    // Önce konu seçili mi kontrol et
    if (mode === 'create' && !state.currentTopicId) {
        alert("Lütfen önce soldaki menüden bir konu seçiniz.");
        return;
    }

    const modal = document.getElementById('contentModal');
    const container = document.getElementById('dynamicFields');
    const titleInp = document.getElementById('inpTitle');
    const orderInp = document.getElementById('inpOrder');
    const typeInp = document.getElementById('inpContentType');

    modal.style.display = 'flex';
    typeInp.value = type;
    container.innerHTML = '';

    // Mod Ayarı
    if (mode === 'edit' && existingData) {
        state.editingContentId = existingData.id;
        document.getElementById('modalTitle').innerText = `Düzenle: ${type.toUpperCase()}`;
        titleInp.value = existingData.title;
        orderInp.value = existingData.order;
        document.getElementById('btnSave').innerText = 'Güncelle';
    } else {
        state.editingContentId = null;
        document.getElementById('modalTitle').innerText = `Yeni ${type === 'quiz' ? 'Test' : type.toUpperCase()} Ekle`;
        titleInp.value = '';
        // Otomatik sıra numarası ver (Mevcutların sayısı + 1)
        const count = document.querySelectorAll('.content-card').length;
        orderInp.value = count + 1;
        document.getElementById('btnSave').innerText = 'Kaydet';
    }

    // Dinamik Alanlar
    if (type === 'video') {
        const val = existingData ? existingData.data.url : '';
        container.innerHTML = `
            <label class="form-label fw-bold">Video Embed Kodu / Linki</label>
            <input type="text" id="inpDataMain" class="form-control" placeholder="https://youtube.com/embed/..." value="${val}">
        `;
    } else if (type === 'pdf') {
        const val = existingData ? existingData.data.url : '';
        container.innerHTML = `
            <label class="form-label fw-bold">PDF URL</label>
            <input type="text" id="inpDataMain" class="form-control" placeholder="https://firebasestorage..." value="${val}">
        `;
    } else if (type === 'html') {
        const val = existingData ? existingData.data.content : '';
        container.innerHTML = `
            <label class="form-label fw-bold">Ders Notu (HTML)</label>
            <textarea id="inpDataMain" class="form-control font-monospace" rows="10">${val}</textarea>
        `;
    } else if (type === 'quiz') {
        if (mode === 'edit') {
            container.innerHTML = `
                <div class="alert alert-warning small">
                    <i class="bi bi-info-circle"></i> Soru içeriğini güncellemek için aşağıya YENİ JSON yapıştırın. Boş bırakırsanız sadece başlık/sıra güncellenir.
                </div>
                <textarea id="inpDataMain" class="form-control font-monospace" rows="6" placeholder="JSON Verisi..."></textarea>
            `;
        } else {
            container.innerHTML = `
                <div class="alert alert-info small border-info">
                    <strong>Test Ekleme:</strong> Hazırladığınız soruları JSON formatında yapıştırın. Sistem otomatik olarak soru bankasına ekleyip bu konuya bağlayacaktır.
                </div>
                <textarea id="inpDataMain" class="form-control font-monospace" rows="10" placeholder='[{"text":"Soru...","options":{...},"correct":"A","solution":"..."}]'></textarea>
            `;
        }
    }
};

window.closeModal = () => {
    document.getElementById('contentModal').style.display = 'none';
};

window.saveContent = async () => {
    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.innerText = 'İşleniyor...';

    const type = document.getElementById('inpContentType').value;
    const title = document.getElementById('inpTitle').value;
    const order = Number(document.getElementById('inpOrder').value);
    const dataMain = document.getElementById('inpDataMain').value;

    try {
        if(!title) throw new Error("Başlık giriniz.");

        let payload = {
            topicId: state.currentTopicId,
            subTopicId: state.currentSubTopicId,
            type, title, order,
            updatedAt: serverTimestamp()
        };

        // Veri İşleme
        if (type === 'html') payload.data = { content: dataMain };
        else if (type === 'video' || type === 'pdf' || type === 'podcast') payload.data = { url: dataMain };
        else if (type === 'quiz') {
            // Quiz Logic
            if (dataMain.trim().length > 0) {
                const questions = JSON.parse(dataMain);
                if(!Array.isArray(questions)) throw new Error("JSON formatı hatalı.");

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
            } else if (state.editingContentId) {
                // Sadece başlık güncelleniyorsa data'ya dokunma
                delete payload.data;
            } else {
                throw new Error("Test verisi (JSON) girilmedi.");
            }
        }

        // Kayıt
        if (state.editingContentId) {
            await updateDoc(doc(db, "contents", state.editingContentId), payload);
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "contents"), payload);
        }

        window.closeModal();
        loadContents();
        // alert("İşlem Başarılı"); // Rahatsız etmesin diye kapattım

    } catch (e) {
        alert("Hata: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Kaydet';
    }
};

// 5. YARDIMCI İŞLEMLER
window.deleteContent = async (id) => {
    if(confirm("Silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "contents", id));
        loadContents();
    }
};

window.editContent = async (id) => {
    const docSnap = await getDoc(doc(db, "contents", id));
    if(docSnap.exists()) window.openModal(docSnap.data().type, 'edit', { id: docSnap.id, ...docSnap.data() });
};