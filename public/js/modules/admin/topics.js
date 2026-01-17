import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let modalElement = null;
let topicForm = null;
let currentLessons = []; // Alt konuları (dersleri) hafızada tutmak için

export function initTopicsPage() {
    console.log("🚀 Gelişmiş CMS Başlatılıyor...");
    renderTopicsInterface();
    loadTopics();
}

function renderTopicsInterface() {
    const container = document.getElementById('section-topics');
    if (!container) return;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Müfredat ve İçerik Yönetimi</h2>
                <p class="text-muted">Ana konuları ve alt ders içeriklerini buradan yönetin.</p>
            </div>
            <button id="btnNewTopic" class="btn btn-primary">➕ Yeni Ana Konu Ekle</button>
        </div>
        
        <div class="card mb-4">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Sıra</th>
                            <th>Konu Başlığı</th>
                            <th>Kategori</th>
                            <th>Ders Sayısı</th>
                            <th>Durum</th>
                            <th>İşlemler</th>
                        </tr>
                    </thead>
                    <tbody id="topicsTableBody">
                        <tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Gelişmiş Konu Modal -->
        <div id="topicModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 1000px; height: 95vh;">
                <div class="modal-header">
                    <h3 id="topicModalTitle">Konu Düzenle</h3>
                    <button id="btnCloseTopicModal" class="close-btn">&times;</button>
                </div>
                
                <div class="modal-body-scroll" style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    
                    <!-- SOL KOLON: Ana Konu Bilgileri -->
                    <div class="topic-meta-panel" style="border-right: 1px solid var(--border-color); padding-right: 20px;">
                        <h4 class="mb-3 text-primary">Ana Konu Bilgileri</h4>
                        <form id="topicMetaForm">
                            <input type="hidden" id="editTopicId">
                            
                            <div class="form-group">
                                <label>Konu Başlığı</label>
                                <input type="text" id="inpTopicTitle" class="form-control" placeholder="Örn: Anayasa Hukuku" required>
                            </div>
                            
                            <div class="row">
                                <div class="col-6 form-group">
                                    <label>Sıra No</label>
                                    <input type="number" id="inpTopicOrder" class="form-control" required>
                                </div>
                                <div class="col-6 form-group">
                                    <label>Kategori</label>
                                    <select id="inpTopicCategory" class="form-control">
                                        <option value="ortak">Ortak Konular</option>
                                        <option value="alan">Alan Konuları</option>
                                    </select>
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Soru Hedefi</label>
                                <input type="number" id="inpTopicTarget" class="form-control" value="0">
                            </div>

                            <div class="form-group">
                                <label>Açıklama</label>
                                <textarea id="inpTopicDesc" class="form-control" rows="3"></textarea>
                            </div>
                            
                            <button type="button" id="btnSaveMeta" class="btn btn-success w-100 mt-3">💾 Ana Konuyu Kaydet</button>
                        </form>
                    </div>

                    <!-- SAĞ KOLON: Dersler (Alt Konular) -->
                    <div class="lessons-panel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0 text-primary">Dersler (Alt Başlıklar)</h4>
                            <button type="button" class="btn btn-sm btn-outline-primary" onclick="addNewLessonUI()">+ Ders Ekle</button>
                        </div>
                        
                        <div id="lessonsContainer" class="lessons-list" style="max-height: 600px; overflow-y: auto;">
                            <div class="text-center text-muted p-4 border rounded bg-hover" id="emptyLessonsMsg">
                                Bu konuya ait ders bulunamadı.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // CSS Ekleme (Dinamik)
    const style = document.createElement('style');
    style.innerHTML = `
        .lesson-item {
            background: var(--bg-body);
            border: 1px solid var(--border-color);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            position: relative;
            transition: border-color 0.2s;
        }
        .lesson-item:hover { border-color: var(--color-primary); }
        .lesson-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 10px; cursor: pointer;
        }
        .lesson-body { display: none; padding-top: 10px; border-top: 1px solid var(--border-color); }
        .lesson-item.active .lesson-body { display: block; }
        .lesson-item.active .toggle-icon { transform: rotate(180deg); }
        
        .content-type-badge {
            font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-right: 5px;
            background: var(--bg-surface); border: 1px solid var(--border-color);
        }
    `;
    document.head.appendChild(style);

    modalElement = document.getElementById('topicModal');
    topicForm = document.getElementById('topicMetaForm');

    document.getElementById('btnNewTopic').addEventListener('click', () => openTopicEditor());
    document.getElementById('btnCloseTopicModal').addEventListener('click', closeTopicModal);
    document.getElementById('btnSaveMeta').addEventListener('click', handleSaveTopicMeta);

    // Global fonksiyonlar
    window.openTopicEditor = openTopicEditor;
    window.closeTopicModal = closeTopicModal;
    window.deleteTopic = deleteTopic;
    window.addNewLessonUI = addNewLessonUI;
    window.toggleLessonBody = toggleLessonBody;
    window.deleteLesson = deleteLesson;
    window.saveLesson = saveLesson;
}

