/* DOSYA: public/js/modules/admin/content.js */

import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let isEditorInitialized = false;
let currentOnculler = [];
const selectedQuestionIds = new Set();
let lastVisibleQuestionIds = [];
let filteredQuestions = [];

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

                    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
                        <span class="badge bg-light text-dark border">Soru ID: <span id="questionIdDisplay">-</span></span>
                        <span class="text-muted small">Yeni sorularda ID otomatik olarak oluşturulur.</span>
                    </div>
                    
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
                        <label class="form-label small fw-bold text-muted">Detaylı Çözüm Açıklaması</label>
                        <textarea id="inpSolAnaliz" class="form-control mb-2" rows="2" placeholder="Sorunun çözümünü adım adım açıklayın..."></textarea>
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-muted">📜 Mevzuat Dayanağı</label>
                                <input type="text" id="inpSolDayanak" class="form-control form-control-sm" placeholder="İlgili kanun/madde veya resmi dayanak">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-muted">💊 Hap Bilgi</label>
                                <input type="text" id="inpSolHap" class="form-control form-control-sm" placeholder="Hatırlatıcı kısa bilgi">
                            </div>
                            <div class="col-12">
                                <label class="form-label small fw-bold text-muted">⚠️ Sınav Tuzağı</label>
                                <input type="text" id="inpSolTuzak" class="form-control form-control-sm" placeholder="Dikkat edilmesi gereken kritik nokta">
                            </div>
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
    const displayIdEl = document.getElementById('questionIdDisplay');

    if (titleEl) titleEl.innerText = id ? "Soruyu Düzenle" : "Yeni Soru Ekle";
    if (idEl) idEl.value = id || "";
    if (resEl) resEl.innerText = "";
    if (displayIdEl) displayIdEl.innerText = id || "Otomatik";

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

        <div class="card mb-4 p-3 border-0 shadow-sm question-filter-card">
            <div class="question-filter-header">
                <div>
                    <h5>Filtreler</h5>
                    <p class="text-muted small mb-0">Soru bankasını hızlıca daraltmak için aşağıdaki kriterleri kullanın.</p>
                </div>
                <div class="d-flex flex-wrap gap-2 justify-content-end">
                    <button id="btnFilter" class="btn btn-secondary">Ara / Filtrele</button>
                    <button id="btnExportJson" class="btn btn-outline-success">JSON İndir</button>
                    <button id="btnExportExcel" class="btn btn-outline-success">Excel (CSV) İndir</button>
                </div>
            </div>
            <div class="row g-3 align-items-end">
                <div class="col-lg-4 col-md-6">
                    <label class="form-label small fw-bold text-muted">GENEL ARAMA</label>
                    <input type="text" id="searchQuestion" class="form-control" placeholder="Soru metni, ID, kategori veya mevzuat ara...">
                </div>
                <div class="col-lg-3 col-md-6">
                    <label class="form-label small fw-bold text-muted">KATEGORİ</label>
                    <select id="filterCategory" class="form-select">
                        <option value="">Tüm Kategoriler</option>
                    </select>
                </div>
                <div class="col-lg-2 col-md-6">
                    <label class="form-label small fw-bold text-muted">DURUM</label>
                    <select id="filterStatus" class="form-select">
                        <option value="active">✅ Aktif</option>
                        <option value="inactive">⏸️ Pasif</option>
                        <option value="flagged">⚠️ İncelenecek</option>
                        <option value="all">📌 Tümü</option>
                    </select>
                </div>
                <div class="col-lg-3 col-md-6">
                    <label class="form-label small fw-bold text-muted">MEVZUAT DURUMU</label>
                    <select id="filterLegMode" class="form-select">
                        <option value="all">Tümü</option>
                        <option value="with">Mevzuatlı</option>
                        <option value="without">Mevzuatsız</option>
                    </select>
                </div>
                <div class="col-lg-3 col-md-6">
                    <label class="form-label small fw-bold text-muted">KANUN NO</label>
                    <input type="text" id="filterLegCode" class="form-control" placeholder="Örn: 5271">
                </div>
                <div class="col-lg-3 col-md-6">
                    <label class="form-label small fw-bold text-muted">MADDE NO</label>
                    <input type="text" id="filterLegArticle" class="form-control" placeholder="Örn: 12">
                </div>
                <div class="col-lg-6 col-md-12 d-flex align-items-end">
                    <div class="text-muted small question-filter-hint">Mevzuat değişikliğinde ilgili kanun/maddeyi filtreleyip topluca işlem yapabilirsiniz.</div>
                </div>
            </div>
        </div>

        <div class="users-bulk-bar mb-3" id="questionBulkBar" style="display:none;">
            <label class="users-select-all">
                <input type="checkbox" id="selectAllQuestions">
                <span>Seçilen: <strong id="selectedCount">0</strong></span>
            </label>
            <div class="users-bulk-actions">
                <button class="btn btn-outline-primary btn-sm" id="bulkActivate">▶️ Aktifleştir</button>
                <button class="btn btn-outline-warning btn-sm" id="bulkDeactivate">⏸️ Pasife Al</button>
                <button class="btn btn-outline-secondary btn-sm" id="bulkFlag">⚠️ İncelemeye Al</button>
                <button class="btn btn-outline-success btn-sm" id="bulkUnflag">✅ İncelemeden Çıkar</button>
                <button class="btn btn-outline-danger btn-sm" id="bulkDelete">🗑️ Çöp Kutusu</button>
            </div>
        </div>

        <div class="card p-0 border-0 shadow-sm overflow-hidden">
            <div class="table-responsive">
                <table class="admin-table table-hover">
                    <thead class="bg-light">
                        <tr>
                            <th style="width:36px"><input type="checkbox" id="selectAllQuestionsHead"></th>
                            <th style="width:50px">ID</th>
                            <th>Kategori / Mevzuat</th>
                            <th>Soru Özeti</th>
                            <th>Tip</th>
                            <th>Durum</th>
                            <th style="width:150px">İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="questionsTableBody">
                        <tr><td colspan="7" class="text-center p-4">Yükleniyor...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <div id="questionTrashModal" class="modal-overlay" style="display:none; z-index: 100010;">
            <div class="admin-modal-content" style="max-width:800px;">
                <div class="modal-header">
                    <h5 class="m-0">🗑️ Çöp Kutusu</h5>
                    <button onclick="document.getElementById('questionTrashModal').style.display='none'" class="close-btn">&times;</button>
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
    const btnExportJson = document.getElementById('btnExportJson');
    const btnExportExcel = document.getElementById('btnExportExcel');
    const selectAll = document.getElementById('selectAllQuestions');
    const selectAllHead = document.getElementById('selectAllQuestionsHead');
    const bulkActivate = document.getElementById('bulkActivate');
    const bulkDeactivate = document.getElementById('bulkDeactivate');
    const bulkFlag = document.getElementById('bulkFlag');
    const bulkUnflag = document.getElementById('bulkUnflag');
    const bulkDelete = document.getElementById('bulkDelete');

    if (btnNew) btnNew.onclick = () => openQuestionEditor();
    if (btnFilter) btnFilter.onclick = loadQuestions;
    if (btnExportJson) btnExportJson.onclick = () => exportFilteredQuestions('json');
    if (btnExportExcel) btnExportExcel.onclick = () => exportFilteredQuestions('excel');
    if (selectAll) selectAll.onchange = (e) => toggleSelectAll(e.target.checked);
    if (selectAllHead) selectAllHead.onchange = (e) => toggleSelectAll(e.target.checked);
    if (bulkActivate) bulkActivate.onclick = () => runBulkUpdate({ isActive: true, isDeleted: false }, "Seçilen sorular aktifleştirildi.");
    if (bulkDeactivate) bulkDeactivate.onclick = () => runBulkUpdate({ isActive: false }, "Seçilen sorular pasife alındı.");
    if (bulkFlag) bulkFlag.onclick = () => runBulkUpdate({ isFlaggedForReview: true }, "Seçilen sorular incelemeye alındı.");
    if (bulkUnflag) bulkUnflag.onclick = () => runBulkUpdate({ isFlaggedForReview: false }, "Seçilen sorular incelemeden çıkarıldı.");
    if (bulkDelete) bulkDelete.onclick = () => bulkSoftDelete();

    // Global Fonksiyonlar (HTML onclick için)
    window.removeOnculInternal = removeOncul;
    window.openTrashModal = openTrashModal;
    window.restoreQuestion = restoreQuestion;
    window.permanentDeleteQuestion = permanentDeleteQuestion;
    window.softDeleteQuestion = softDeleteQuestion;
    window.toggleQuestionActive = toggleQuestionActive;
}

