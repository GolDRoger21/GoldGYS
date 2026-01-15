import { db } from "../../firebase-config.js";
import { 
    collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global Durum Yönetimi
let state = {
    currentTopicId: null,
    currentSubTopicId: null,
    editingContentId: null, // Eğer doluysa "Düzenleme Modu"ndayız demektir
    topicsMap: {} // ID -> Başlık eşleşmesi için
};

export function initContentPage() {
    console.log("🚀 Gelişmiş İçerik Yönetimi Başlatıldı");
    renderLayout();
    loadTopics();
}

// 1. ARAYÜZ İSKELETİ
function renderLayout() {
    const container = document.getElementById('section-content');
    if(!container) return;

    container.innerHTML = `
        <div class="card p-4 shadow-sm border-0">
            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                <div>
                    <h2 class="mb-1 text-primary"><i class="bi bi-collection-play"></i> Ders İçerikleri</h2>
                    <p class="text-muted small mb-0">Ders notları, videolar, testler ve podcast'leri buradan yönetin.</p>
                </div>
            </div>
            
            <div class="row g-3 mb-4 bg-light p-3 rounded align-items-end">
                <div class="col-md-5">
                    <label class="form-label fw-bold text-dark">Ana Konu</label>
                    <select id="selectTopic" class="form-select form-select-lg shadow-sm">
                        <option value="">-- Konu Seçiniz --</option>
                    </select>
                </div>
                <div class="col-md-5">
                    <label class="form-label fw-bold text-dark">Alt Başlık (Opsiyonel)</label>
                    <select id="selectSubTopic" class="form-select form-select-lg shadow-sm" disabled>
                        <option value="">-- Tümü --</option>
                    </select>
                </div>
                <div class="col-md-2 text-end">
                    <span class="badge bg-secondary" id="contentCountBadge">0 İçerik</span>
                </div>
            </div>

            <div id="actionButtons" class="mb-4 text-center" style="display:none;">
                <div class="p-3 border rounded border-dashed bg-white">
                    <h6 class="mb-3 text-muted">Bu konuya yeni içerik ekle:</h6>
                    <div class="d-flex justify-content-center gap-2 flex-wrap">
                        <button class="btn btn-outline-primary px-4" onclick="window.openModal('video')">
                            🎥 Video
                        </button>
                        <button class="btn btn-outline-danger px-4" onclick="window.openModal('pdf')">
                            📄 PDF
                        </button>
                        <button class="btn btn-outline-success px-4" onclick="window.openModal('html')">
                            📝 Not (HTML)
                        </button>
                        <button class="btn btn-outline-warning px-4" onclick="window.openModal('podcast')">
                            🎧 Podcast
                        </button>
                        <button class="btn btn-dark px-4" onclick="window.openModal('quiz')">
                            🧩 Tarama Testi
                        </button>
                    </div>
                </div>
            </div>

            <div id="contentsList" class="list-group list-group-flush">
                <div class="text-center text-muted py-5">
                    <i class="bi bi-arrow-up-circle fs-1"></i><br>
                    İçerikleri görmek için yukarıdan bir konu seçiniz.
                </div>
            </div>
        </div>

        <div id="contentModal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:10000; align-items:center; justify-content:center; overflow-y:auto;">
            <div class="modal-dialog bg-white rounded shadow-lg m-auto mt-5 mb-5" style="width:90%; max-width:800px; padding:0;">
                <div class="modal-header bg-light p-3 border-bottom d-flex justify-content-between">
                    <h5 id="modalTitle" class="mb-0 fw-bold">İçerik Ekle</h5>
                    <button type="button" class="btn-close" onclick="window.closeModal()">X</button>
                </div>
                
                <div class="modal-body p-4">
                    <input type="hidden" id="inpContentType">
                    
                    <div class="row mb-3">
                        <div class="col-md-9">
                            <label class="form-label fw-bold">Başlık <span class="text-danger">*</span></label>
                            <input type="text" id="inpTitle" class="form-control" placeholder="Örn: Ders 1 - Giriş">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label fw-bold">Sıra No</label>
                            <input type="number" id="inpOrder" class="form-control" value="1">
                        </div>
                    </div>

                    <div id="dynamicFields" class="mb-4"></div>

                    <div id="modalInfo" class="alert alert-light border small text-muted mb-3" style="display:none;"></div>

                    <div class="d-flex justify-content-end gap-2 pt-3 border-top">
                        <button onclick="window.closeModal()" class="btn btn-light border">İptal</button>
                        <button onclick="window.saveContent()" class="btn btn-success px-4 fw-bold" id="btnSave">
                            <i class="bi bi-check-lg"></i> Kaydet
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('selectTopic').addEventListener('change', handleTopicChange);
    document.getElementById('selectSubTopic').addEventListener('change', () => loadContents());
}

// 2. VERİ YÖNETİMİ
async function loadTopics() {
    const select = document.getElementById('selectTopic');
    const q = query(collection(db, "topics"), orderBy("order"));
    
    try {
        const snapshot = await getDocs(q);
        state.topicsMap = {}; // Reset

        snapshot.forEach(doc => {
            const data = doc.data();
            state.topicsMap[doc.id] = data; // Kaydet
            
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.innerText = `${data.title} (${data.category === 'ortak' ? 'Ortak' : 'Alan'})`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Konular yüklenemedi:", e);
    }
}

function handleTopicChange(e) {
    state.currentTopicId = e.target.value;
    state.currentSubTopicId = null; // Reset subtopic
    
    const subSelect = document.getElementById('selectSubTopic');
    subSelect.innerHTML = '<option value="">-- Tümü --</option>';
    
    const actionButtons = document.getElementById('actionButtons');
    
    if (state.currentTopicId) {
        subSelect.disabled = false;
        actionButtons.style.display = 'block';
        
        // Alt konuları doldur
        const topicData = state.topicsMap[state.currentTopicId];
        if (topicData && topicData.subTopics) {
            topicData.subTopics.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub.id;
                opt.innerText = sub.title;
                subSelect.appendChild(opt);
            });
        }
        loadContents();
    } else {
        subSelect.disabled = true;
        actionButtons.style.display = 'none';
        document.getElementById('contentsList').innerHTML = '<div class="text-center text-muted py-5">İçerik seçiniz.</div>';
    }
}

async function loadContents() {
    if (!state.currentTopicId) return;
    
    const subTopicVal = document.getElementById('selectSubTopic').value;
    state.currentSubTopicId = subTopicVal || null;

    const listDiv = document.getElementById('contentsList');
    const badge = document.getElementById('contentCountBadge');
    
    listDiv.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div><p>Yükleniyor...</p></div>';

    // Sorgu Oluşturma
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

        badge.innerText = `${snapshot.size} İçerik`;

        if (snapshot.empty) {
            listDiv.innerHTML = `
                <div class="alert alert-warning d-flex align-items-center" role="alert">
                    <i class="bi bi-exclamation-circle me-2"></i>
                    <div>Bu konuda henüz içerik eklenmemiş. Yukarıdaki butonları kullanarak ekleyebilirsiniz.</div>
                </div>`;
            return;
        }

        listDiv.innerHTML = '';
        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            const el = createContentItemHTML(docSnap.id, item);
            listDiv.appendChild(el);
        });

    } catch (error) {
        console.error(error);
        if(error.message.includes("index")) {
            listDiv.innerHTML = `<div class="alert alert-danger small">⚠️ <b>Performans İndeksi Gerekli:</b><br>Bu sorgu için Firebase Console'da bir Composite Index oluşturmalısınız. Konsoldaki linke tıklayın.</div>`;
        } else {
            listDiv.innerHTML = `<div class="alert alert-danger">Hata: ${error.message}</div>`;
        }
    }
}