// --- ANA KONU İŞLEMLERİ ---

async function loadTopics() {
    const tbody = document.getElementById('topicsTableBody');
    if (!tbody) return;

    try {
        const q = query(collection(db, "topics"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Henüz konu eklenmemiş.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Alt koleksiyon sayısını çekmek maliyetli olabilir, şimdilik 'lessonCount' alanını kullanacağız (varsa)
            const lessonCount = data.lessonCount || 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.order || '-'}</td>
                <td><strong>${data.title}</strong></td>
                <td><span class="badge badge-${data.category}">${data.category === 'ortak' ? 'Ortak' : 'Alan'}</span></td>
                <td>${lessonCount} Ders</td>
                <td>${data.isActive ? '✅ Aktif' : '❌ Pasif'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.openTopicEditor('${docSnap.id}')">✏️ Düzenle</button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteTopic('${docSnap.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Hata:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

async function openTopicEditor(id = null) {
    modalElement.style.display = 'flex';
    topicForm.reset();
    document.getElementById('lessonsContainer').innerHTML = '';
    currentLessons = [];

    if (id) {
        document.getElementById('topicModalTitle').innerText = "Konu ve Dersleri Düzenle";
        document.getElementById('editTopicId').value = id;

        try {
            // 1. Ana Konuyu Çek
            const docSnap = await getDoc(doc(db, "topics", id));
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('inpTopicTitle').value = data.title;
                document.getElementById('inpTopicOrder').value = data.order;
                document.getElementById('inpTopicCategory').value = data.category;
                document.getElementById('inpTopicTarget').value = data.totalQuestionTarget;
                document.getElementById('inpTopicDesc').value = data.description || '';

                // 2. Alt Dersleri (Lessons) Çek
                loadLessons(id);
            }
        } catch (e) { console.error(e); }
    } else {
        document.getElementById('topicModalTitle').innerText = "Yeni Konu Ekle";
        document.getElementById('editTopicId').value = "";
        document.getElementById('emptyLessonsMsg').innerText = "Önce ana konuyu kaydedin, sonra ders ekleyebilirsiniz.";
        document.querySelector('.lessons-panel button').disabled = true; // Kaydetmeden ders eklenemez
    }
}

async function handleSaveTopicMeta() {
    const id = document.getElementById('editTopicId').value;

    const data = {
        title: document.getElementById('inpTopicTitle').value,
        order: parseInt(document.getElementById('inpTopicOrder').value),
        category: document.getElementById('inpTopicCategory').value,
        totalQuestionTarget: parseInt(document.getElementById('inpTopicTarget').value),
        description: document.getElementById('inpTopicDesc').value,
        isActive: true,
        updatedAt: serverTimestamp()
    };

    try {
        let topicId = id;
        if (id) {
            await updateDoc(doc(db, "topics", id), data);
        } else {
            data.createdAt = serverTimestamp();
            data.lessonCount = 0;
            const docRef = await addDoc(collection(db, "topics"), data);
            topicId = docRef.id;
            document.getElementById('editTopicId').value = topicId;

            // Yeni kayıt sonrası ders eklemeyi aktif et
            document.querySelector('.lessons-panel button').disabled = false;
            document.getElementById('emptyLessonsMsg').innerText = "Şimdi ders ekleyebilirsiniz.";
        }

        alert("Ana konu bilgileri kaydedildi.");
        loadTopics(); // Listeyi yenile
    } catch (error) {
        alert("Hata: " + error.message);
    }
}

// --- DERS (LESSON) İŞLEMLERİ ---

async function loadLessons(topicId) {
    const container = document.getElementById('lessonsContainer');
    container.innerHTML = '<div class="text-center p-3">Dersler yükleniyor...</div>';

    try {
        const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
        const snapshot = await getDocs(q);

        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<div class="text-center text-muted p-3 border rounded" id="emptyLessonsMsg">Henüz ders eklenmemiş.</div>';
            return;
        }

        snapshot.forEach(docSnap => {
            renderLessonItem(docSnap.id, docSnap.data());
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-danger">Dersler yüklenemedi.</div>';
    }
}

function addNewLessonUI() {
    const container = document.getElementById('lessonsContainer');
    const emptyMsg = document.getElementById('emptyLessonsMsg');
    if (emptyMsg) emptyMsg.style.display = 'none';

    // Geçici ID (Kaydedilince gerçek ID alacak)
    const tempId = 'new_' + Date.now();
    renderLessonItem(tempId, { title: '', order: 0, content: '', videoUrl: '', pdfUrl: '', podcastUrl: '' }, true);
}

function renderLessonItem(id, data, isNew = false) {
    const container = document.getElementById('lessonsContainer');
    const div = document.createElement('div');
    div.className = `lesson-item ${isNew ? 'active' : ''}`;
    div.id = `lesson-${id}`;

    div.innerHTML = `
        <div class="lesson-header" onclick="window.toggleLessonBody('${id}')">
            <div>
                <span class="badge badge-secondary mr-2">#${data.order || 0}</span>
                <strong>${data.title || 'Yeni Ders'}</strong>
            </div>
            <span class="toggle-icon">▼</span>
        </div>
        <div class="lesson-body">
            <div class="form-group">
                <label>Ders Başlığı</label>
                <input type="text" class="form-control l-title" value="${data.title || ''}" placeholder="Örn: Temel Haklar">
            </div>
            <div class="row">
                <div class="col-6 form-group">
                    <label>Sıra No</label>
                    <input type="number" class="form-control l-order" value="${data.order || 0}">
                </div>
                <div class="col-6 form-group">
                    <label>Video URL (YouTube)</label>
                    <input type="text" class="form-control l-video" value="${data.videoUrl || ''}" placeholder="https://youtube.com/...">
                </div>
            </div>
            <div class="row">
                <div class="col-6 form-group">
                    <label>PDF URL</label>
                    <input type="text" class="form-control l-pdf" value="${data.pdfUrl || ''}" placeholder="https://...">
                </div>
                <div class="col-6 form-group">
                    <label>Podcast URL</label>
                    <input type="text" class="form-control l-podcast" value="${data.podcastUrl || ''}" placeholder="https://...">
                </div>
            </div>
            <div class="form-group">
                <label>Ders Notu (HTML/Metin)</label>
                <textarea class="form-control l-content" rows="4" placeholder="Ders içeriği...">${data.content || ''}</textarea>
            </div>
            <div class="text-right mt-2">
                <button type="button" class="btn btn-sm btn-danger" onclick="window.deleteLesson('${id}')">Sil</button>
                <button type="button" class="btn btn-sm btn-success" onclick="window.saveLesson('${id}')">Kaydet</button>
            </div>
        </div>
    `;

    // Yeni eklenen dersi en başa veya sona ekle
    if (isNew) container.prepend(div);
    else container.appendChild(div);
}

function toggleLessonBody(id) {
    const el = document.getElementById(`lesson-${id}`);
    if (el) el.classList.toggle('active');
}

async function saveLesson(id) {
    const topicId = document.getElementById('editTopicId').value;
    const el = document.getElementById(`lesson-${id}`);

    const data = {
        title: el.querySelector('.l-title').value,
        order: parseInt(el.querySelector('.l-order').value),
        videoUrl: el.querySelector('.l-video').value,
        pdfUrl: el.querySelector('.l-pdf').value,
        podcastUrl: el.querySelector('.l-podcast').value,
        content: el.querySelector('.l-content').value,
        updatedAt: serverTimestamp()
    };

    try {
        if (id.startsWith('new_')) {
            // Yeni kayıt
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, `topics/${topicId}/lessons`), data);
            // Ana konudaki ders sayısını artır (Opsiyonel ama iyi olur)
            // await updateDoc(doc(db, "topics", topicId), { lessonCount: increment(1) });
        } else {
            // Güncelleme
            await updateDoc(doc(db, `topics/${topicId}/lessons`, id), data);
        }

        alert("Ders kaydedildi.");
        loadLessons(topicId); // Listeyi yenile (ID'leri düzeltmek için)
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

async function deleteLesson(id) {
    if (!confirm("Bu dersi silmek istediğinize emin misiniz?")) return;

    const topicId = document.getElementById('editTopicId').value;

    if (id.startsWith('new_')) {
        document.getElementById(`lesson-${id}`).remove();
    } else {
        try {
            await deleteDoc(doc(db, `topics/${topicId}/lessons`, id));
            document.getElementById(`lesson-${id}`).remove();
        } catch (e) { alert("Silme hatası: " + e.message); }
    }
}

function closeTopicModal() {
    modalElement.style.display = 'none';
}

async function deleteTopic(id) {
    if (confirm("Bu konuyu silmek istediğinize emin misiniz? (DİKKAT: Altındaki dersler de silinmeli)")) {
        try {
            // Not: Firestore'da parent silinince subcollection silinmez. 
            // Gerçek bir uygulamada Cloud Function ile recursive delete yapılmalı.
            // Şimdilik sadece topic'i siliyoruz.
            await deleteDoc(doc(db, "topics", id));
            loadTopics();
        } catch (e) { alert("Silme hatası: " + e.message); }
    }
}
