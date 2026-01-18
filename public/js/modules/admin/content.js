import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let modalElement = null;
let questionForm = null;
let currentOnculler = [];

export function initContentPage() {
    renderContentInterface();
    loadDynamicCategories();
    loadQuestions();
}

// Kategorileri Firestore'dan Çek
async function loadDynamicCategories() {
    const dataList = document.getElementById('categoryList');
    const filterSelect = document.getElementById('filterCategory');

    if (!dataList || !filterSelect) return;

    try {
        const q = query(collection(db, "topics"), orderBy("title", "asc"));
        const snapshot = await getDocs(q);

        dataList.innerHTML = '';
        filterSelect.innerHTML = '<option value="">Tüm Kategoriler</option>';

        snapshot.forEach(doc => {
            const topic = doc.data();
            const title = topic.title;

            const option = document.createElement('option');
            option.value = title;
            dataList.appendChild(option);

            const selectOption = document.createElement('option');
            selectOption.value = title;
            selectOption.innerText = title;
            filterSelect.appendChild(selectOption);
        });

    } catch (error) {
        console.error("Kategoriler yüklenirken hata:", error);
    }
}

function renderContentInterface() {
    const container = document.getElementById('section-content');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Soru Bankası</h2>
                <p class="text-muted">Soruları yönetin, düzenleyin ve kategorize edin.</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-secondary" onclick="document.querySelector('[data-tab=\\'importer\\']').click()">📥 Toplu Yükle</button>
                <button id="btnNewQuestion" class="btn btn-primary">➕ Yeni Soru</button>
            </div>
        </div>
        
        <!-- Filtreleme Alanı -->
        <div class="card mb-4 p-3">
            <div class="row g-3">
                <div class="col-md-4">
                    <input type="text" id="searchQuestion" class="form-control" placeholder="Soru metni veya ID ara...">
                </div>
                <div class="col-md-3">
                    <select id="filterCategory" class="form-control">
                        <option value="">Yükleniyor...</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <select id="filterStatus" class="form-control">
                        <option value="">Tüm Durumlar</option>
                        <option value="active">Aktif</option>
                        <option value="flagged">⚠️ İncelenecek</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <button id="btnFilter" class="btn btn-secondary w-100">Filtrele</button>
                </div>
            </div>
        </div>

        <!-- Soru Listesi -->
        <div class="card">
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th style="width:50px">ID</th>
                            <th>Kategori</th>
                            <th>Soru Özeti</th>
                            <th>Tip</th>
                            <th>Durum</th>
                            <th style="width:100px">İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="questionsTableBody">
                        <tr><td colspan="6" class="text-center p-4">Yükleniyor...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Soru Ekleme/Düzenleme Modalı -->
        <div id="questionModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3 id="modalTitle">Soru Düzenle</h3>
                    <button id="btnCloseModal" class="close-btn">&times;</button>
                </div>
                
                <form id="questionForm" class="modal-body-scroll">
                    <input type="hidden" id="editQuestionId">

                    <!-- YENİ: Mevzuat Referansı (Otomatik Kategori Seçimi İçin) -->
                    <div class="card p-3 mb-3 bg-light border-primary">
                        <h6 class="text-primary" style="margin-top:0;">⚖️ Mevzuat Bağlantısı (Otomatik Sınıflandırma)</h6>
                        <div class="row g-2">
                            <div class="col-md-4">
                                <label class="form-label">Kanun No / Kod</label>
                                <input type="text" id="inpLegCode" class="form-control" placeholder="Örn: 2577 veya CBK-1">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">Madde No</label>
                                <input type="number" id="inpLegArticle" class="form-control" placeholder="Örn: 5">
                            </div>
                            <div class="col-md-4 d-flex align-items-end">
                                <button type="button" id="btnAutoDetect" class="btn btn-outline-primary w-100">Konuyu Bul</button>
                            </div>
                        </div>
                        <small class="text-muted" id="autoDetectResult" style="display:block; margin-top:5px;"></small>
                    </div>

                    <!-- Üst Bilgiler -->
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label">Kategori (Konu)</label>
                            <input type="text" id="inpCategory" class="form-control" list="categoryList" placeholder="Konu seçin veya yazın..." required>
                            <datalist id="categoryList"></datalist>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Zorluk (1-5)</label>
                            <input type="number" id="inpDifficulty" class="form-control" min="1" max="5" value="3">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Tip</label>
                            <select id="inpType" class="form-control">
                                <option value="standard">Standart</option>
                                <option value="oncullu">Öncüllü</option>
                            </select>
                        </div>
                    </div>

                    <!-- Öncüllü Soru Alanı -->
                    <div id="onculluArea" class="card p-3 mb-3 bg-light" style="display:none; border-left: 4px solid var(--gold-primary);">
                        <label class="fw-bold text-primary">Öncüller</label>
                        <div id="oncullerList" class="mb-2"></div>
                        <div class="input-group mb-2">
                            <input type="text" id="inpNewOncul" class="form-control" placeholder="Yeni öncül ekle...">
                            <button type="button" id="btnAddOncul" class="btn btn-secondary">Ekle</button>
                        </div>
                        <label class="form-label mt-2">Soru Kökü</label>
                        <input type="text" id="inpQuestionRoot" class="form-control" placeholder="Örn: Hangileri doğrudur?">
                    </div>

                    <!-- Soru Metni -->
                    <div class="mb-3">
                        <label class="form-label">Soru Metni</label>
                        <textarea id="inpText" class="form-control" rows="3" required></textarea>
                    </div>

                    <!-- Seçenekler -->
                    <div class="row g-2 mb-3">
                        <div class="col-md-6"><input type="text" id="inpOptA" class="form-control" placeholder="A) Seçenek" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptB" class="form-control" placeholder="B) Seçenek" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptC" class="form-control" placeholder="C) Seçenek" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptD" class="form-control" placeholder="D) Seçenek" required></div>
                        <div class="col-md-6"><input type="text" id="inpOptE" class="form-control" placeholder="E) Seçenek" required></div>
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

                    <!-- Detaylı Çözüm -->
                    <div class="card p-3 mb-3 border-info">
                        <h5 class="text-info mb-3">💡 Çözüm Detayları</h5>
                        <div class="mb-2">
                            <label>Analiz</label>
                            <textarea id="inpSolAnaliz" class="form-control" rows="2"></textarea>
                        </div>
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label>Mevzuat Dayanağı (Metin)</label>
                                <input type="text" id="inpSolDayanak" class="form-control">
                            </div>
                            <div class="col-md-6">
                                <label>Hap Bilgi</label>
                                <input type="text" id="inpSolHap" class="form-control">
                            </div>
                            <div class="col-12">
                                <label class="text-danger">Sınav Tuzağı</label>
                                <input type="text" id="inpSolTuzak" class="form-control">
                            </div>
                        </div>
                    </div>

                    <div class="text-end">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">İptal</button>
                        <button type="submit" class="btn btn-success">Kaydet</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    modalElement = document.getElementById('questionModal');
    questionForm = document.getElementById('questionForm');

    document.getElementById('btnNewQuestion').addEventListener('click', () => openQuestionEditor());
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnFilter').addEventListener('click', loadQuestions);
    document.getElementById('inpType').addEventListener('change', toggleQuestionType);
    document.getElementById('btnAddOncul').addEventListener('click', addOncul);
    document.getElementById('btnAutoDetect').addEventListener('click', autoDetectTopic); // YENİ
    questionForm.addEventListener('submit', handleSaveQuestion);

    window.openQuestionEditorInternal = openQuestionEditor;
    window.removeOnculInternal = removeOncul;
    window.closeModal = closeModal;
}