// 3. HTML OLUŞTURUCU (Card Design)
function createContentItemHTML(id, item) {
    const div = document.createElement('div');
    div.className = 'list-group-item p-3 mb-2 border rounded shadow-sm hover-effect';
    
    // Tür Belirleme (İkon ve Renk)
    let icon = 'bi-file-earmark';
    let color = 'secondary';
    let typeText = item.type.toUpperCase();

    switch(item.type) {
        case 'video': icon = 'bi-camera-video'; color = 'primary'; break;
        case 'pdf': icon = 'bi-file-pdf'; color = 'danger'; break;
        case 'html': icon = 'bi-file-richtext'; color = 'success'; typeText = 'NOT'; break;
        case 'quiz': icon = 'bi-puzzle'; color = 'dark'; typeText = 'TEST'; break;
        case 'podcast': icon = 'bi-mic'; color = 'warning'; break;
    }

    // Quiz Detayı
    let detailText = '';
    if(item.type === 'quiz') {
        detailText = `<span class="badge bg-light text-dark border ms-2">✅ ${item.data.questionCount || 0} Soru</span>`;
    } else if (item.type === 'video') {
        detailText = `<span class="badge bg-light text-dark border ms-2">▶ Video</span>`;
    }

    div.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center">
                <div class="icon-box bg-${color} text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:45px; height:45px; font-size:1.2rem;">
                    <i class="bi ${icon}"></i>
                </div>
                <div>
                    <h5 class="mb-0 fw-bold text-dark">
                        <span class="text-muted small me-1">#${item.order}</span> ${item.title}
                    </h5>
                    <div class="small text-muted mt-1">
                        <span class="badge bg-${color} me-1">${typeText}</span>
                        <span>${item.subTopicId ? 'Alt Başlık: ' + findSubTopicName(item.subTopicId) : 'Genel'}</span>
                        ${detailText}
                    </div>
                </div>
            </div>
            <div class="btn-group">
                <button class="btn btn-outline-primary btn-sm" onclick="window.editContent('${id}')">
                    <i class="bi bi-pencil"></i> Düzenle
                </button>
                <button class="btn btn-outline-danger btn-sm" onclick="window.deleteContent('${id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `;
    return div;
}

