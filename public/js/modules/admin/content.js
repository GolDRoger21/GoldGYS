/* DOSYA: public/js/modules/admin/content.js */

import { db } from "../../firebase-config.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let isEditorInitialized = false;
let currentOnculler = [];

// ============================================================
// --- INIT ---
// ============================================================
export function initContentPage() {
    renderContentInterface();
    // Modal HTML'ini sayfaya ekle
    ensureQuestionEditorReady();
    loadDynamicCategories();
    loadQuestions(); // Varsayılan: Aktif sorular
}

// ============================================================
// --- GLOBAL EDİTÖR SERVİSİ (CONTENTS & TOPICS İÇİN) ---
// ============================================================

/**
 * Bu fonksiyon, soru modalının HTML'ini sayfaya enjekte eder.
 * Hem Content sayfasında hem Topics sayfasında aynı modalı kullanmamızı sağlar.
 */
export function ensureQuestionEditorReady() {
    // Eğer modal zaten sayfada varsa tekrar oluşturma
    if (document.getElementById('questionModal')) {
        return;
    }

    const modalHtml = `
        <div id="questionModal" class="modal-overlay" style="display:none; z-index: 100005;">
            <div class="admin-modal-content" style="max-width: 900px; max-height: 95vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h5 class="m-0" id="modalTitle">Soru Düzenle</h5>
                    <button type="button" class="close-btn" onclick="document.getElementById('questionModal').style.display='none'">&times;</button>
                </div>
                <form id="questionForm" class="modal-body-scroll" style="flex:1; overflow-y:auto; padding:20px;">
                    <input type="hidden" id="editQuestionId">
                    
                    <div class="card p-3 mb-3 bg-light border-start border-4 border-primary">
                        <h6 class="text-primary m-0 mb-2">⚖️ Mevzuat Bağlantısı</h6>
                        <div class="row g-2">
                            <div class="col-md-4"><input type="text" id="inpLegCode" class="form-control fw-bold" placeholder="Kanun No (Örn: 5271)"></div>
                            <div class="col-md-4"><input type="text" id="inpLegArticle" class="form-control fw-bold" placeholder="Madde No"></div>
                            <div class="col-md-4"><button type="button" id="btnAutoDetect" class="btn btn-outline-primary w-100">Konuyu Bul</button></div>
                        </div>
                        <small class="text-muted" id="autoDetectResult"></small>
                    </div>

                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label small fw-bold text-muted">KATEGORİ</label>
                            <input type="text" id="inpCategory" class="form-control" list="categoryList" required>
                            <datalist id="categoryList"></datalist>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold text-muted">ZORLUK (1-5)</label>
                            <select id="inpDifficulty" class="form-select">
                                <option value="1">1 - Çok Kolay</option>
                                <option value="2">2 - Kolay</option>
                                <option value="3" selected>3 - Orta</option>
                                <option value="4">4 - Zor</option>
                                <option value="5">5 - Çok Zor</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold text-muted">TİP</label>
                            <select id="inpType" class="form-select">
                                <option value="standard">Standart</option>
                                <option value="oncullu">Öncüllü</option>
                            </select>
                        </div>
                    </div>

                    <div id="onculluArea" class="card p-3 mb-3 bg-light" style="display:none;">
                        <label class="fw-bold mb-2">Öncüller</label>
                        <div id="oncullerList" class="mb-2"></div>
                        <div class="input-group mb-2">
                            <input type="text" id="inpNewOncul" class="form-control" placeholder="Öncül ekle...">
                            <button type="button" id="btnAddOncul" class="btn btn-secondary">Ekle</button>
                        </div>
                        <input type="text" id="inpQuestionRoot" class="form-control fw-bold" placeholder="Soru Kökü (Örn: Hangileri doğrudur?)">
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">SORU METNİ</label>
                        <textarea id="inpText" class="form-control" rows="4" required></textarea>
                    </div>

                    <div class="row g-2 mb-3">
                        <div class="col-md-6"><div class="input-group"><span class="input-group-text fw-bold">A</span><input type="text" id="inpOptA" class="form-control" required></div></div>
                        <div class="col-md-6"><div class="input-group"><span class="input-group-text fw-bold">B</span><input type="text" id="inpOptB" class="form-control" required></div></div>
                        <div class="col-md-6"><div class="input-group"><span class="input-group-text fw-bold">C</span><input type="text" id="inpOptC" class="form-control" required></div></div>
                        <div class="col-md-6"><div class="input-group"><span class="input-group-text fw-bold">D</span><input type="text" id="inpOptD" class="form-control" required></div></div>
                        <div class="col-md-6"><div class="input-group"><span class="input-group-text fw-bold">E</span><input type="text" id="inpOptE" class="form-control" required></div></div>
                        <div class="col-md-6">
                            <select id="inpCorrect" class="form-select bg-success text-white fw-bold" required>
                                <option value="" disabled selected>Doğru Cevap Seç</option>
                                <option value="A">A Şıkkı</option><option value="B">B Şıkkı</option><option value="C">C Şıkkı</option><option value="D">D Şıkkı</option><option value="E">E Şıkkı</option>
                            </select>
                        </div>
                    </div>

                    <div class="card p-3 mb-3 border-info bg-light">
                        <h6 class="text-info">💡 Çözüm Analizi</h6>
                        <textarea id="inpSolAnaliz" class="form-control mb-2" rows="2" placeholder="Detaylı çözüm açıklaması..."></textarea>
                        <div class="row g-2">
                            <div class="col-md-6"><input type="text" id="inpSolDayanak" class="form-control form-control-sm" placeholder="Hukuki Dayanak"></div>
                            <div class="col-md-6"><input type="text" id="inpSolHap" class="form-control form-control-sm" placeholder="Hap Bilgi"></div>
                            <div class="col-12"><input type="text" id="inpSolTuzak" class="form-control form-control-sm" placeholder="Sınav Tuzağı (Dikkat edilmesi gereken)"></div>
                        </div>
                    </div>

                    <div class="modal-footer border-top pt-3 text-end">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('questionModal').style.display='none'">İptal</button>
                        <button type="submit" class="btn btn-success px-4">Kaydet</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Modal içindeki eventleri bağla
    document.getElementById('btnAutoDetect').onclick = autoDetectTopic;
    document.getElementById('btnAddOncul').onclick = addOncul;
    document.getElementById('inpType').onchange = toggleQuestionType;
    document.getElementById('questionForm').onsubmit = handleSaveQuestion;

    // Kategorileri yükle
    loadDynamicCategories();

    isEditorInitialized = true;

    // Global Erişim İçin
    window.QuestionBank = {
        openEditor: openQuestionEditor,
        refreshList: loadQuestions
    };
}

// Bu fonksiyon dışarıdan (Topics.js'den) çağrılabilir ve export edilir
export async function openQuestionEditor(id = null) {
    ensureQuestionEditorReady(); // Modalın var olduğundan emin ol

    const modal = document.getElementById('questionModal');
    const form = document.getElementById('questionForm');

    if (!modal || !form) return;

    modal.style.display = 'flex';
    form.reset();

    currentOnculler = [];
    renderOnculler();

    const titleEl = document.getElementById('modalTitle');
    const idEl = document.getElementById('editQuestionId');
    const resEl = document.getElementById('autoDetectResult');

    if (titleEl) titleEl.innerText = id ? "Soruyu Düzenle" : "Yeni Soru Ekle";
    if (idEl) idEl.value = id || "";
    if (resEl) resEl.innerText = "";

    // Varsayılanlar
    document.getElementById('inpDifficulty').value = 3;
    document.getElementById('inpType').value = 'standard';
    toggleQuestionType();

    if (id) {
        try {
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
                ['A', 'B', 'C', 'D', 'E'].forEach(k => {
                    const el = document.getElementById(`inpOpt${k}`);
                    if (el) el.value = map[k] || '';
                });
                document.getElementById('inpCorrect').value = data.correctOption;

                if (data.type === 'oncullu') {
                    currentOnculler = data.onculler || [];
                    document.getElementById('inpQuestionRoot').value = data.questionRoot || '';
                    renderOnculler();
                }

                // Tip değişikliğini tetikle
                toggleQuestionType();

                const sol = data.solution || {};
                document.getElementById('inpSolAnaliz').value = sol.analiz || '';
                document.getElementById('inpSolDayanak').value = sol.dayanakText || '';
                document.getElementById('inpSolHap').value = sol.hap || '';
                document.getElementById('inpSolTuzak').value = sol.tuzak || '';
            }
        } catch (e) { console.error("Soru yüklenemedi", e); }
    }
}

// ============================================================
// --- SAYFA İÇİ İŞLEMLER (SADECE CONTENT PAGE) ---
// ============================================================

function renderContentInterface() {
    const container = document.getElementById('section-content');
    if (!container) return; // Sayfada değilsek çık

    container.innerHTML = `
        <div class="section-header">
            <div><h2>📚 Soru Bankası Yönetimi</h2><p class="text-muted">Soruları ekleyin, düzenleyin veya arşivleyin.</p></div>
            <div class="d-flex gap-2">
                <button class="btn btn-warning" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
                <button id="btnNewQuestion" class="btn btn-primary">➕ Yeni Soru</button>
            </div>
        </div>
        
        <div class="card mb-4 p-3 border-0 shadow-sm">
            <div class="row g-3">
                <div class="col-md-4">
                    <input type="text" id="searchQuestion" class="form-control" placeholder="Soru metni, ID veya Kanun No ara...">
                </div>
                <div class="col-md-3">
                    <select id="filterCategory" class="form-select">
                        <option value="">Tüm Kategoriler</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <select id="filterStatus" class="form-select">
                        <option value="active">✅ Aktif Sorular</option>
                        <option value="flagged">⚠️ İncelenecekler</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <button id="btnFilter" class="btn btn-secondary w-100">Ara / Filtrele</button>
                </div>
            </div>
        </div>

        <div class="card p-0 border-0 shadow-sm overflow-hidden">
            <div class="table-responsive">
                <table class="admin-table table-hover">
                    <thead class="bg-light">
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
        
        <div id="trashModal" class="modal-overlay" style="display:none; z-index: 100010;">
            <div class="admin-modal-content" style="max-width:800px;">
                <div class="modal-header">
                    <h5 class="m-0">🗑️ Çöp Kutusu</h5>
                    <button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <table class="admin-table">
                        <thead><tr><th>Soru</th><th>Silinme Tarihi</th><th class="text-end">İşlem</th></tr></thead>
                        <tbody id="trashTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Modal HTML'ini yükle (Sayfa render edildiğinde)
    ensureQuestionEditorReady();

    // Sayfa içi butonları bağla
    bindPageEvents();
}

