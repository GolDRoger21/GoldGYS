/* DOSYA: public/js/modules/admin/content.js */

import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import {
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let isEditorInitialized = false;
let currentOnculler = [];
const selectedQuestionIds = new Set();
let lastVisibleQuestionIds = [];
let filteredQuestions = [];
let duplicateInsightsById = new Map();
let currentPage = 1;

const QUESTIONS_PER_PAGE = 25;

const DUPLICATE_SETTINGS = {
    exactMinLength: 25,
    nearSimilarityThreshold: 0.86,
    longTextTokenBonusThreshold: 18
};

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
    if (!container) return;

    container.innerHTML = `
        <style>
            .compact-btn {
                padding: 0.5rem 0.9rem;
                font-size: 0.9rem;
                border-radius: 10px;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.2s;
            }
            .compact-btn:hover {
                transform: translateY(-1px);
            }
            .question-filter-card {
                border-radius: 16px;
                border: 1px solid var(--border-color);
                background: var(--bg-surface-elevated);
            }
            [data-theme="dark"] .question-filter-card,
            .dark-mode .question-filter-card {
                border-color: var(--border-color);
                background: var(--bg-surface-elevated);
            }
            .question-filter-head {
                padding: 1rem 1.1rem;
                border-bottom: 1px solid var(--border-color);
            }
            [data-theme="dark"] .question-filter-head,
            .dark-mode .question-filter-head {
                border-bottom-color: var(--border-color);
            }
            .question-filter-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 0.5rem;
            }
            .question-filter-actions .btn {
                white-space: nowrap;
            }
            .filter-module {
                border-radius: 14px;
                border: 1px solid var(--border-color);
                background: var(--bg-surface);
                padding: 0.95rem;
                height: 100%;
                box-shadow: none;
            }
            [data-theme="dark"] .filter-module,
            .dark-mode .filter-module {
                border-color: var(--border-color);
                background: var(--bg-surface);
                box-shadow: none;
            }
            .filter-module-title {
                font-size: 0.74rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                margin-bottom: 0.7rem;
                color: var(--heading-color);
            }
            .question-filter-card h5,
            .question-filter-card .form-label {
                color: var(--text-main);
            }
            .question-filter-card .text-muted {
                color: var(--text-muted) !important;
            }
            .question-filter-card .form-label {
                font-size: 0.72rem;
                font-weight: 700;
                letter-spacing: 0.02em;
                margin-bottom: 0.3rem;
            }
            .question-filter-card .form-control,
            .question-filter-card .form-select {
                min-height: 42px;
                border-radius: 10px;
            }
            .pagination-panel {
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 0.6rem 0.85rem;
                background: var(--bg-surface);
            }
            [data-theme="dark"] .pagination-panel,
            .dark-mode .pagination-panel {
                border-color: var(--border-color);
                background: var(--bg-surface);
            }
            @media (max-width: 991.98px) {
                .question-filter-head {
                    flex-direction: column;
                    align-items: stretch !important;
                }
                .question-filter-actions {
                    width: 100%;
                }
            }
            @media (max-width: 767.98px) {
                .section-header {
                    flex-direction: column;
                    align-items: stretch !important;
                    gap: 0.75rem;
                }
                .section-header > div:last-child {
                    display: grid !important;
                    grid-template-columns: 1fr 1fr;
                }
                .question-filter-actions {
                    grid-template-columns: 1fr;
                }
                .question-filter-card .p-3 {
                    padding: 0.95rem !important;
                }
                .pagination-panel {
                    flex-direction: column;
                    align-items: flex-start !important;
                }
            }
        </style>

        <div class="section-header mb-3" style="border-bottom:none; padding-bottom:0;">
            <div>
                <h2 class="m-0" style="font-size:1.5rem;">📚 Soru Bankası</h2>
            </div>
            <div class="d-flex gap-2">
                 <button class="btn btn-warning compact-btn" onclick="window.openTrashModal()">🗑️ Çöp</button>
                 <button id="btnNewQuestion" class="btn btn-primary compact-btn">➕ Yeni Soru</button>
            </div>
        </div>

        <div class="card mb-4 border-0 shadow-sm question-filter-card">
            <div class="question-filter-head d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                    <h5 class="mb-1">Filtreler</h5>
                </div>
                <div class="question-filter-actions">
                    <button id="btnFilter" class="btn btn-secondary">Ara / Filtrele</button>
                    <button id="btnResetFilters" class="btn btn-outline-secondary">Temizle</button>
                    <button id="btnExportJson" class="btn btn-outline-success">JSON İndir</button>
                    <button id="btnExportExcel" class="btn btn-outline-success">Excel (CSV) İndir</button>
                </div>
            </div>

            <div class="p-3">
                <div class="row g-3">
                    <div class="col-12">
                        <div class="filter-module">
                            <div class="filter-module-title">Temel Filtreler</div>
                            <div class="row g-2 align-items-end">
                                <div class="col-xxl-5 col-xl-4 col-lg-6">
                                    <label class="form-label small fw-bold text-muted">GENEL ARAMA</label>
                                    <input type="text" id="searchQuestion" class="form-control" placeholder="Soru metni, ID, kategori veya mevzuat ara...">
                                </div>
                                <div class="col-xxl-3 col-xl-3 col-lg-6">
                                    <label class="form-label small fw-bold text-muted">KATEGORİ</label>
                                    <select id="filterCategory" class="form-select">
                                        <option value="">Tüm Kategoriler</option>
                                    </select>
                                </div>
                                <div class="col-xxl-2 col-xl-2 col-md-6">
                                    <label class="form-label small fw-bold text-muted">DURUM</label>
                                    <select id="filterStatus" class="form-select">
                                        <option value="active">✅ Aktif</option>
                                        <option value="inactive">⏸️ Pasif</option>
                                        <option value="flagged">⚠️ İncelenecek</option>
                                        <option value="all">📌 Tümü</option>
                                    </select>
                                </div>
                                <div class="col-xxl-2 col-xl-3 col-md-6">
                                    <label class="form-label small fw-bold text-muted">SORU TİPİ</label>
                                    <select id="filterType" class="form-select">
                                        <option value="all">Tümü</option>
                                        <option value="standard">Standart</option>
                                        <option value="oncullu">Öncüllü</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-xl-6">
                        <div class="filter-module">
                            <div class="filter-module-title">İçerik ve Sıralama</div>
                            <div class="row g-2 align-items-end">
                                <div class="col-md-4">
                                    <label class="form-label small fw-bold text-muted">ZORLUK</label>
                                    <select id="filterDifficulty" class="form-select">
                                        <option value="all">Tümü</option>
                                        <option value="1">1 - Çok Kolay</option>
                                        <option value="2">2 - Kolay</option>
                                        <option value="3">3 - Orta</option>
                                        <option value="4">4 - Zor</option>
                                        <option value="5">5 - Çok Zor</option>
                                    </select>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small fw-bold text-muted">SIRALAMA</label>
                                    <select id="filterSort" class="form-select">
                                        <option value="createdDesc">En Yeni</option>
                                        <option value="createdAsc">En Eski</option>
                                        <option value="articleAsc">Madde No (Artan)</option>
                                        <option value="articleDesc">Madde No (Azalan)</option>
                                        <option value="difficultyAsc">Zorluk (Kolay→Zor)</option>
                                        <option value="difficultyDesc">Zorluk (Zor→Kolay)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-xl-6">
                        <div class="filter-module">
                            <div class="filter-module-title">Mevzuat ve Mükerrer</div>
                            <div class="row g-2 align-items-end">
                                <div class="col-md-4">
                                    <label class="form-label small fw-bold text-muted">MEVZUAT DURUMU</label>
                                    <select id="filterLegMode" class="form-select">
                                        <option value="all">Tümü</option>
                                        <option value="with">Mevzuatlı</option>
                                        <option value="without">Mevzuatsız</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label small fw-bold text-muted">KANUN NO</label>
                                    <input type="text" id="filterLegCode" class="form-control" placeholder="Örn: 5271">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label small fw-bold text-muted">MADDE NO</label>
                                    <input type="text" id="filterLegArticle" class="form-control" placeholder="Örn: 12">
                                </div>
                                <div class="col-md-12">
                                    <label class="form-label small fw-bold text-muted">MÜKERRER FİLTRE</label>
                                    <select id="filterDuplicateMode" class="form-select">
                                        <option value="all">Tümü</option>
                                        <option value="exact">Kesin Mükerrer</option>
                                        <option value="near">Olası Mükerrer</option>
                                        <option value="any">Tüm Mükerrer Adayları</option>
                                        <option value="clean">Mükerrer Olmayan</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="users-bulk-bar mb-3" id="questionBulkBar" style="display:none; background:rgba(var(--primary-rgb), 0.05); border:1px solid rgba(var(--primary-rgb), 0.2);">
            <label class="users-select-all me-3">
                <input type="checkbox" id="selectAllQuestions">
                <span><strong id="selectedCount">0</strong> Seçildi</span>
            </label>
            <div class="users-bulk-actions gap-2">
                <button class="btn btn-outline-primary btn-sm" id="bulkActivate">Aktifleştir</button>
                <button class="btn btn-outline-warning btn-sm" id="bulkDeactivate">Pasife Al</button>
                <button class="btn btn-outline-danger btn-sm" id="bulkDelete">Sil</button>
            </div>
        </div>

        <div class="card p-0 border-0 shadow-sm overflow-hidden" style="border-radius:12px;">
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
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3 pagination-panel" id="questionPaginationContainer">
            <div class="small text-muted" id="questionPaginationInfo">Toplam 0 soru</div>
            <div class="d-flex align-items-center gap-2">
                <button class="btn btn-sm btn-outline-secondary" id="questionPrevPage">← Önceki</button>
                <span class="small" id="questionPageIndicator">Sayfa 1 / 1</span>
                <button class="btn btn-sm btn-outline-secondary" id="questionNextPage">Sonraki →</button>
            </div>
        </div>
        
        <!-- Trash Modal (Hidden) -->
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

    ensureQuestionEditorReady();
    bindPageEvents();
}

function bindPageEvents() {
    const btnNew = document.getElementById('btnNewQuestion');
    const btnFilter = document.getElementById('btnFilter');
    const btnResetFilters = document.getElementById('btnResetFilters');
    const btnExportJson = document.getElementById('btnExportJson');
    const btnExportExcel = document.getElementById('btnExportExcel');
    const selectAll = document.getElementById('selectAllQuestions');
    const selectAllHead = document.getElementById('selectAllQuestionsHead');
    const bulkActivate = document.getElementById('bulkActivate');
    const bulkDeactivate = document.getElementById('bulkDeactivate');
    const bulkDelete = document.getElementById('bulkDelete');
    const prevPageBtn = document.getElementById('questionPrevPage');
    const nextPageBtn = document.getElementById('questionNextPage');

    if (btnNew) btnNew.onclick = () => openQuestionEditor();
    if (btnFilter) btnFilter.onclick = loadQuestions;
    if (btnResetFilters) btnResetFilters.onclick = resetQuestionFilters;
    if (btnExportJson) btnExportJson.onclick = () => exportFilteredQuestions('json');
    if (btnExportExcel) btnExportExcel.onclick = () => exportFilteredQuestions('excel');
    if (selectAll) selectAll.onchange = (e) => toggleSelectAll(e.target.checked);
    if (selectAllHead) selectAllHead.onchange = (e) => toggleSelectAll(e.target.checked);
    if (bulkActivate) bulkActivate.onclick = () => runBulkUpdate({ isActive: true, isDeleted: false }, "Seçilen sorular aktifleştirildi.");
    if (bulkDeactivate) bulkDeactivate.onclick = () => runBulkUpdate({ isActive: false }, "Seçilen sorular pasife alındı.");
    if (bulkDelete) bulkDelete.onclick = () => bulkSoftDelete();
    if (prevPageBtn) prevPageBtn.onclick = () => changeQuestionPage(-1);
    if (nextPageBtn) nextPageBtn.onclick = () => changeQuestionPage(1);

    ['searchQuestion', 'filterCategory', 'filterStatus', 'filterType', 'filterDifficulty', 'filterSort', 'filterLegMode', 'filterDuplicateMode']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => loadQuestions());
        });

    ['searchQuestion', 'filterLegCode', 'filterLegArticle'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                loadQuestions();
            }
        });
    });

    window.removeOnculInternal = removeOncul;
    window.openTrashModal = openTrashModal;
    window.restoreQuestion = restoreQuestion;
    window.permanentDeleteQuestion = permanentDeleteQuestion;
    window.softDeleteQuestion = softDeleteQuestion;
    window.toggleQuestionActive = toggleQuestionActive;
}

function resetQuestionFilters() {
    const defaults = {
        searchQuestion: '',
        filterCategory: '',
        filterStatus: 'active',
        filterType: 'all',
        filterDifficulty: 'all',
        filterSort: 'createdDesc',
        filterLegMode: 'all',
        filterLegCode: '',
        filterLegArticle: '',
        filterDuplicateMode: 'all'
    };

    Object.entries(defaults).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });

    loadQuestions();
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
    const duplicateMode = document.getElementById('filterDuplicateMode')?.value || 'all';
    const questionType = document.getElementById('filterType')?.value || 'all';
    const difficulty = document.getElementById('filterDifficulty')?.value || 'all';
    const sortMode = document.getElementById('filterSort')?.value || 'createdDesc';

    // Temel Sorgu
    let q = query(collection(db, "questions"), orderBy("createdAt", "desc"));

    try {
        const snap = await getDocs(q);
        lastVisibleQuestionIds = [];
        filteredQuestions = [];
        currentPage = 1;

        const candidates = [];
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
            if (questionType !== 'all' && (d.type || 'standard') !== questionType) return;
            if (difficulty !== 'all' && String(d.difficulty ?? '') !== difficulty) return;

            candidates.push({ id: doc.id, ...d });
        });

        duplicateInsightsById = buildDuplicateInsights(candidates);

        candidates.forEach((d) => {
            const legRef = d.legislationRef || {};
            const legCodeValue = (legRef.code || '').toString();
            const legArticleValue = (legRef.article || '').toString();
            const hasLegislation = Boolean(legCodeValue || legArticleValue);
            const info = duplicateInsightsById.get(d.id) || buildEmptyDuplicateInsight();

            if (duplicateMode === 'exact' && !info.isExactDuplicate) return;
            if (duplicateMode === 'near' && !info.isNearDuplicate) return;
            if (duplicateMode === 'any' && !info.hasDuplicateRisk) return;
            if (duplicateMode === 'clean' && info.hasDuplicateRisk) return;

            // Arama check
            if (search) {
                const textMatch = (d.text || '').toLowerCase().includes(search);
                const idMatch = d.id.toLowerCase().includes(search);
                const catMatch = (d.category || '').toLowerCase().includes(search);
                const legMatch = legCodeValue.toLowerCase().includes(search) || legArticleValue.toLowerCase().includes(search);
                if (!textMatch && !idMatch && !legMatch && !catMatch) return;
            }

            filteredQuestions.push({ ...d, duplicateInsight: info });
        });

        sortQuestions(sortMode);

        if (filteredQuestions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4">Kriterlere uygun soru bulunamadı.</td></tr>';
        } else {
            renderQuestionRows();
        }

        selectedQuestionIds.forEach(id => {
            if (!filteredQuestions.some(question => question.id === id)) selectedQuestionIds.delete(id);
        });

        renderQuestionPagination();
        updateSelectionUI();

    } catch (e) { console.error(e); }
}

function sortQuestions(sortMode) {
    const getCreatedAt = (question) => {
        const created = question.createdAt;
        if (created?.toDate) return created.toDate().getTime();
        if (typeof created?.seconds === 'number') return created.seconds * 1000;
        return 0;
    };
    const getArticleNumber = (question) => {
        const raw = String(question.legislationRef?.article || '').trim();
        const match = raw.match(/\d+/);
        return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
    };

    filteredQuestions.sort((a, b) => {
        if (sortMode === 'createdAsc') return getCreatedAt(a) - getCreatedAt(b);
        if (sortMode === 'createdDesc') return getCreatedAt(b) - getCreatedAt(a);
        if (sortMode === 'articleAsc') return getArticleNumber(a) - getArticleNumber(b);
        if (sortMode === 'articleDesc') return getArticleNumber(b) - getArticleNumber(a);
        if (sortMode === 'difficultyAsc') return (a.difficulty || 0) - (b.difficulty || 0);
        if (sortMode === 'difficultyDesc') return (b.difficulty || 0) - (a.difficulty || 0);
        return 0;
    });
}

function renderQuestionRows() {
    const tbody = document.getElementById('questionsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const startIndex = (currentPage - 1) * QUESTIONS_PER_PAGE;
    const currentRows = filteredQuestions.slice(startIndex, startIndex + QUESTIONS_PER_PAGE);
    lastVisibleQuestionIds = currentRows.map((item) => item.id);

    currentRows.forEach((d) => {
        const legRef = d.legislationRef || {};
        const legCodeValue = (legRef.code || '').toString();
        const legArticleValue = (legRef.article || '').toString();
        const hasLegislation = Boolean(legCodeValue || legArticleValue);
        const info = d.duplicateInsight || buildEmptyDuplicateInsight();
        const tr = document.createElement('tr');
        const isSelected = selectedQuestionIds.has(d.id);
        const statusBadge = d.isActive === false
            ? '<span class="badge badge-status-inactive">Pasif</span>'
            : '<span class="badge badge-status-active">Aktif</span>';
        const flaggedBadge = d.isFlaggedForReview
            ? '<span class="badge badge-status-flagged">İncelenecek</span>'
            : '';
        const duplicateBadge = info.isExactDuplicate
            ? `<span class="badge bg-danger-subtle text-danger border">Mükerrer (${info.exactCount})</span>`
            : info.isNearDuplicate
                ? `<span class="badge bg-warning-subtle text-warning border">Olası Mükerrer (${info.nearCount})</span>`
                : '';
        const legLabel = hasLegislation
            ? `${legCodeValue || '-'} / Md.${legArticleValue || '-'}`
            : 'Mevzuat Yok';

        tr.innerHTML = `
            <td><input type="checkbox" class="question-select" data-id="${d.id}" ${isSelected ? 'checked' : ''}></td>
            <td><small class="text-muted">${d.id.substring(0, 5)}</small></td>
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
                    ${duplicateBadge}
                </div>
            </td>
            <td>
                <div class="question-actions">
                    <button class="btn btn-sm btn-primary" title="Soruyu düzenle" onclick="window.QuestionBank.openEditor('${d.id}')">✏️</button>
                    <button class="btn btn-sm btn-outline-secondary" title="${d.isActive === false ? 'Aktifleştir' : 'Pasife al'}" onclick="window.toggleQuestionActive('${d.id}', ${d.isActive === false})">${d.isActive === false ? '▶️' : '⏸️'}</button>
                    <button class="btn btn-sm btn-danger" title="Çöp kutusuna taşı" onclick="window.softDeleteQuestion('${d.id}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    bindRowSelection();
    updateSelectionUI();
}