function findSubTopicName(subId) {
    // Basit bir arama (Performans için optimize edilebilir)
    if(!state.currentTopicId) return subId;
    const topic = state.topicsMap[state.currentTopicId];
    const sub = topic.subTopics.find(s => s.id === subId);
    return sub ? sub.title : subId;
}

// 4. MODAL YÖNETİMİ (EKLEME & DÜZENLEME)
window.openModal = async (type, mode = 'create', existingData = null) => {
    const modal = document.getElementById('contentModal');
    const container = document.getElementById('dynamicFields');
    const titleInp = document.getElementById('inpTitle');
    const orderInp = document.getElementById('inpOrder');
    const typeInp = document.getElementById('inpContentType');
    const infoBox = document.getElementById('modalInfo');

    modal.style.display = 'flex';
    typeInp.value = type;
    infoBox.style.display = 'none';
    container.innerHTML = '';

    // Mod Ayarları (Ekleme vs Düzenleme)
    if (mode === 'edit' && existingData) {
        state.editingContentId = existingData.id;
        document.getElementById('modalTitle').innerText = `Düzenle: ${type.toUpperCase()}`;
        titleInp.value = existingData.title;
        orderInp.value = existingData.order;
        document.getElementById('btnSave').innerHTML = '<i class="bi bi-save"></i> Güncelle';
    } else {
        state.editingContentId = null;
        document.getElementById('modalTitle').innerText = `Yeni ${type === 'quiz' ? 'Test' : type.toUpperCase()} Ekle`;
        titleInp.value = '';
        orderInp.value = document.querySelectorAll('#contentsList .list-group-item').length + 1; // Otomatik sıra
        document.getElementById('btnSave').innerHTML = '<i class="bi bi-plus-lg"></i> Oluştur';
    }

    // Dinamik Alanlar
    if (type === 'video') {
        const val = existingData ? existingData.data.url : '';
        container.innerHTML = `
            <label class="form-label">Video Embed Kodu / URL</label>
            <input type="text" id="inpDataMain" class="form-control" placeholder="https://youtube.com/embed/..." value="${val}">
            <div class="form-text">Youtube videosuna sağ tıklayıp "Embed Kodu Kopyala" diyerek src kısmını alabilirsiniz.</div>
        `;
    } else if (type === 'pdf') {
        const val = existingData ? existingData.data.url : '';
        container.innerHTML = `
            <label class="form-label">PDF Linki (Firebase Storage URL)</label>
            <input type="text" id="inpDataMain" class="form-control" placeholder="https://firebasestorage..." value="${val}">
        `;
    } else if (type === 'html') {
        const val = existingData ? existingData.data.content : '';
        container.innerHTML = `
            <label class="form-label">HTML Ders İçeriği</label>
            <textarea id="inpDataMain" class="form-control font-monospace" rows="12" placeholder="<h1>Başlık</h1><p>İçerik...</p>">${val}</textarea>
            <div class="form-text">HTML etiketleri desteklenir.</div>
        `;
    } else if (type === 'podcast') {
        const val = existingData ? existingData.data.url : '';
        container.innerHTML = `
            <label class="form-label">Podcast Ses Dosyası URL</label>
            <input type="text" id="inpDataMain" class="form-control" placeholder="https://..." value="${val}">
        `;
    } else if (type === 'quiz') {
        // Quiz Düzenleme Modu Farklıdır
        if (mode === 'edit') {
            infoBox.style.display = 'block';
            infoBox.innerHTML = `
                <strong>ℹ️ Bilgi:</strong> Mevcut testin başlığını veya sırasını değiştirebilirsiniz. 
                Soruları değiştirmek için aşağıya YENİ bir JSON yapıştırın. Boş bırakırsanız eski sorular korunur.
            `;
            container.innerHTML = `
                <label class="form-label fw-bold">Soruları Güncelle (Opsiyonel)</label>
                <textarea id="inpDataMain" class="form-control font-monospace" rows="6" placeholder="Soruları değiştirmek istiyorsanız yeni JSON verisini buraya yapıştırın."></textarea>
            `;
        } else {
            // Yeni Quiz Ekleme
            infoBox.style.display = 'block';
            infoBox.className = 'alert alert-info border-info';
            infoBox.innerHTML = `
                <strong>📝 Nasıl Çalışır?</strong><br>
                Aşağıya hazırladığınız soruları JSON formatında yapıştırın. Sistem bu soruları otomatik olarak:
                <ul class="mb-0 ps-3 small">
                    <li>Soru Bankasına kaydeder.</li>
                    <li>Paketleyip bu konuya test olarak ekler.</li>
                </ul>
            `;
            container.innerHTML = `
                <label class="form-label fw-bold">Soru Listesi (JSON)</label>
                <textarea id="inpDataMain" class="form-control font-monospace" rows="12" placeholder='[
  {
    "text": "Soru metni...",
    "category": "CMK",
    "options": {"A":"...", "B":"..."},
    "correct": "A",
    "solution": "Çözüm..."
  }
]'></textarea>
            `;
        }
    }
};