function bindPageEvents() {
    const btnNew = document.getElementById('btnNewQuestion');
    const btnFilter = document.getElementById('btnFilter');

    if (btnNew) btnNew.onclick = () => openQuestionEditor();
    if (btnFilter) btnFilter.onclick = loadQuestions;

    // Global Fonksiyonlar (HTML onclick için)
    window.removeOnculInternal = removeOncul;
    window.openTrashModal = openTrashModal;
    window.restoreQuestion = restoreQuestion;
    window.permanentDeleteQuestion = permanentDeleteQuestion;
    window.softDeleteQuestion = softDeleteQuestion;
}

// --- VERİ YÖNETİMİ ---

async function loadQuestions() {
    const tbody = document.getElementById('questionsTableBody');
    if (!tbody) return; // Tablo yoksa (belki stüdyo sayfasındayız) çık

    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Yükleniyor...</td></tr>';

    const cat = document.getElementById('filterCategory')?.value;
    const status = document.getElementById('filterStatus')?.value;
    const search = document.getElementById('searchQuestion')?.value.toLowerCase();

    // Temel Sorgu
    let q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(100));

    try {
        const snap = await getDocs(q);
        tbody.innerHTML = '';
        let count = 0;

        snap.forEach(doc => {
            const d = doc.data();

            // Client-side Filtreleme
            if (d.isDeleted === true) return;
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
                <td><small class="text-muted">${doc.id.substring(0, 5)}</small></td>
                <td>
                    <div class="fw-bold">${d.category || '-'}</div>
                    <small class="text-muted">${d.legislationRef?.code || '-'} / Md.${d.legislationRef?.article || '-'}</small>
                </td>
                <td title="${d.text}">${(d.text || '').substring(0, 60)}...</td>
                <td><span class="badge bg-light text-dark border">${d.type === 'oncullu' ? 'Öncüllü' : 'Std'}</span></td>
                <td>${d.isFlaggedForReview ? '<span class="badge bg-warning text-dark">İncelenecek</span>' : '<span class="badge bg-success">Aktif</span>'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.QuestionBank.openEditor('${doc.id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.softDeleteQuestion('${doc.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (count === 0) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Kriterlere uygun soru bulunamadı.</td></tr>';

    } catch (e) { console.error(e); }
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
        isActive: true,
        isDeleted: false,
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

        document.getElementById('questionModal').style.display = 'none';

        // Eğer stüdyodaysak ve havuz listesi açıksa orayı yenile
        if (window.Studio && window.Studio.wizard && document.getElementById('poolList')) {
            // Wizard aramasını tetikle (eğer açıksa)
            // window.Studio.wizard.search(); // Otomatik yenileme istenirse açılabilir
        }

        // Eğer Soru Bankası sayfasındaysak listeyi yenile
        if (document.getElementById('questionsTableBody')) loadQuestions();

        alert("Kaydedildi.");
    } catch (e) { alert("Hata: " + e.message); }
}

// --- YARDIMCI FONKSİYONLAR ---

async function loadDynamicCategories() {
    const filterSelect = document.getElementById('filterCategory');
    const dataList = document.getElementById('categoryList');

    if (!filterSelect && !dataList) return;

    try {
        const q = query(collection(db, "topics"), orderBy("title", "asc"));
        const snapshot = await getDocs(q);

        if (filterSelect) filterSelect.innerHTML = '<option value="">Tüm Kategoriler</option>';
        if (dataList) dataList.innerHTML = '';

        snapshot.forEach(doc => {
            const topic = doc.data();
            const t = topic.title;

            if (filterSelect) {
                const opt = document.createElement('option');
                opt.value = t;
                opt.innerText = t;
                filterSelect.appendChild(opt);
            }

            if (dataList) {
                const listOpt = document.createElement('option');
                listOpt.value = t;
                dataList.appendChild(listOpt);
            }
        });
    } catch (error) { console.error("Kategoriler yüklenemedi:", error); }
}

function toggleQuestionType() {
    const type = document.getElementById('inpType').value;
    const area = document.getElementById('onculluArea');
    if (area) area.style.display = type === 'oncullu' ? 'block' : 'none';
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
    if (!list) return;
    list.innerHTML = currentOnculler.map((t, i) =>
        `<div class="d-flex justify-content-between align-items-center bg-white p-2 mb-1 border rounded">
            <span>${t}</span>
            <button type="button" class="btn btn-sm btn-danger py-0" onclick="window.removeOnculInternal(${i})">×</button>
        </div>`
    ).join('');
}

async function autoDetectTopic() {
    const res = document.getElementById('autoDetectResult');
    if (res) {
        res.innerText = "Aranıyor...";
        setTimeout(() => res.innerHTML = '<span class="text-warning">Otomatik eşleşme bulunamadı.</span>', 1000);
    }
}

// --- ÇÖP KUTUSU ---

async function softDeleteQuestion(id) {
    if (confirm("Bu soruyu Çöp Kutusuna taşımak istiyor musunuz?")) {
        try {
            await updateDoc(doc(db, "questions", id), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                isActive: false
            });
            loadQuestions();
        } catch (e) { alert("Hata: " + e.message); }
    }
}

async function openTrashModal() {
    const modal = document.getElementById('trashModal');
    const tbody = document.getElementById('trashTableBody');
    if (!modal) return;
    modal.style.display = 'flex';
    if (tbody) tbody.innerHTML = '<tr><td colspan="3">Yükleniyor...</td></tr>';

    const q = query(collection(db, "questions"), where("isDeleted", "==", true), orderBy("deletedAt", "desc"));
    const snap = await getDocs(q);

    if (tbody) {
        tbody.innerHTML = '';
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-3">Çöp kutusu boş.</td></tr>';
            return;
        }

        snap.forEach(doc => {
            const d = doc.data();
            const date = d.deletedAt ? new Date(d.deletedAt.seconds * 1000).toLocaleDateString() : '-';
            tbody.innerHTML += `
                <tr>
                    <td>${(d.text || '').substring(0, 50)}...</td>
                    <td>${date}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-success" onclick="window.restoreQuestion('${doc.id}')">Geri Al</button>
                        <button class="btn btn-sm btn-danger" onclick="window.permanentDeleteQuestion('${doc.id}')">Yok Et</button>
                    </td>
                </tr>
            `;
        });
    }
}

async function restoreQuestion(id) {
    await updateDoc(doc(db, "questions", id), { isDeleted: false, isActive: true, deletedAt: null });
    openTrashModal();
    loadQuestions();
}

async function permanentDeleteQuestion(id) {
    if (confirm("BU İŞLEM GERİ ALINAMAZ! Soru veritabanından tamamen silinecek.")) {
        await deleteDoc(doc(db, "questions", id));
        openTrashModal();
    }
}