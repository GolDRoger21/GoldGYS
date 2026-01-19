import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let isEditorInitialized = false;

let modalElement = null;
let questionForm = null;
let currentOnculler = [];

export function initContentPage() {
    renderContentInterface();
    loadDynamicCategories();
    loadQuestions(); // Varsayılan: Aktif sorular
}

// --- ARAYÜZ ---
function renderContentInterface() {
    const container = document.getElementById('section-content');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Soru Bankası Yönetimi</h2>
                <p class="text-muted">Soruları ekleyin, düzenleyin veya arşivleyin.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-warning" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
                <button class="btn btn-secondary" onclick="document.querySelector('[data-tab=\\'importer\\']').click()">📥 Toplu Yükle</button>
                <button id="btnNewQuestion" class="btn btn-primary">➕ Yeni Soru</button>
            </div>
        </div>
        
        <!-- Filtreleme -->
        <div class="card mb-4 p-3">
            <div class="row g-3">
                <div class="col-md-4">
                    <input type="text" id="searchQuestion" class="form-control" placeholder="Soru metni, ID veya Kanun No ara...">
                </div>
                <div class="col-md-3">
                    <select id="filterCategory" class="form-control">
                        <option value="">Tüm Kategoriler</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <select id="filterStatus" class="form-control">
                        <option value="active">✅ Aktif Sorular</option>
                        <option value="flagged">⚠️ İncelenecekler</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <button id="btnFilter" class="btn btn-secondary w-100">Ara / Filtrele</button>
                </div>
            </div>
        </div>

        <!-- Liste -->
        <div class="card">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th style="width:50px">ID</th>
                            <th>Kategori / Mevzuat</th>
                            <th>Soru Özeti</th>
                            <th>Tip</th>
                            <th>Durum</th>
                            <th style="width:120px">İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="questionsTableBody">
                        <tr><td colspan="6" class="text-center p-4">Yükleniyor...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Soru Modalı (Ekle/Düzenle) -->
        <div id="questionModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3 id="modalTitle">Soru Düzenle</h3>
                    <button id="btnCloseModal" class="close-btn">&times;</button>
                </div>
                <form id="questionForm" class="modal-body-scroll">
                    <input type="hidden" id="editQuestionId">
                    
                    <!-- Mevzuat (Otomatik) -->
                    <div class="card p-3 mb-3 bg-light border-primary">
                        <h6 class="text-primary" style="margin-top:0;">⚖️ Mevzuat Bağlantısı</h6>
                        <div class="row g-2">
                            <div class="col-md-4"><input type="text" id="inpLegCode" class="form-control" placeholder="Kanun No (Örn: 2577)"></div>
                            <div class="col-md-4"><input type="number" id="inpLegArticle" class="form-control" placeholder="Madde No"></div>
                            <div class="col-md-4"><button type="button" id="btnAutoDetect" class="btn btn-outline-primary w-100">Konuyu Bul</button></div>
                        </div>
                        <small class="text-muted" id="autoDetectResult"></small>
                    </div>

                    <!-- Ana Bilgiler -->
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label>Kategori</label>
                            <input type="text" id="inpCategory" class="form-control" list="categoryList" required>
                            <datalist id="categoryList"></datalist>
                        </div>
                        <div class="col-md-3">
                            <label>Zorluk (1-5)</label>
                            <input type="number" id="inpDifficulty" class="form-control" min="1" max="5" value="3">
                        </div>
                        <div class="col-md-3">
                            <label>Tip</label>
                            <select id="inpType" class="form-control">
                                <option value="standard">Standart</option>
                                <option value="oncullu">Öncüllü</option>
                            </select>
                        </div>
                    </div>

                    <!-- Öncüllü Alanı -->
                    <div id="onculluArea" class="card p-3 mb-3 bg-light" style="display:none;">
                        <label class="fw-bold">Öncüller</label>
                        <div id="oncullerList" class="mb-2"></div>
                        <div class="input-group mb-2">
                            <input type="text" id="inpNewOncul" class="form-control" placeholder="Öncül ekle...">
                            <button type="button" id="btnAddOncul" class="btn btn-secondary">Ekle</button>
                        </div>
                        <input type="text" id="inpQuestionRoot" class="form-control" placeholder="Soru Kökü (Örn: Hangileri doğrudur?)">
                    </div>

                    <!-- Soru Metni -->
                    <div class="mb-3">
                        <label>Soru Metni</label>
                        <textarea id="inpText" class="form-control" rows="3" required></textarea>
                    </div>

                    <!-- Şıklar -->
                    <div class="row g-2 mb-3">
                        <div class="col-md-6"><input type="text" id="inpOptA" class="form-control" placeholder="A)" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptB" class="form-control" placeholder="B)" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptC" class="form-control" placeholder="C)" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptD" class="form-control" placeholder="D)" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptE" class="form-control" placeholder="E)" required></div>
                        <div class="col-md-6">
                            <select id="inpCorrect" class="form-control bg-success text-white" required>
                                <option value="" disabled selected>Doğru Cevap</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
                            </select>
                        </div>
                    </div>

                    <!-- Çözüm -->
                    <div class="card p-3 mb-3 border-info">
                        <h5 class="text-info">💡 Çözüm</h5>
                        <textarea id="inpSolAnaliz" class="form-control mb-2" rows="2" placeholder="Analiz"></textarea>
                        <div class="row g-2">
                            <div class="col-md-6"><input type="text" id="inpSolDayanak" class="form-control" placeholder="Dayanak"></div>
                            <div class="col-md-6"><input type="text" id="inpSolHap" class="form-control" placeholder="Hap Bilgi"></div>
                            <div class="col-12"><input type="text" id="inpSolTuzak" class="form-control" placeholder="Sınav Tuzağı"></div>
                        </div>
                    </div>

                    <div class="text-end">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">İptal</button>
                        <button type="submit" class="btn btn-success">Kaydet</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Çöp Kutusu Modalı -->
        <div id="trashModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                <div class="modal-header">
                    <h3>🗑️ Geri Dönüşüm Kutusu</h3>
                    <button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <div class="alert alert-warning">Buradaki sorular 30 gün sonra otomatik olarak kalıcı silinebilir.</div>
                    <table class="admin-table">
                        <thead><tr><th>Soru</th><th>Silinme Tarihi</th><th>İşlem</th></tr></thead>
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Event Listeners
    bindEvents();
}