// --- OTOMATİK KONU TESPİTİ (YENİ) ---
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
        // Tüm konuları çek (Cache'den gelmesi daha iyi olurdu ama şimdilik direkt çekiyoruz)
        const q = query(collection(db, "topics"));
        const snapshot = await getDocs(q);

        let foundLesson = null;
        let foundTopic = null;

        // Konuları ve alt dersleri tara
        for (const doc of snapshot.docs) {
            const topic = doc.data();
            // Alt dersleri çek
            const lessonsSnap = await getDocs(collection(db, `topics/${doc.id}/lessons`));

            lessonsSnap.forEach(lDoc => {
                const lesson = lDoc.data();
                // Kanun kodu eşleşiyor mu?
                if (lesson.legislationCode === code) {
                    // Madde aralığını kontrol et
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

// --- DİĞER İŞLEVLER ---

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

export async function openQuestionEditor(id = null) {
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

            // Mevzuat Bilgileri
            if (data.legislationRef) {
                document.getElementById('inpLegCode').value = data.legislationRef.code || '';
                document.getElementById('inpLegArticle').value = data.legislationRef.article || '';
            }

            // Seçenekler
            const opts = data.options || [];
            const map = {};
            opts.forEach(o => map[o.id] = o.text);
            ['A', 'B', 'C', 'D', 'E'].forEach(k => document.getElementById(`inpOpt${k}`).value = map[k] || '');
            document.getElementById('inpCorrect').value = data.correctOption;

            // Öncüller
            if (data.type === 'oncullu') {
                currentOnculler = data.onculler || [];
                document.getElementById('inpQuestionRoot').value = data.questionRoot || '';
                renderOnculler();
            }
            toggleQuestionType();

            // Çözüm
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

function closeModal() { modalElement.style.display = 'none'; }

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
        // YENİ: Mevzuat Referansı
        legislationRef: {
            code: document.getElementById('inpLegCode').value.trim(),
            article: document.getElementById('inpLegArticle').value.trim()
        },
        isActive: true,
        isFlaggedForReview: false,
        updatedAt: serverTimestamp()
    };

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

async function loadQuestions() {
    const tbody = document.getElementById('questionsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';

    const cat = document.getElementById('filterCategory').value;
    const status = document.getElementById('filterStatus').value;

    let q = query(collection(db, "questions"), orderBy("updatedAt", "desc"), limit(50));

    if (status === 'flagged') q = query(collection(db, "questions"), where("isFlaggedForReview", "==", true));

    try {
        const snap = await getDocs(q);
        tbody.innerHTML = '';

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Soru bulunamadı.</td></tr>';
            return;
        }

        snap.forEach(doc => {
            const d = doc.data();
            if (cat && d.category !== cat) return;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${doc.id.substring(0, 5)}</small></td>
                <td>${d.category}</td>
                <td>${d.text.substring(0, 50)}...</td>
                <td><span class="badge bg-secondary">${d.type === 'oncullu' ? 'Öncüllü' : 'Std'}</span></td>
                <td>${d.isFlaggedForReview ? '<span class="badge bg-warning text-dark">İncelenecek</span>' : '<span class="badge bg-success">Aktif</span>'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.openQuestionEditorInternal('${doc.id}')">✏️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}