function renderQuestionPagination() {
    const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE));
    const infoEl = document.getElementById('questionPaginationInfo');
    const pageEl = document.getElementById('questionPageIndicator');
    const prevBtn = document.getElementById('questionPrevPage');
    const nextBtn = document.getElementById('questionNextPage');

    if (infoEl) infoEl.textContent = `Toplam ${filteredQuestions.length} soru • Sayfa başına ${QUESTIONS_PER_PAGE}`;
    if (pageEl) pageEl.textContent = `Sayfa ${currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function changeQuestionPage(direction) {
    const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE));
    const nextPage = currentPage + direction;
    if (nextPage < 1 || nextPage > totalPages) return;
    currentPage = nextPage;
    renderQuestionRows();
    renderQuestionPagination();
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
            exactDuplicateCount: question.duplicateInsight?.exactCount || 0,
            nearDuplicateCount: question.duplicateInsight?.nearCount || 0,
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
        const duplicates = await findPotentialDuplicatesForQuestion(data, id);
        if (duplicates.hasDuplicateRisk) {
            const shouldContinue = await showConfirm(
                `Bu soru mükerrer olabilir. ${duplicates.summary}\nYine de kaydetmek istiyor musunuz?`,
                {
                    title: "Mükerrer Kontrol Uyarısı",
                    confirmText: "Yine de Kaydet",
                    cancelText: "Düzenlemeye Dön"
                }
            );
            if (!shouldContinue) return;
        }

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

function normalizeQuestionText(value = '') {
    const turkishMap = { 'ı': 'i', 'İ': 'i', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ş': 's', 'Ş': 's', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };
    const ascii = String(value)
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, ch => turkishMap[ch] || ch)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');

    return ascii
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildQuestionSignature(question) {
    const normalizedText = normalizeQuestionText(question.text || '');
    const optionText = (question.options || [])
        .map(opt => normalizeQuestionText(opt?.text || ''))
        .filter(Boolean)
        .sort()
        .join(' | ');
    const lawCode = normalizeQuestionText(question.legislationRef?.code || '');
    const lawArticle = normalizeQuestionText(question.legislationRef?.article || '');

    return {
        normalizedText,
        tokenSet: new Set(normalizedText.split(' ').filter(token => token.length > 2)),
        exactKey: [normalizedText, optionText, question.correctOption || '', lawCode, lawArticle].join('::')
    };
}

function computeTokenSimilarity(setA, setB) {
    if (!setA.size || !setB.size) return 0;
    let intersection = 0;
    setA.forEach(token => {
        if (setB.has(token)) intersection++;
    });
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function buildEmptyDuplicateInsight() {
    return {
        isExactDuplicate: false,
        isNearDuplicate: false,
        hasDuplicateRisk: false,
        exactCount: 0,
        nearCount: 0,
        nearMatches: []
    };
}

function buildDuplicateInsights(questions = []) {
    const results = new Map();
    const signatures = questions.map(q => ({ id: q.id, ...buildQuestionSignature(q) }));

    questions.forEach(q => results.set(q.id, buildEmptyDuplicateInsight()));

    const exactMap = new Map();
    signatures.forEach(sig => {
        if (!sig.normalizedText || sig.normalizedText.length < DUPLICATE_SETTINGS.exactMinLength) return;
        if (!exactMap.has(sig.exactKey)) exactMap.set(sig.exactKey, []);
        exactMap.get(sig.exactKey).push(sig.id);
    });

    exactMap.forEach(ids => {
        if (ids.length < 2) return;
        ids.forEach(id => {
            const entry = results.get(id);
            entry.isExactDuplicate = true;
            entry.hasDuplicateRisk = true;
            entry.exactCount = ids.length - 1;
        });
    });

    for (let i = 0; i < signatures.length; i++) {
        for (let j = i + 1; j < signatures.length; j++) {
            const left = signatures[i];
            const right = signatures[j];
            if (!left.normalizedText || !right.normalizedText) continue;

            const similarity = computeTokenSimilarity(left.tokenSet, right.tokenSet);
            const dynamicThreshold = Math.max(
                DUPLICATE_SETTINGS.nearSimilarityThreshold - (Math.min(left.tokenSet.size, right.tokenSet.size) >= DUPLICATE_SETTINGS.longTextTokenBonusThreshold ? 0.03 : 0),
                0.8
            );
            if (similarity < dynamicThreshold) continue;

            const leftEntry = results.get(left.id);
            const rightEntry = results.get(right.id);
            leftEntry.isNearDuplicate = true;
            rightEntry.isNearDuplicate = true;
            leftEntry.hasDuplicateRisk = true;
            rightEntry.hasDuplicateRisk = true;
            leftEntry.nearMatches.push({ id: right.id, score: similarity });
            rightEntry.nearMatches.push({ id: left.id, score: similarity });
        }
    }

    results.forEach((entry) => {
        entry.nearMatches.sort((a, b) => b.score - a.score);
        entry.nearCount = entry.nearMatches.length;
    });

    return results;
}

async function findPotentialDuplicatesForQuestion(questionData, editId = null) {
    const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'), limit(400));
    const snap = await getDocs(q);
    const existing = [];
    snap.forEach((item) => {
        if (item.id === editId) return;
        if (item.data()?.isDeleted === true) return;
        existing.push({ id: item.id, ...item.data() });
    });

    const tempId = '__draft__';
    const insights = buildDuplicateInsights([...existing, { id: tempId, ...questionData }]);
    const draft = insights.get(tempId) || buildEmptyDuplicateInsight();

    const topNear = (draft.nearMatches || []).slice(0, 3).map(match => `${match.id.slice(0, 6)} (%${Math.round(match.score * 100)})`);
    const summaryParts = [];
    if (draft.isExactDuplicate) summaryParts.push(`Kesin mükerrer adedi: ${draft.exactCount}`);
    if (draft.isNearDuplicate) summaryParts.push(`Olası mükerrer adedi: ${draft.nearCount}${topNear.length ? ` [${topNear.join(', ')}]` : ''}`);

    return {
        hasDuplicateRisk: draft.hasDuplicateRisk,
        summary: summaryParts.join(' | ')
    };
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
        const [topicSnapshot, questionsSnapshot] = await Promise.all([
            getDocs(query(collection(db, "topics"), orderBy("title", "asc"))),
            getDocs(query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(1500)))
        ]);

        const categorySet = new Set();

        topicSnapshot.forEach((item) => {
            const title = (item.data()?.title || '').trim();
            if (title) categorySet.add(title);
        });

        questionsSnapshot.forEach((item) => {
            const data = item.data() || {};
            if (data.isDeleted === true) return;
            const title = (data.category || '').trim();
            if (title) categorySet.add(title);
        });

        const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'tr'));

        if (filterSelect) filterSelect.innerHTML = '<option value="">Tüm Kategoriler</option>';
        if (dataList) dataList.innerHTML = '';

        categories.forEach((category) => {
            if (filterSelect) {
                const opt = document.createElement('option');
                opt.value = category;
                opt.innerText = category;
                filterSelect.appendChild(opt);
            }

            if (dataList) {
                const listOpt = document.createElement('option');
                listOpt.value = category;
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