function bindEvents() {
    modalElement = document.getElementById('questionModal');
    questionForm = document.getElementById('questionForm');

    document.getElementById('btnNewQuestion').addEventListener('click', () => openQuestionEditor());
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnFilter').addEventListener('click', loadQuestions);
    document.getElementById('inpType').addEventListener('change', toggleQuestionType);
    document.getElementById('btnAddOncul').addEventListener('click', addOncul);
    document.getElementById('btnAutoDetect').addEventListener('click', autoDetectTopic);
    questionForm.addEventListener('submit', handleSaveQuestion);

    // Global Fonksiyonlar (HTML onclick için)
    window.openQuestionEditorInternal = openQuestionEditor;
    window.removeOnculInternal = removeOncul;
    window.closeModal = closeModal;
    window.softDeleteQuestion = softDeleteQuestion;
    window.openTrashModal = openTrashModal;
    window.restoreQuestion = restoreQuestion;
    window.permanentDeleteQuestion = permanentDeleteQuestion;

    // Editörü dışarı açtık (Topics modülü için)
    window.QuestionBank = {
        openEditor: openQuestionEditor,
        refreshList: loadQuestions
    };
}

// --- VERİ YÖNETİMİ ---

async function loadQuestions() {
    const tbody = document.getElementById('questionsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    const cat = document.getElementById('filterCategory').value;
    const status = document.getElementById('filterStatus').value;
    const search = document.getElementById('searchQuestion').value.toLowerCase();

    // Temel Sorgu: Sadece silinmemişleri getir
    let q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(100));

    try {
        const snap = await getDocs(q);
        tbody.innerHTML = '';
        let count = 0;

        snap.forEach(doc => {
            const d = doc.data();

            // Client-side Filtreleme
            if (d.isDeleted === true) return; // Çöp kutusundakileri gösterme
            if (status === 'flagged' && !d.isFlaggedForReview) return;
            if (cat && d.category !== cat) return;

            // Arama check
            if (search) {
                const textMatch = (d.text || '').toLowerCase().includes(search);
                const idMatch = doc.id.toLowerCase().includes(search);
                const legMatch = (d.legislationRef?.code || '').toLowerCase().includes(search);
                if (!textMatch && !idMatch && !legMatch) return;
            }

            count++;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${doc.id.substring(0, 5)}</small></td>
                <td>
                    <div>${d.category}</div>
                    <small class="text-muted">${d.legislationRef?.code || '-'} / Md.${d.legislationRef?.article || '-'}</small>
                </td>
                <td title="${d.text}">${d.text.substring(0, 60)}...</td>
                <td><span class="badge bg-secondary">${d.type === 'oncullu' ? 'Öncüllü' : 'Std'}</span></td>
                <td>${d.isFlaggedForReview ? '<span class="badge bg-warning text-dark">İncelenecek</span>' : '<span class="badge bg-success">Aktif</span>'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.openQuestionEditorInternal('${doc.id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.softDeleteQuestion('${doc.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (count === 0) tbody.innerHTML = '<tr><td colspan="6" class="text-center">Kriterlere uygun soru bulunamadı.</td></tr>';

    } catch (e) { console.error(e); }
}

// --- SİLME VE ÇÖP KUTUSU ---

async function softDeleteQuestion(id) {
    if (confirm("Bu soruyu Çöp Kutusuna taşımak istiyor musunuz?\n(Testlerden otomatik olarak kaldırılmaz, ancak admin listesinde görünmez olur.)")) {
        try {
            await updateDoc(doc(db, "questions", id), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                isActive: false // Soru artık pasif
            });
            loadQuestions(); // Listeyi yenile
        } catch (e) { alert("Hata: " + e.message); }
    }
}

async function openTrashModal() {
    const modal = document.getElementById('trashModal');
    const tbody = document.getElementById('trashTableBody');
    modal.style.display = 'flex';
    tbody.innerHTML = '<tr><td colspan="3">Yükleniyor...</td></tr>';

    const q = query(collection(db, "questions"), where("isDeleted", "==", true), orderBy("deletedAt", "desc"));
    const snap = await getDocs(q);

    tbody.innerHTML = '';
    if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="3">Çöp kutusu boş.</td></tr>';
        return;
    }

    snap.forEach(doc => {
        const d = doc.data();
        const date = d.deletedAt ? new Date(d.deletedAt.seconds * 1000).toLocaleDateString() : '-';

        tbody.innerHTML += `
            <tr>
                <td>${(d.text || '').substring(0, 50)}...</td>
                <td>${date}</td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="window.restoreQuestion('${doc.id}')">Geri Al</button>
                    <button class="btn btn-sm btn-danger" onclick="window.permanentDeleteQuestion('${doc.id}')">Yok Et</button>
                </td>
            </tr>
        `;
    });
}

async function restoreQuestion(id) {
    await updateDoc(doc(db, "questions", id), { isDeleted: false, isActive: true, deletedAt: null });
    openTrashModal(); // Listeyi yenile
    loadQuestions(); // Ana listeyi yenile
}

async function permanentDeleteQuestion(id) {
    if (confirm("BU İŞLEM GERİ ALINAMAZ! Soru veritabanından tamamen silinecek.")) {
        await deleteDoc(doc(db, "questions", id));
        openTrashModal();
    }
}

// --- MEVCUT YARDIMCI FONKSİYONLAR ---

// Kategorileri Firestore'dan Çek
async function loadDynamicCategories() {
    const filterSelect = document.getElementById('filterCategory');
    const dataList = document.getElementById('categoryList'); // Modal içindeki input için

    if (!filterSelect) return; // Hata almamak için güvenlik

    try {
        // Sadece başlıkları değil, id'leri de alabiliriz ama şimdilik başlık yeterli
        const q = query(collection(db, "topics"), orderBy("title", "asc"));
        const snapshot = await getDocs(q);

        // Önce temizle
        filterSelect.innerHTML = '<option value="">Tüm Kategoriler</option>';
        if (dataList) dataList.innerHTML = '';

        snapshot.forEach(doc => {
            const topic = doc.data();

            // Filtre Select için
            const opt = document.createElement('option');
            opt.value = topic.title; // Veritabanında category alanında title mı tutuyorsun ID mi? Koduna göre Title.
            opt.innerText = topic.title;
            filterSelect.appendChild(opt);

            // Modal Input Datalist için
            if (dataList) {
                const listOpt = document.createElement('option');
                listOpt.value = topic.title;
                dataList.appendChild(listOpt);
            }
        });

    } catch (error) {
        console.error("Kategoriler yüklenemedi:", error);
    }
}

async function autoDetectTopic() {
    const code = document.getElementById('inpLegCode').value.trim();
    const article = parseInt(document.getElementById('inpLegArticle').value);
    const resultLabel = document.getElementById('autoDetectResult');

    if (!code || isNaN(article)) {
        resultLabel.innerHTML = '<span class="text-danger">Lütfen Kanun No ve Madde No girin.</span>';
        return;
    }

    resultLabel.innerText = 'Aranıyor...';

    try {
        const q = query(collection(db, "topics"));
        const snapshot = await getDocs(q);

        let foundLesson = null;
        let foundTopic = null;

        for (const doc of snapshot.docs) {
            const topic = doc.data();
            const lessonsSnap = await getDocs(collection(db, `topics/${doc.id}/lessons`));

            lessonsSnap.forEach(lDoc => {
                const lesson = lDoc.data();
                if (lesson.legislationCode === code) {
                    if (lesson.articleRange === 'ALL') {
                        foundLesson = lesson;
                        foundTopic = topic;
                    } else if (lesson.articleRange && lesson.articleRange.includes('-')) {
                        const [start, end] = lesson.articleRange.split('-').map(Number);
                        if (article >= start && article <= end) {
                            foundLesson = lesson;
                            foundTopic = topic;
                        }
                    }
                }
            });
            if (foundTopic) break;
        }

        if (foundTopic && foundLesson) {
            document.getElementById('inpCategory').value = foundTopic.title;
            resultLabel.innerHTML = `<span class="text-success">✅ Bulundu: ${foundTopic.title} > ${foundLesson.title}</span>`;
        } else {
            resultLabel.innerHTML = '<span class="text-warning">⚠️ Bu maddeye uygun konu bulunamadı. Manuel seçiniz.</span>';
        }

    } catch (error) {
        console.error(error);
        resultLabel.innerText = 'Hata oluştu.';
    }
}

function toggleQuestionType() {
    const type = document.getElementById('inpType').value;
    document.getElementById('onculluArea').style.display = type === 'oncullu' ? 'block' : 'none';
}

function addOncul() {
    const val = document.getElementById('inpNewOncul').value.trim();
    if (!val) return;
    currentOnculler.push(val);
    renderOnculler();
    document.getElementById('inpNewOncul').value = '';
}

function removeOncul(index) {
    currentOnculler.splice(index, 1);
    renderOnculler();
}

function renderOnculler() {
    const list = document.getElementById('oncullerList');
    list.innerHTML = currentOnculler.map((t, i) =>
        `<div class="d-flex justify-content-between align-items-center bg-white p-2 mb-1 border rounded">
            <span>${t}</span>
            <button type="button" class="btn btn-sm btn-danger py-0" onclick="window.removeOnculInternal(${i})">×</button>
        </div>`
    ).join('');
}

function closeModal() { if (modalElement) modalElement.style.display = 'none'; }

export async function openQuestionEditor(id = null) {
    ensureQuestionEditorReady(); // Önce modalın var olduğundan emin ol

    modalElement = document.getElementById('questionModal');
    questionForm = document.getElementById('questionForm');

    modalElement.style.display = 'flex';
    questionForm.reset();
    currentOnculler = [];
    renderOnculler();
    document.getElementById('modalTitle').innerText = id ? "Soruyu Düzenle" : "Yeni Soru Ekle";
    document.getElementById('editQuestionId').value = id || "";
    document.getElementById('autoDetectResult').innerText = "";

    if (id) {
        const docSnap = await getDoc(doc(db, "questions", id));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('inpCategory').value = data.category || '';
            document.getElementById('inpDifficulty').value = data.difficulty || 3;
            document.getElementById('inpType').value = data.type || 'standard';
            document.getElementById('inpText').value = data.text || '';

            if (data.legislationRef) {
                document.getElementById('inpLegCode').value = data.legislationRef.code || '';
                document.getElementById('inpLegArticle').value = data.legislationRef.article || '';
            }

            const opts = data.options || [];
            const map = {};
            opts.forEach(o => map[o.id] = o.text);
            ['A', 'B', 'C', 'D', 'E'].forEach(k => document.getElementById(`inpOpt${k}`).value = map[k] || '');
            document.getElementById('inpCorrect').value = data.correctOption;

            if (data.type === 'oncullu') {
                currentOnculler = data.onculler || [];
                document.getElementById('inpQuestionRoot').value = data.questionRoot || '';
                renderOnculler();
            }
            toggleQuestionType();

            const sol = data.solution || {};
            document.getElementById('inpSolAnaliz').value = sol.analiz || '';
            document.getElementById('inpSolDayanak').value = sol.dayanakText || '';
            document.getElementById('inpSolHap').value = sol.hap || '';
            document.getElementById('inpSolTuzak').value = sol.tuzak || '';
        }
    } else {
        toggleQuestionType();
    }
}

async function handleSaveQuestion(e) {
    e.preventDefault();
    const id = document.getElementById('editQuestionId').value;

    const data = {
        category: document.getElementById('inpCategory').value.trim(),
        difficulty: parseInt(document.getElementById('inpDifficulty').value),
        type: document.getElementById('inpType').value,
        text: document.getElementById('inpText').value.trim(),
        options: ['A', 'B', 'C', 'D', 'E'].map(k => ({ id: k, text: document.getElementById(`inpOpt${k}`).value.trim() })),
        correctOption: document.getElementById('inpCorrect').value,
        solution: {
            analiz: document.getElementById('inpSolAnaliz').value.trim(),
            dayanakText: document.getElementById('inpSolDayanak').value.trim(),
            hap: document.getElementById('inpSolHap').value.trim(),
            tuzak: document.getElementById('inpSolTuzak').value.trim()
        },
        legislationRef: {
            code: document.getElementById('inpLegCode').value.trim(),
            article: document.getElementById('inpLegArticle').value.trim()
        },
        isFlaggedForReview: false,
        updatedAt: serverTimestamp()
    };

    // Yeni kayıt veya güncelleme olsa da, eğer daha önce silinmişse silinmemiş yapalım mı? 
    // Hayır, edit yapıyorsa zaten aktiftir. Ama yeni kayıt isActive: true olur.
    // Eğer düzenleme yapılıyorsa isActive durumunu elle değiştirmeyelim ama silinmişse geri getirebiliriz.
    // Şimdilik basitçe isActive: true yapalım.
    data.isActive = true;
    data.isDeleted = false; // Garanti olsun

    if (data.type === 'oncullu') {
        data.onculler = currentOnculler;
        data.questionRoot = document.getElementById('inpQuestionRoot').value.trim();
    }

    try {
        if (id) await updateDoc(doc(db, "questions", id), data);
        else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "questions"), data);
        }
        closeModal();
        loadQuestions();
        alert("Kaydedildi.");
    } catch (e) { alert("Hata: " + e.message); }
}