// --- VERİ YÖNETİMİ ---

async function loadQuestions() {
    const tbody = document.getElementById('questionsTableBody');
    if (!tbody) return; // Tablo yoksa (belki stüdyo sayfasındayız) çık

    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4">Yükleniyor...</td></tr>';

    const cat = document.getElementById('filterCategory')?.value;
    const status = document.getElementById('filterStatus')?.value;
    const search = document.getElementById('searchQuestion')?.value.toLowerCase();
    const legCode = document.getElementById('filterLegCode')?.value.toLowerCase();
    const legArticle = document.getElementById('filterLegArticle')?.value.toLowerCase();
    const legMode = document.getElementById('filterLegMode')?.value || 'all';

    // Temel Sorgu
    let q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(100));

    try {
        const snap = await getDocs(q);
        tbody.innerHTML = '';
        let count = 0;
        lastVisibleQuestionIds = [];
        filteredQuestions = [];

        snap.forEach(doc => {
            const d = doc.data();
            const legRef = d.legislationRef || {};
            const legCodeValue = (legRef.code || '').toString();
            const legArticleValue = (legRef.article || '').toString();
            const hasLegislation = Boolean(legCodeValue || legArticleValue);

            // Client-side Filtreleme
            if (d.isDeleted === true) return;
            if (status === 'flagged' && !d.isFlaggedForReview) return;
            if (status === 'active' && d.isActive === false) return;
            if (status === 'inactive' && d.isActive !== false) return;
            if (cat && d.category !== cat) return;
            if (legMode === 'with' && !hasLegislation) return;
            if (legMode === 'without' && hasLegislation) return;
            if (legCode && !legCodeValue.toLowerCase().includes(legCode)) return;
            if (legArticle && !legArticleValue.toLowerCase().includes(legArticle)) return;

            // Arama check
            if (search) {
                const textMatch = (d.text || '').toLowerCase().includes(search);
                const idMatch = doc.id.toLowerCase().includes(search);
                const catMatch = (d.category || '').toLowerCase().includes(search);
                const legMatch = legCodeValue.toLowerCase().includes(search) || legArticleValue.toLowerCase().includes(search);
                if (!textMatch && !idMatch && !legMatch && !catMatch) return;
            }

            count++;
            lastVisibleQuestionIds.push(doc.id);
            filteredQuestions.push({ id: doc.id, ...d });
            const tr = document.createElement('tr');
            const isSelected = selectedQuestionIds.has(doc.id);
            const statusBadge = d.isActive === false
                ? '<span class="badge badge-status-inactive">Pasif</span>'
                : '<span class="badge badge-status-active">Aktif</span>';
            const flaggedBadge = d.isFlaggedForReview
                ? '<span class="badge badge-status-flagged">İncelenecek</span>'
                : '';
            const legLabel = hasLegislation
                ? `${legCodeValue || '-'} / Md.${legArticleValue || '-'}`
                : 'Mevzuat Yok';
            tr.innerHTML = `
                <td><input type="checkbox" class="question-select" data-id="${doc.id}" ${isSelected ? 'checked' : ''}></td>
                <td><small class="text-muted">${doc.id.substring(0, 5)}</small></td>
                <td>
                    <div class="fw-bold">${d.category || '-'}</div>
                    <small class="text-muted">${legLabel}</small>
                </td>
                <td title="${d.text}">${(d.text || '').substring(0, 60)}...</td>
                <td><span class="badge bg-light text-dark border">${d.type === 'oncullu' ? 'Öncüllü' : 'Std'}</span></td>
                <td>
                    <div class="d-flex flex-column gap-1">
                        ${statusBadge}
                        ${flaggedBadge}
                    </div>
                </td>
                <td>
                    <div class="question-actions">
                        <button class="btn btn-sm btn-primary" title="Soruyu düzenle" onclick="window.QuestionBank.openEditor('${doc.id}')">✏️</button>
                        <button class="btn btn-sm btn-outline-secondary" title="${d.isActive === false ? 'Aktifleştir' : 'Pasife al'}" onclick="window.toggleQuestionActive('${doc.id}', ${d.isActive === false})">${d.isActive === false ? '▶️' : '⏸️'}</button>
                        <button class="btn btn-sm btn-danger" title="Çöp kutusuna taşı" onclick="window.softDeleteQuestion('${doc.id}')">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (count === 0) tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4">Kriterlere uygun soru bulunamadı.</td></tr>';

        selectedQuestionIds.forEach(id => {
            if (!lastVisibleQuestionIds.includes(id)) selectedQuestionIds.delete(id);
        });

        bindRowSelection();
        updateSelectionUI();

    } catch (e) { console.error(e); }
}

function exportFilteredQuestions(format) {
    if (!filteredQuestions.length) {
        showToast("İndirilecek soru bulunamadı. Önce filtreleme yapın.", "warning");
        return;
    }

    const rows = filteredQuestions.map((question) => {
        const options = (question.options || []).reduce((acc, opt) => {
            acc[opt.id] = opt.text;
            return acc;
        }, {});
        return {
            id: question.id,
            category: question.category || '',
            difficulty: question.difficulty ?? '',
            type: question.type || '',
            text: question.text || '',
            options: ['A', 'B', 'C', 'D', 'E']
                .map((key) => `${key}: ${options[key] || ''}`)
                .join(' | '),
            correctOption: question.correctOption || '',
            legislationCode: question.legislationRef?.code || '',
            legislationArticle: question.legislationRef?.article || '',
            solutionAnaliz: question.solution?.analiz || '',
            solutionDayanak: question.solution?.dayanakText || '',
            solutionHap: question.solution?.hap || '',
            solutionTuzak: question.solution?.tuzak || '',
            status: question.isActive === false ? 'inactive' : 'active',
            flagged: question.isFlaggedForReview ? 'flagged' : '',
            createdAt: formatTimestamp(question.createdAt),
            updatedAt: formatTimestamp(question.updatedAt)
        };
    });

    if (format === 'json') {
        const json = JSON.stringify(rows, null, 2);
        downloadFile(json, buildExportFilename('json'), 'application/json;charset=utf-8');
        showToast("JSON indiriliyor...", "success");
        return;
    }

    const csv = toCsv(rows);
    downloadFile(csv, buildExportFilename('csv'), 'text/csv;charset=utf-8');
    showToast("Excel (CSV) indiriliyor...", "success");
}

function formatTimestamp(value) {
    if (!value) return '';
    if (value.toDate) return value.toDate().toISOString();
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
    if (value instanceof Date) return value.toISOString();
    return '';
}

function toCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escapeValue = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lines = [
        headers.join(',')
    ];
    rows.forEach((row) => {
        lines.push(headers.map((header) => escapeValue(row[header])).join(','));
    });
    return `\ufeff${lines.join('\n')}`;
}

function buildExportFilename(extension) {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    return `soru-bankasi-${stamp}.${extension}`;
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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

        showToast("Soru başarıyla kaydedildi.", "success");
    } catch (e) {
        showToast(`Kaydetme sırasında hata oluştu: ${e.message}`, "error");
    }
}

// --- YARDIMCI FONKSİYONLAR ---

function bindRowSelection() {
    document.querySelectorAll('.question-select').forEach(el => {
        el.onchange = (event) => {
            const id = event.target.dataset.id;
            if (!id) return;
            if (event.target.checked) {
                selectedQuestionIds.add(id);
            } else {
                selectedQuestionIds.delete(id);
            }
            updateSelectionUI();
        };
    });
}

function toggleSelectAll(checked) {
    if (!lastVisibleQuestionIds.length) return;
    if (checked) {
        lastVisibleQuestionIds.forEach(id => selectedQuestionIds.add(id));
    } else {
        lastVisibleQuestionIds.forEach(id => selectedQuestionIds.delete(id));
    }
    document.querySelectorAll('.question-select').forEach(el => {
        el.checked = checked;
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    const bulkBar = document.getElementById('questionBulkBar');
    const countEl = document.getElementById('selectedCount');
    const selectAll = document.getElementById('selectAllQuestions');
    const selectAllHead = document.getElementById('selectAllQuestionsHead');
    const selectedCount = selectedQuestionIds.size;
    const visibleCount = lastVisibleQuestionIds.length;
    const allSelected = visibleCount > 0 && lastVisibleQuestionIds.every(id => selectedQuestionIds.has(id));
    const noneSelected = lastVisibleQuestionIds.every(id => !selectedQuestionIds.has(id));

    if (countEl) countEl.innerText = selectedCount.toString();
    if (bulkBar) bulkBar.style.display = selectedCount > 0 ? 'flex' : 'none';
    if (selectAll) {
        selectAll.checked = allSelected;
        selectAll.indeterminate = !allSelected && !noneSelected && selectedCount > 0;
    }
    if (selectAllHead) {
        selectAllHead.checked = allSelected;
        selectAllHead.indeterminate = !allSelected && !noneSelected && selectedCount > 0;
    }
}

async function runBulkUpdate(updatePayload, toastMessage) {
    if (selectedQuestionIds.size === 0) {
        showToast("Önce işlem yapmak istediğiniz soruları seçin.", "warning");
        return;
    }

    const shouldProceed = await showConfirm("Seçili sorular için toplu işlem yapmak istediğinize emin misiniz?", {
        title: "Toplu İşlem",
        confirmText: "Devam Et",
        cancelText: "Vazgeç"
    });
    if (!shouldProceed) return;

    const ids = Array.from(selectedQuestionIds);
    const chunks = [];
    while (ids.length) chunks.push(ids.splice(0, 450));

    try {
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(id => {
                batch.update(doc(db, "questions", id), {
                    ...updatePayload,
                    updatedAt: serverTimestamp()
                });
            });
            await batch.commit();
        }
        selectedQuestionIds.clear();
        loadQuestions();
        showToast(toastMessage, "success");
    } catch (e) {
        showToast(`Toplu işlem sırasında hata oluştu: ${e.message}`, "error");
    }
}

async function bulkSoftDelete() {
    if (selectedQuestionIds.size === 0) {
        showToast("Önce silinecek soruları seçin.", "warning");
        return;
    }

    const shouldDelete = await showConfirm("Seçili sorular çöp kutusuna taşınacak. Emin misiniz?", {
        title: "Toplu Çöp Kutusu",
        confirmText: "Taşı",
        cancelText: "Vazgeç"
    });
    if (!shouldDelete) return;

    const ids = Array.from(selectedQuestionIds);
    const chunks = [];
    while (ids.length) chunks.push(ids.splice(0, 450));

    try {
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(id => {
                batch.update(doc(db, "questions", id), {
                    isDeleted: true,
                    isActive: false,
                    deletedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });
            await batch.commit();
        }
        selectedQuestionIds.clear();
        loadQuestions();
        showToast("Seçili sorular çöp kutusuna taşındı.", "success");
    } catch (e) {
        showToast(`Toplu işlem sırasında hata oluştu: ${e.message}`, "error");
    }
}

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

async function toggleQuestionActive(id, isActivate) {
    try {
        await updateDoc(doc(db, "questions", id), {
            isActive: isActivate,
            updatedAt: serverTimestamp()
        });
        loadQuestions();
        showToast(isActivate ? "Soru aktifleştirildi." : "Soru pasife alındı.", "success");
    } catch (e) {
        showToast(`İşlem sırasında hata oluştu: ${e.message}`, "error");
    }
}

// --- ÇÖP KUTUSU ---

async function softDeleteQuestion(id) {
    const shouldDelete = await showConfirm("Bu soruyu çöp kutusuna taşımak istediğinize emin misiniz?", {
        title: "Soruyu Taşı",
        confirmText: "Çöp Kutusuna Taşı",
        cancelText: "Vazgeç"
    });
    if (!shouldDelete) return;

    try {
        await updateDoc(doc(db, "questions", id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            isActive: false
        });
        loadQuestions();
        showToast("Soru çöp kutusuna taşındı.", "success");
    } catch (e) {
        showToast(`İşlem sırasında hata oluştu: ${e.message}`, "error");
    }
}

async function openTrashModal() {
    const modal = document.getElementById('questionTrashModal');
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
    const shouldDelete = await showConfirm("Bu işlem geri alınamaz. Soru veritabanından tamamen silinecek.", {
        title: "Kalıcı Silme",
        confirmText: "Kalıcı Olarak Sil",
        cancelText: "Vazgeç",
        tone: "error"
    });
    if (!shouldDelete) return;

    await deleteDoc(doc(db, "questions", id));
    openTrashModal();
    showToast("Soru kalıcı olarak silindi.", "success");
}