window.closeModal = () => {
    document.getElementById('contentModal').style.display = 'none';
};

// 5. KAYDETME MANTIĞI
window.saveContent = async () => {
    const type = document.getElementById('inpContentType').value;
    const title = document.getElementById('inpTitle').value;
    const order = Number(document.getElementById('inpOrder').value);
    const dataMain = document.getElementById('inpDataMain').value; // Ana veri inputu

    if (!title) return alert("Başlık zorunludur.");
    // Quiz düzenlemede JSON boş olabilir (sadece başlık değişiyor olabilir)
    if (type !== 'quiz' && !dataMain) return alert("İçerik alanı boş olamaz."); 
    if (type === 'quiz' && !state.editingContentId && !dataMain) return alert("Test oluşturmak için JSON verisi girmelisiniz.");

    const btn = document.getElementById('btnSave');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> İşleniyor...';

    try {
        let contentPayload = {
            topicId: state.currentTopicId,
            subTopicId: state.currentSubTopicId || null,
            type: type,
            title: title,
            order: order,
            updatedAt: serverTimestamp()
        };

        // Veri Hazırlama
        if (type === 'html') {
            contentPayload.data = { content: dataMain };
        } else if (type === 'video' || type === 'pdf' || type === 'podcast') {
            contentPayload.data = { url: dataMain };
        } else if (type === 'quiz') {
            // Quiz İşlemleri (En karmaşığı)
            if (dataMain.trim().length > 0) {
                // Eğer JSON girildiyse (Yeni ekleme veya Güncelleme)
                const questions = JSON.parse(dataMain);
                if(!Array.isArray(questions)) throw new Error("JSON formatı hatalı: Bir liste [...] olmalı.");

                // A) Soruları Bankaya Ekle
                const batch = writeBatch(db);
                // (Basitlik için döngüyle ekliyoruz, batch limiti aşmamak için)
                // Gerçek projede chunking yapılabilir.
                const questionPromises = questions.map(q => {
                    return addDoc(collection(db, "questions"), {
                        ...q,
                        topicId: state.currentTopicId,
                        createdAt: serverTimestamp(),
                        isActive: true
                    });
                });
                await Promise.all(questionPromises);

                // B) Quiz Paketi Oluştur
                const quizRef = await addDoc(collection(db, "quizzes"), {
                    title: title,
                    questions: questions,
                    createdAt: serverTimestamp(),
                    type: "subject_test"
                });

                // C) Content'e bağla
                contentPayload.data = { 
                    quizId: quizRef.id, 
                    questionCount: questions.length 
                };
            } else if (state.editingContentId) {
                // Sadece başlık/sıra güncelleniyor, quiz data'sına dokunma
                // Mevcut datayı korumak için merge yapacağız, burada data alanını boş geçiyoruz.
                // updateDoc kullanacağımız için sorun yok.
            }
        }

        // Kayıt İşlemi (Ekle veya Güncelle)
        if (state.editingContentId) {
            // GÜNCELLEME
            const docRef = doc(db, "contents", state.editingContentId);
            // Eğer quiz düzenleniyor ve JSON boşsa data alanını ezmemeliyiz.
            if (type === 'quiz' && (!dataMain || dataMain.trim() === '')) {
                delete contentPayload.data; 
            }
            await updateDoc(docRef, contentPayload);
            alert("✅ İçerik güncellendi.");
        } else {
            // YENİ EKLEME
            contentPayload.createdAt = serverTimestamp();
            await addDoc(collection(db, "contents"), contentPayload);
            alert("✅ İçerik başarıyla eklendi.");
        }

        window.closeModal();
        loadContents(); // Listeyi yenile

    } catch (e) {
        console.error(e);
        alert("Hata: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// 6. SİLME VE DÜZENLEME TETİKLEYİCİLERİ
window.deleteContent = async (id) => {
    if(confirm("Bu içeriği silmek istediğinize emin misiniz? (Geri alınamaz)")) {
        try {
            await deleteDoc(doc(db, "contents", id));
            loadContents();
        } catch(e) {
            alert("Silme hatası: " + e.message);
        }
    }
};

window.editContent = async (id) => {
    // Mevcut veriyi çekip modala dolduracağız
    try {
        const docSnap = await getDoc(doc(db, "contents", id));
        if (docSnap.exists()) {
            const data = docSnap.data();
            // id'yi de objeye ekle
            window.openModal(data.type, 'edit', { id: docSnap.id, ...data });
        }
    } catch(e) {
        console.error(e);
        alert("Veri çekilemedi.");
    }
};