// 1. Modalı Oluşturan ve Eventleri Bağlayan Fonksiyon (YENİ)
export function ensureQuestionEditorReady() {
    if (isEditorInitialized && document.getElementById('questionModal')) return;

    // Eğer sayfa Soru Bankası değilse ve Modal yoksa, HTML'i body'ye ekle
    if (!document.getElementById('questionModal')) {
        const modalHtml = `
            <div id="questionModal" class="modal-overlay" style="display:none; z-index: 9999;">
                <div class="modal-content admin-modal-content" style="max-width: 900px;">
                    <div class="modal-header">
                         <h3 id="modalTitle">Soru Düzenle</h3>
                         <button type="button" class="close-btn" onclick="document.getElementById('questionModal').style.display='none'">&times;</button>
                    </div>
                    <form id="questionForm" class="modal-body-scroll">
                        <input type="hidden" id="editQuestionId">
                        
                        <!-- Mevzuat (Otomatik) -->
                        <div class="card p-3 mb-3 bg-light border-primary">
                            <h6 class="text-primary" style="margin-top:0;">⚖️ Mevzuat Bağlantısı</h6>
                            <div class="row g-2">
                                <div class="col-md-4"><input type="text" id="inpLegCode" class="form-control" placeholder="Kanun No (Örn: 2577)"></div>
                                <div class="col-md-4"><input type="number" id="inpLegArticle" class="form-control" placeholder="Madde No"></div>
                                <div class="col-md-4"><button type="button" id="btnAutoDetect" class="btn btn-outline-primary w-100">Konuyu Bul</button></div>
                            </div>
                            <small class="text-muted" id="autoDetectResult"></small>
                        </div>

                        <!-- Ana Bilgiler -->
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <label>Kategori</label>
                                <input type="text" id="inpCategory" class="form-control" list="categoryList" required>
                                <datalist id="categoryList"></datalist>
                            </div>
                            <div class="col-md-3">
                                <label>Zorluk (1-5)</label>
                                <input type="number" id="inpDifficulty" class="form-control" min="1" max="5" value="3">
                            </div>
                            <div class="col-md-3">
                                <label>Tip</label>
                                <select id="inpType" class="form-control">
                                    <option value="standard">Standart</option>
                                    <option value="oncullu">Öncüllü</option>
                                </select>
                            </div>
                        </div>

                        <!-- Öncüllü Alanı -->
                        <div id="onculluArea" class="card p-3 mb-3 bg-light" style="display:none;">
                            <label class="fw-bold">Öncüller</label>
                            <div id="oncullerList" class="mb-2"></div>
                            <div class="input-group mb-2">
                                <input type="text" id="inpNewOncul" class="form-control" placeholder="Öncül ekle...">
                                <button type="button" id="btnAddOncul" class="btn btn-secondary">Ekle</button>
                            </div>
                            <input type="text" id="inpQuestionRoot" class="form-control" placeholder="Soru Kökü (Örn: Hangileri doğrudur?)">
                        </div>

                        <!-- Soru Metni -->
                        <div class="mb-3">
                            <label>Soru Metni</label>
                            <textarea id="inpText" class="form-control" rows="3" required></textarea>
                        </div>

                        <!-- Şıklar -->
                        <div class="row g-2 mb-3">
                            <div class="col-md-6"><input type="text" id="inpOptA" class="form-control" placeholder="A)" required></div>
                            <div class="col-md-6"><input type="text" id="inpOptB" class="form-control" placeholder="B)" required></div>
                            <div class="col-md-6"><input type="text" id="inpOptC" class="form-control" placeholder="C)" required></div>
                            <div class="col-md-6"><input type="text" id="inpOptD" class="form-control" placeholder="D)" required></div>
                            <div class="col-md-6"><input type="text" id="inpOptE" class="form-control" placeholder="E)" required></div>
                            <div class="col-md-6">
                                <select id="inpCorrect" class="form-control bg-success text-white" required>
                                    <option value="" disabled selected>Doğru Cevap</option>
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="D">D</option>
                                    <option value="E">E</option>
                                </select>
                            </div>
                        </div>

                        <!-- Çözüm -->
                        <div class="card p-3 mb-3 border-info">
                            <h5 class="text-info">💡 Çözüm</h5>
                            <textarea id="inpSolAnaliz" class="form-control mb-2" rows="2" placeholder="Analiz"></textarea>
                            <div class="row g-2">
                                <div class="col-md-6"><input type="text" id="inpSolDayanak" class="form-control" placeholder="Dayanak"></div>
                                <div class="col-md-6"><input type="text" id="inpSolHap" class="form-control" placeholder="Hap Bilgi"></div>
                                <div class="col-12"><input type="text" id="inpSolTuzak" class="form-control" placeholder="Sınav Tuzağı"></div>
                            </div>
                        </div>

                        <div class="text-end mt-3">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('questionModal').style.display='none'">İptal</button>
                            <button type="submit" class="btn btn-success">Kaydet</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Event Listener'ları manuel bağla
        const form = document.getElementById('questionForm');
        form.addEventListener('submit', handleSaveQuestion);

        document.getElementById('btnAutoDetect')?.addEventListener('click', autoDetectTopic);
        document.getElementById('btnAddOncul')?.addEventListener('click', addOncul);
        document.getElementById('inpType')?.addEventListener('change', toggleQuestionType);

        // Kategorileri yükle (Select box için)
        loadDynamicCategories();
    }
    isEditorInitialized = true;
}