import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import { collection, writeBatch, doc, serverTimestamp, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";

// Hukuk terimleri için eş anlamlılar ve düzeltmeler
const SYNONYMS = {
    "nolu": "sayili",
    "no": "sayili",
    "cb": "cumhurbaskanligi",
    "cbk": "cumhurbaskanligi kararnamesi",
    "kHK": "kanun hukmunde kararname",
    "tbmm": "turkiye buyuk millet meclisi",
    "tck": "turk ceza kanunu",
    "cmk": "ceza muhakemesi kanunu",
    "tmk": "turk medeni kanunu",
    "tbk": "turk borclar kanunu",
    "iyuk": "idari yargilama usulu kanunu",
    "av": "avukatlik",
    "huk": "hukuk",
    "yarg": "yargitay",
    "dan": "danistay",
    "aym": "anayasa mahkemesi",
    "khk": "kanun hukmunde kararname"
};

const SMART_MATCH_THRESHOLDS = {
    high: 0.78,
    low: 0.55,
    minMargin: 0.08
};

const STOPWORDS = new Set([
    "ve", "veya", "ile", "ama", "fakat", "ancak", "yalniz", "yalnız", "icin", "için", "olarak",
    "ile", "bir", "birisi", "birkaç", "bu", "su", "şu", "o", "de", "da", "mi", "mı", "mu", "mü",
    "ne", "neden", "nasil", "nasıl", "hangi", "kac", "kaç", "kim", "kime", "kimin", "kadar",
    "her", "hic", "hiç", "gibi", "olan", "olanlar", "olanin", "olar", "olur", "olabilir",
    "ayni", "aynı", "tanim", "tanimi", "tanımı", "yukumluluk", "yükümlülük"
]);

const LAW_CODE_KEYWORDS = {
    "5237": ["turk ceza kanunu", "tck"],
    "5271": ["ceza muhakemesi kanunu", "cmk"],
    "4721": ["turk medeni kanunu", "tmk"],
    "6098": ["turk borclar kanunu", "tbk"],
    "2577": ["idari yargilama usulu kanunu", "iyuk"],
    "6100": ["hukuk muhakemeleri kanunu", "hmk"],
    "1136": ["avukatlik kanunu", "avukatlik"]
};

const LAW_ABBREV_MAP = {
    "tck": "5237",
    "cmk": "5271",
    "tmk": "4721",
    "tbk": "6098",
    "iyuk": "2577",
    "hmk": "6100",
    "avk": "1136"
};

const CATEGORY_REWRITES = [
    { pattern: /\bkararnamesi\b/g, replace: "kararname" },
    { pattern: /\bkararnameleri\b/g, replace: "kararname" },
    { pattern: /\bkanunu\b/g, replace: "kanun" },
    { pattern: /\bkanunlari\b/g, replace: "kanun" },
    { pattern: /\bmahkemesi\b/g, replace: "mahkeme" },
    { pattern: /\bmahkemeleri\b/g, replace: "mahkeme" },
    { pattern: /\bsegbis\b/g, replace: "ses ve goruntu bilisim sistemi" }
];

export function initImporterPage() {
    const container = document.getElementById('section-importer');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📥 Toplu Soru Yükleme</h2>
                <p class="text-muted">Excel veya JSON dosyasından binlerce soruyu tek seferde yükleyin.</p>
            </div>
            <div class="d-flex gap-2">
                <button onclick="showGuide()" class="btn btn-guide">ℹ️ Format Rehberi</button>
            </div>
        </div>

        <div class="row">
            <div class="col-md-5">
                <div class="card p-5 text-center border-dashed" style="border: 2px dashed var(--border-color); cursor:pointer;" onclick="document.getElementById('fileInput').click()">
                    <div style="font-size: 3rem; margin-bottom: 10px;">📂</div>
                    <h5>Dosya Seç veya Sürükle</h5>
                    <p class="text-muted small">.json (Önerilen) veya .xlsx formatında</p>
                    <input type="file" id="fileInput" accept=".json, .xlsx, .xls" style="display: none;">
                </div>
                
                <div class="card mt-3 bg-dark text-white">
                    <div class="card-header py-2 border-secondary"><small>LOG</small></div>
                    <div id="importLog" class="card-body p-2" style="height: 150px; overflow-y: auto; font-family: monospace; font-size: 0.8rem;">
                        <span class="text-muted">> Hazır...</span>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header py-2"><small>Akıllı Eşleştirme Özeti</small></div>
                    <div class="card-body p-3 small" id="smartSummary">
                        <div class="text-muted">Dosya yüklenince özet burada görünecek.</div>
                    </div>
                </div>
            </div>

            <div class="col-md-7">
                <div class="card h-100" id="previewCard" style="display:none;">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <div>
                            <h5 class="m-0">Önizleme</h5>
                            <small id="previewMeta" class="text-muted">Dosya yüklenince sonuçlar burada görünecek.</small>
                        </div>
                        <button id="btnStartImport" class="btn btn-success btn-sm" disabled>Yüklemeyi Başlat</button>
                    </div>
                    <div class="importer-toolbar">
                    <div class="importer-toolbar__section importer-toolbar__filters">
                        <label class="form-check mb-0">
                            <input type="checkbox" id="selectAllPreview" class="form-check-input">
                            <span class="form-check-label">Görünenleri seç</span>
                        </label>
                        <select id="previewFilter" class="form-select form-select-sm">
                                <option value="all">Tümü</option>
                                <option value="issues">Sorunlu (hata/uyarı)</option>
                                <option value="invalid">Hatalı</option>
                                <option value="needs-review">Kategori onayı gereken</option>
                                <option value="warnings">Uyarılı</option>
                                <option value="auto">Otomatik eşleşen</option>
                                <option value="low-confidence">Tanımsız</option>
                            </select>
                            <select id="previewCategoryFilter" class="form-select form-select-sm">
                                <option value="all">Tüm Kategoriler</option>
                            </select>
                    </div>
                        <div class="importer-toolbar__section importer-toolbar__actions">
                            <button id="btnApplySelectedSuggestions" class="btn btn-outline-warning btn-sm btn-icon importer-action-btn" title="Öneriyi uygula" aria-label="Öneriyi uygula" disabled>
                                <span aria-hidden="true">✨</span>
                            </button>
                            <button id="btnConfirmSelectedCategories" class="btn btn-outline-success btn-sm btn-icon importer-action-btn" title="Kategori doğru" aria-label="Kategori doğru" disabled>
                                <span aria-hidden="true">✅</span>
                            </button>
                            <button id="btnClearSelection" class="btn btn-outline-secondary btn-sm btn-icon importer-action-btn" title="Seçimi temizle" aria-label="Seçimi temizle" disabled>
                                <span aria-hidden="true">🧹</span>
                            </button>
                        </div>
                        <div class="importer-toolbar__section importer-toolbar__status">
                            <span id="previewSelectionInfo" class="badge bg-secondary">0 soru seçili</span>
                        </div>
                    </div>
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="admin-table table-sm">
                            <thead>
                                <tr>
                                    <th style="width: 40px;"></th>
                                    <th style="width: 60px;">#</th>
                                    <th style="min-width: 250px;">Kategori</th>
                                    <th>Soru</th>
                                    <th style="min-width: 160px;">Akıllı Eşleşme</th>
                                    <th>Durum</th>
                                </tr>
                            </thead>
                            <tbody id="previewTableBody"></tbody>
                        </table>
                    </div>
                    <datalist id="categoryListOptions"></datalist>
                </div>
            </div>
        </div>

        <!-- REHBER MODALI -->
        <div id="guideModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                <div class="modal-header">
                    <h3>📋 Veri Hazırlama Rehberi</h3>
                    <button onclick="document.getElementById('guideModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <h5>JSON Formatı (Önerilen)</h5>
                    <p>JSON yüklemesi en sağlıklı yöntemdir. Aşağıdaki format birebir korunmalıdır. Sistem kategori adını otomatik eşleştirir (örn. "Anayasa" → "Türkiye Cumhuriyeti Anayasası").</p>
                    <pre style="background:var(--bg-hover); color:var(--text-main); padding:10px; border-radius:5px; border:1px solid var(--border-color);">
[
  {
    "category": "Anayasa",
    "difficulty": 3,
    "type": "standard",
    "text": "Soru metni...",
    "questionRoot": null,
    "onculler": [],
    "options": [
       {"id": "A", "text": "Cevap A"},
       {"id": "B", "text": "Cevap B"},
       {"id": "C", "text": "Cevap C"},
       {"id": "D", "text": "Cevap D"},
       {"id": "E", "text": "Cevap E"}
    ],
    "correctOption": "A",
    "legislationRef": { "code": "5271", "article": "12" },
    "solution": {
      "analiz": "Detaylı açıklama",
      "dayanakText": "Mevzuat dayanağı",
      "hap": "Hap bilgi",
      "tuzak": "Sınav tuzağı"
    }
  }
]
                    </pre>
                    <h5>Otomatik Eşleştirme & Düzeltmeler</h5>
                    <ul class="text-muted small">
                        <li>Kategori isimleri normalize edilir ve en yakın sistem kategorisi bulunur (kısaltma, büyük/küçük harf ve noktalama hataları düzeltilir).</li>
                        <li>Sistem sadece kategori alanına değil, soru metni + çözüm + mevzuat kodlarına bakarak akıllı eşleştirme yapar.</li>
                        <li>Eşleşme şüpheliyse sistem öneri verir ve kategori doğrulaması ister; kullanıcı seçim yapmadan yükleme yapılamaz.</li>
                        <li>Doğru cevap "A)", "a", "1" gibi formatlarda yazılsa bile A-E şıklarına eşleştirilir.</li>
                        <li>Zorluk değeri 1-5 aralığında değilse otomatik olarak 3 yapılır.</li>
                        <li>Eksik şık veya eksik soru metni varsa ilgili satır önizlemede işaretlenir ve yüklemeye alınmaz.</li>
                    </ul>
                    <h5>Excel Kolonları (Opsiyonel)</h5>
                    <p class="text-muted small mb-2">Excel yüklemesinde aşağıdaki kolon adları desteklenir (Türkçe/İngilizce):</p>
                    <ul class="text-muted small">
                        <li>Kategori / category</li>
                        <li>Soru Metni / text</li>
                        <li>Tip / type</li>
                        <li>Zorluk / difficulty</li>
                        <li>Şıklar: A, B, C, D, E</li>
                        <li>Doğru Cevap / correctOption</li>
                        <li>Kanun No / code, Madde No / article</li>
                        <li>Çözüm Analiz / analiz, Mevzuat Dayanak / dayanak, Hap Bilgi / hap, Sınav Tuzağı / tuzak</li>
                        <li>Öncüller / Onculler (A|B|C şeklinde ayrılabilir)</li>
                    </ul>
                </div>
            </div>
        </div>
    `;

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('btnStartImport').addEventListener('click', startBatchImport);
    document.getElementById('previewFilter').addEventListener('change', validateAndPreview);
    document.getElementById('previewCategoryFilter').addEventListener('change', validateAndPreview);
    document.getElementById('selectAllPreview').addEventListener('change', handleSelectAllToggle);
    document.getElementById('btnApplySelectedSuggestions').addEventListener('click', applySelectedSuggestions);
    document.getElementById('btnConfirmSelectedCategories').addEventListener('click', confirmSelectedCategories);
    document.getElementById('btnClearSelection').addEventListener('click', clearSelectedQuestions);

    ensureCategoryIndex();
}

let parsedQuestions = [];
let categoryIndex = null;
let categoryList = [];
let categoryProfiles = [];
let categoryIndexPromise = null;
let previewFilter = 'all';
let previewCategoryFilter = 'all';

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    log(`Dosya okunuyor: ${file.name}`);
    parsedQuestions = []; // Önceki veriyi temizle

    try {
        if (file.name.endsWith('.json')) {
            // JSON Dosyası İşleme
            const text = await file.text();
            const jsonData = JSON.parse(text);

            if (Array.isArray(jsonData)) {
                parsedQuestions = jsonData.map((q, index) => normalizeQuestionData(q, index));
                log(`JSON'dan ${parsedQuestions.length} soru okundu.`, "success");
            } else {
                throw new Error("JSON dosyası bir dizi (array) içermelidir.");
            }
        } else {
            // Excel Dosyası İşleme
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(firstSheet);
            parsedQuestions = convertExcelData(rawData);
            log(`Excel'den ${parsedQuestions.length} satır okundu.`, "success");
        }

        await ensureCategoryIndex();

        // Datalist'i güncelle
        const datalist = document.getElementById('categoryListOptions');
        if (datalist && categoryList.length) {
            datalist.innerHTML = categoryList.map(cat => `<option value="${cat}">`).join('');
        }

        validateAndPreview();

    } catch (error) {
        console.error(error);
        log(`Hata: ${error.message}`, "error");
    }
}

// Excel Verisini Dönüştürme (Sadece Excel için kullanılır)
function convertExcelData(rawData) {
    return rawData.map((row, index) => {
        // Öncülleri ayır
        let onculler = [];
        if (row['Onculler']) {
            onculler = row['Onculler'].split('|').map(s => s.trim());
        }

        const rawQuestion = {
            category: row['Kategori'] || row['category'] || 'Genel',
            difficulty: parseInt(row['Zorluk'] || row['difficulty']) || 3,
            type: row['Tip'] || row['type'] || 'standard',
            text: row['Soru Metni'] || row['text'],
            questionRoot: row['Soru Koku'] || row['questionRoot'] || null,
            onculler: onculler,

            options: [
                { id: 'A', text: row['A'] || '' },
                { id: 'B', text: row['B'] || '' },
                { id: 'C', text: row['C'] || '' },
                { id: 'D', text: row['D'] || '' },
                { id: 'E', text: row['E'] || '' }
            ],
            correctOption: (row['Doğru Cevap'] || row['correctOption'] || '').toUpperCase(),

            solution: {
                analiz: row['Çözüm Analiz'] || row['analiz'] || '',
                dayanakText: row['Mevzuat Dayanak'] || row['dayanak'] || '',
                hap: row['Hap Bilgi'] || row['hap'] || '',
                tuzak: row['Sınav Tuzağı'] || row['tuzak'] || ''
            },

            legislationRef: {
                code: String(row['Kanun No'] || row['code'] || ''),
                article: String(row['Madde No'] || row['article'] || '')
            }
        };

        return normalizeQuestionData(rawQuestion, index);
    });
}

function normalizeQuestionData(rawQuestion, index = 0) {
    const normalizedOptions = normalizeOptions(rawQuestion.options || []);
    const normalizedCorrectOption = normalizeCorrectOption(rawQuestion.correctOption, normalizedOptions);

    return {
        category: rawQuestion.category || 'Genel',
        difficulty: Number.isFinite(rawQuestion.difficulty) ? rawQuestion.difficulty : 3,
        type: rawQuestion.type || 'standard',
        text: rawQuestion.text || '',
        questionRoot: rawQuestion.questionRoot ?? null,
        onculler: Array.isArray(rawQuestion.onculler) ? rawQuestion.onculler.map(val => String(val).trim()).filter(Boolean) : [],
        options: normalizedOptions,
        correctOption: normalizedCorrectOption,
        solution: {
            analiz: rawQuestion.solution?.analiz || '',
            dayanakText: rawQuestion.solution?.dayanakText || '',
            hap: rawQuestion.solution?.hap || '',
            tuzak: rawQuestion.solution?.tuzak || ''
        },
        legislationRef: {
            code: rawQuestion.legislationRef?.code ? String(rawQuestion.legislationRef.code) : '',
            article: rawQuestion.legislationRef?.article ? String(rawQuestion.legislationRef.article) : ''
        },
        isActive: true,
        isFlaggedForReview: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        _rowIndex: index + 1,
        _manualCategory: false,
        _categoryConfirmed: false,
        _selected: false
    };
}

function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    const normalized = options
        .filter(option => option)
        .map((option, index) => {
            if (typeof option === 'string') {
                return { id: '', text: option, _index: index };
            }
            return {
                id: String(option.id || '').toUpperCase(),
                text: option.text || '',
                _index: index
            };
        })
        .map(option => ({ ...option, text: String(option.text || '').trim() }))
        .filter(option => option.text);

    return normalized.map(option => ({
        id: option.id || ['A', 'B', 'C', 'D', 'E'][option._index] || '',
        text: option.text
    }));
}

function normalizeCorrectOption(correctOption, options) {
    if (!correctOption) return '';
    const normalized = String(correctOption).trim().toUpperCase();
    const cleaned = normalized.replace(/[^A-E0-9]/g, '');
    if (['A', 'B', 'C', 'D', 'E'].includes(cleaned) && options.some(option => option.id === cleaned)) {
        return cleaned;
    }
    if (['1', '2', '3', '4', '5'].includes(cleaned)) {
        const mapped = ['A', 'B', 'C', 'D', 'E'][Number(cleaned) - 1];
        return options.some(option => option.id === mapped) ? mapped : '';
    }
    const optionMatch = findCorrectOptionFromText(normalized, options);
    return optionMatch || '';
}

function findCorrectOptionFromText(rawValue, options) {
    if (!rawValue) return '';
    const normalized = normalizeText(rawValue);
    const matched = options.find(option => normalizeText(option.text) === normalized);
    return matched?.id || '';
}

function normalizeText(value) {
    if (!value) return '';

    // Temel temizlik
    let processed = String(value)
        .toLowerCase()
        .normalize('NFD') // Aksanları ayır (örn. â -> a + ^)
        .replace(/[\u0300-\u036f]/g, '') // Aksan karakterlerini sil
        .replace(/[^a-z0-9\s]/g, ' ') // Alfanumerik olmayanları boşluk yap
        .replace(/\s+/g, ' ') // Çoklu boşlukları tekile indir
        .trim();

    // Eş anlamlı kelime değişimi
    const tokens = processed.split(' ');
    const replacedTokens = tokens.map(token => SYNONYMS[token] || token);

    return replacedTokens.join(' ');
}

async function ensureCategoryIndex() {
    if (categoryIndex) return categoryIndex;
    if (categoryIndexPromise) return categoryIndexPromise;

    categoryIndexPromise = (async () => {
        try {
            const snapshot = await getDocs(query(collection(db, "topics"), orderBy("title", "asc")));
            categoryList = [];
            snapshot.forEach(doc => {
                const topic = doc.data();
                if (topic?.title) {
                    categoryList.push(String(topic.title));
                }
            });
            categoryIndex = buildCategoryIndex(categoryList);
            categoryProfiles = buildCategoryProfiles(categoryList);
            log(`Kategori listesi yüklendi (${categoryList.length} kayıt).`, "success");
        } catch (error) {
            console.error("Kategoriler yüklenemedi:", error);
            log("Kategori listesi alınamadı. Eşleştirme sınırlı çalışacak.", "error");
            categoryIndex = new Map();
            categoryList = [];
            categoryProfiles = [];
        }
        return categoryIndex;
    })();

    return categoryIndexPromise;
}

function buildCategoryIndex(categories) {
    const map = new Map();
    categories.forEach(category => {
        const normalized = normalizeCategoryName(category);
        if (normalized) map.set(normalized, category);

        // Ekstra varyasyonlar ekleyebiliriz
        const noSpaces = normalized.replace(/\s+/g, '');
        if (noSpaces !== normalized) map.set(noSpaces, category);
    });
    return map;
}

function buildCategoryProfiles(categories) {
    return categories.map(category => {
        const normalized = normalizeCategoryName(category);
        const tokens = tokenizeCategory(normalized).filter(token => !STOPWORDS.has(token));
        const tokenSet = new Set(tokens);
        const lawCodeHints = new Set();

        Object.entries(LAW_CODE_KEYWORDS).forEach(([code, keywords]) => {
            const normalizedKeywords = keywords.map(keyword => normalizeCategoryName(keyword));
            if (normalizedKeywords.some(keyword => keyword && normalized.includes(keyword))) {
                lawCodeHints.add(code);
            }
        });

        return {
            title: category,
            normalized,
            tokens,
            tokenSet,
            lawCodeHints
        };
    });
}

function normalizeCategoryName(value) {
    let normalized = normalizeText(value);
    if (!normalized) return '';

    // Parantez içindeki açıklamaları temizle (örn: (Genel), (Ortak), (CMK))
    // Bunlar genellikle ayırt edici değil, gruplayıcıdır.
    normalized = normalized.replace(/\s*\([^)]*\)/g, ' ');

    CATEGORY_REWRITES.forEach(({ pattern, replace }) => {
        normalized = normalized.replace(pattern, replace);
    });

    normalized = normalized.replace(/\b(\d+)\s*(inci|nci|uncu|ncu|nci|ncu|ncu|ncu)\b/g, '$1');

    return normalized.trim();
}

function tokenizeCategory(value) {
    if (!value) return [];
    return value.split(' ').map(token => token.trim()).filter(Boolean);
}

function weightToken(token) {
    if (!token) return 0;
    if (/^\d+$/.test(token)) return 3;
    if (['sayili', 'cumhurbaskanligi', 'kararname', 'kanun', 'anayasa'].includes(token)) return 2;
    if (token.length >= 7) return 1.5;
    return 1;
}

function calculateWeightedJaccard(inputTokens, candidateTokens) {
    const inputSet = new Set(inputTokens);
    const candidateSet = new Set(candidateTokens);
    const union = new Set([...inputSet, ...candidateSet]);

    let intersectionWeight = 0;
    let unionWeight = 0;

    union.forEach(token => {
        const weight = weightToken(token);
        unionWeight += weight;
        if (inputSet.has(token) && candidateSet.has(token)) {
            intersectionWeight += weight;
        }
    });

    if (!unionWeight) return 0;
    return intersectionWeight / unionWeight;
}

function matchCategory(inputCategory) {
    const normalized = normalizeCategoryName(inputCategory);
    if (!normalized) return { match: '', score: 0 };

    if (!categoryList.length) {
        return { match: inputCategory, score: 0 };
    }

    if (categoryIndex?.has(normalized)) {
        return { match: categoryIndex.get(normalized), score: 1 };
    }

    let bestMatch = '';
    let bestScore = 0;
    const inputTokens = tokenizeCategory(normalized).filter(token => !STOPWORDS.has(token));
    const inputTokenSet = new Set(inputTokens);
    const inputNumbers = inputTokens.filter(token => /^\d+$/.test(token));

    categoryProfiles.forEach(profile => {
        const candidateTokens = profile.tokens;
        const candidateTokenSet = profile.tokenSet;
        if (!candidateTokens.length) return;

        let candidateScore = 0;

        if (profile.normalized.includes(normalized) || normalized.includes(profile.normalized)) {
            const lenScore = Math.min(profile.normalized.length, normalized.length) / Math.max(profile.normalized.length, normalized.length);
            candidateScore = Math.max(candidateScore, lenScore);
        }

        const tokenScore = calculateWeightedJaccard(inputTokens, candidateTokens);
        candidateScore = Math.max(candidateScore, tokenScore);

        if (inputNumbers.length) {
            const candidateNumbers = candidateTokens.filter(token => /^\d+$/.test(token));
            if (candidateNumbers.some(num => inputNumbers.includes(num))) {
                candidateScore = Math.min(1, candidateScore + 0.15);
            }
        }

        if (inputTokenSet.has('cumhurbaskanligi') && candidateTokenSet.has('cumhurbaskanligi')) {
            candidateScore = Math.min(1, candidateScore + 0.05);
        }

        if (inputTokenSet.has('kararname') && candidateTokenSet.has('kararname')) {
            candidateScore = Math.min(1, candidateScore + 0.05);
        }

        if (candidateScore > bestScore) {
            bestScore = candidateScore;
            bestMatch = profile.title;
        }
    });

    return { match: bestMatch, score: bestScore };
}

function normalizeQuestionText(question) {
    const textParts = [
        question.text,
        question.questionRoot,
        question.solution?.analiz,
        question.solution?.dayanakText,
        question.solution?.hap,
        question.solution?.tuzak
    ].filter(Boolean);

    return normalizeText(textParts.join(' '));
}

function extractLawCodesFromText(text) {
    const codes = new Set();
    if (!text) return codes;

    const numberMatches = text.match(/\b\d{4,5}\b/g) || [];
    numberMatches.forEach(match => {
        if (LAW_CODE_KEYWORDS[match]) {
            codes.add(match);
        }
    });

    Object.keys(LAW_ABBREV_MAP).forEach(abbrev => {
        const regex = new RegExp(`\\b${abbrev}\\b`, 'i');
        if (regex.test(text)) {
            codes.add(LAW_ABBREV_MAP[abbrev]);
        }
    });

    return codes;
}

function buildQuestionSignals(question) {
    const questionText = normalizeQuestionText(question);
    const textTokens = tokenizeCategory(questionText).filter(token => token && !STOPWORDS.has(token));
    const inputCategoryTokens = tokenizeCategory(normalizeCategoryName(question.category || '')).filter(token => token && !STOPWORDS.has(token));

    const lawCodes = new Set();
    if (question.legislationRef?.code) {
        const code = String(question.legislationRef.code).trim();
        if (LAW_CODE_KEYWORDS[code]) lawCodes.add(code);
    }

    extractLawCodesFromText(questionText).forEach(code => lawCodes.add(code));

    return {
        textTokens,
        inputCategoryTokens,
        lawCodes
    };
}

function scoreCategoryCandidate(profile, signals) {
    let inputScore = 0;
    let textScore = 0;
    let codeBoost = 0;

    let combined = 0;

    // 1. Jaccard Score (Geleneksel benzerlik)
    if (signals.textTokens.length && profile.tokens.length) {
        textScore = calculateWeightedJaccard(signals.textTokens, profile.tokens);
    }

    if (signals.inputCategoryTokens.length && profile.tokens.length) {
        inputScore = calculateWeightedJaccard(signals.inputCategoryTokens, profile.tokens);
    }

    // 2. Subset Score (Kapsama oranı)
    // Adayın tokenlarının kaçı input içinde geçiyor?
    // Örn Input: "1 Nolu Cumhurbaşkanlığı Teşkilatı Hakkında Kararname"
    // Aday: "1 Sayılı Cumhurbaşkanlığı Kararnamesi" -> Tokens: 1, sayili, cumhurbaskanligi, kararname
    // Input Tokens (Synonym sonrası): 1, sayili, cumhurbaskanligi, teskilati, hakkinda, kararname
    // Adayın tüm önemli tokenları inputta var!

    let subsetScore = 0;
    if (profile.tokens.length > 0) {
        const profileTokensSet = new Set(profile.tokens);
        let intersectionWeight = 0;
        let profileWeight = 0;

        const inputAllTokens = new Set([...signals.inputCategoryTokens, ...signals.textTokens]);

        profileTokensSet.forEach(token => {
            const w = weightToken(token);
            profileWeight += w;
            if (inputAllTokens.has(token)) {
                intersectionWeight += w;
            }
        });

        if (profileWeight > 0) {
            subsetScore = intersectionWeight / profileWeight;
        }
    }

    // 3. Kanun Kodu Eşleşmesi
    if (signals.lawCodes.size && profile.lawCodeHints.size) {
        const matchedCodes = [...signals.lawCodes].filter(code => profile.lawCodeHints.has(code));
        if (matchedCodes.length) {
            codeBoost = Math.min(0.40, 0.20 + matchedCodes.length * 0.1);
        }
    }

    // Skor hesaplama: Subset skoru çok güçlü bir sinyaldir, input verbose olduğunda jaccard düşer ama subset yüksek kalır.
    const baseScore = Math.max(inputScore, textScore);

    // Eğer subset skoru çok yüksekse ve kritik kelimeler tutuyorsa (profileWeight yeterince büyükse)
    // Subset skorunu ana skor olarak kullan.
    combined = Math.max(baseScore, subsetScore * 0.95) + codeBoost;

    // Sınırla
    combined = Math.min(1, combined);

    return {
        combined,
        inputScore,
        textScore,
        subsetScore,
        codeBoost
    };
}

function smartMatchCategory(question) {
    if (!categoryProfiles.length) {
        return { match: question.category || '', score: 0, reason: 'Kategori listesi yok.' };
    }

    const signals = buildQuestionSignals(question);
    let best = { match: '', score: 0, reason: '' };
    let secondBest = 0;

    categoryProfiles.forEach(profile => {
        const { combined, inputScore, textScore, subsetScore, codeBoost } = scoreCategoryCandidate(profile, signals);
        if (combined > best.score) {
            secondBest = best.score;
            best = {
                match: profile.title,
                score: combined,
                reason: buildMatchReason({ inputScore, textScore, subsetScore, codeBoost, profile, signals })
            };
        } else if (combined > secondBest) {
            secondBest = combined;
        }
    });

    const margin = best.score - secondBest;
    if (margin < SMART_MATCH_THRESHOLDS.minMargin) {
        best.score = Math.max(0, best.score - 0.08);
        best.reason = `${best.reason} | Benzer adaylar var`;
    }

    return best;
}

function buildMatchReason({ inputScore, textScore, subsetScore, codeBoost, profile, signals }) {
    const reasons = [];
    if (subsetScore >= 0.85) reasons.push('Tam kapsam eşleşmesi');
    else if (inputScore >= 0.5) reasons.push('Kategori adı benzerliği');

    if (textScore >= 0.55) reasons.push('Soru içeriği benzerliği');
    if (codeBoost > 0) {
        const matchedCodes = [...signals.lawCodes].filter(code => profile.lawCodeHints.has(code));
        if (matchedCodes.length) reasons.push(`Kanun kodu eşleşti (${matchedCodes.join(', ')})`);
    }
    if (!reasons.length) return 'Genel benzerlik';
    return reasons.join(' • ');
}

function validateAndPreview() {
    const table = document.getElementById('previewTableBody');
    table.innerHTML = '';
    let validCount = 0;
    let invalidCount = 0;
    let autoMatched = 0;
    let needsReview = 0;
    let lowConfidence = 0;
    let warningCount = 0;
    let issueCount = 0;
    const summary = {
        categoryFixes: 0,
        answerFixes: 0,
        difficultyFixes: 0,
        warningCount: 0
    };

    parsedQuestions.forEach((q, index) => {
        // Her seferinde yeniden doğrulama yap
        const fixes = [];
        const warnings = [];
        const errors = [];

        // Kategori Kontrolü - Akıllı sistem (metin + mevzuat kodu + başlık)
        const cleanedCategory = String(q.category || '').trim();
        const smartMatch = smartMatchCategory(q);
        q._matchScore = smartMatch.score;
        q._matchReason = smartMatch.reason;

        const isManualOrConfirmed = Boolean(q._manualCategory || q._categoryConfirmed);
        let isUndefinedCategory = false;
        if (!isManualOrConfirmed) {
            if (smartMatch.match && smartMatch.score >= SMART_MATCH_THRESHOLDS.high) {
                if (smartMatch.match !== cleanedCategory) {
                    q.category = smartMatch.match;
                    fixes.push(`Akıllı Kategori: ${smartMatch.match} (%${Math.round(smartMatch.score * 100)})`);
                    summary.categoryFixes += 1;
                }
                q._needsCategoryConfirm = false;
                q._suggestedCategory = '';
                autoMatched += 1;
            } else if (smartMatch.match && smartMatch.score >= SMART_MATCH_THRESHOLDS.low) {
                q._suggestedCategory = smartMatch.match;
                q._needsCategoryConfirm = true;
                warnings.push(`Kategori şüpheli. Öneri: ${smartMatch.match} (%${Math.round(smartMatch.score * 100)})`);
                summary.warningCount += 1;
                needsReview += 1;
            } else if (cleanedCategory) {
                q._suggestedCategory = smartMatch.match || '';
                q._needsCategoryConfirm = true;
                warnings.push('Kategori bulunamadı, lütfen seçin.');
                summary.warningCount += 1;
                isUndefinedCategory = true;
            } else {
                q.category = '';
                q._suggestedCategory = smartMatch.match || '';
                q._needsCategoryConfirm = true;
                warnings.push('Kategori boş.');
                isUndefinedCategory = true;
            }
        } else {
            q._needsCategoryConfirm = false;
            q._suggestedCategory = smartMatch.match || '';
            if (smartMatch.match && smartMatch.score >= SMART_MATCH_THRESHOLDS.high && smartMatch.match !== cleanedCategory) {
                warnings.push(`Seçilen kategori ile çelişen öneri: ${smartMatch.match} (%${Math.round(smartMatch.score * 100)})`);
                summary.warningCount += 1;
                needsReview += 1;
            }
        }

        const difficulty = Number(q.difficulty);
        if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 5) {
            q.difficulty = 3;
            fixes.push('Zorluk → 3');
            summary.difficultyFixes += 1;
        }

        const optionIds = new Set(q.options.map(option => option.id));
        const hasRequiredOptions = ['A', 'B', 'C', 'D', 'E'].every(id => optionIds.has(id));
        if (!hasRequiredOptions) {
            errors.push('Şıklar A-E eksik');
        }

        if (!q.text || !String(q.text).trim()) {
            errors.push('Soru metni eksik');
        }

        const hasCorrectOption = q.correctOption && optionIds.has(q.correctOption);
        if (!hasCorrectOption) {
            const repaired = normalizeCorrectOption(q.correctOption, q.options);
            if (repaired && optionIds.has(repaired)) {
                q.correctOption = repaired;
                fixes.push(`Doğru cevap → ${repaired}`);
                summary.answerFixes += 1;
            } else {
                errors.push('Doğru cevap hatalı/eksik');
            }
        }

        // Kategori geçerliliğini kontrol et: Listede var mı?
        const hasCategoryList = categoryList.length > 0;
        if (!hasCategoryList) {
            q._needsCategoryConfirm = false;
            q._suggestedCategory = q._suggestedCategory || '';
        }
        const isCategoryValid = !hasCategoryList || categoryList.includes(q.category);
        if (q._needsCategoryConfirm) {
            const suggestionNote = q._suggestedCategory ? ` (Öneri: ${q._suggestedCategory})` : '';
            errors.push(`Kategori doğrulaması gerekli${suggestionNote}`);
        } else if (!isCategoryValid) {
            errors.push('Geçersiz Kategori');
        }

        // --- YENİ EKLENEN VALIDATIONLAR ---
        // 1. Şıklar Arasında Dublike Kontrolü
        if (hasRequiredOptions) {
            const seenTexts = new Map();
            q.options.forEach(opt => {
                const normalizedText = normalizeText(opt.text);
                if (normalizedText.length < 2) return; // Çok kısa şıkları atla
                if (seenTexts.has(normalizedText)) {
                    warnings.push(`Tekrar eden şık: ${opt.id} ve ${seenTexts.get(normalizedText)}`);
                    summary.warningCount += 1;
                } else {
                    seenTexts.set(normalizedText, opt.id);
                }
            });
        }

        // 2. Format Kontrolü (Örn: A) Ankara)
        q.options.forEach(opt => {
            if (/^[A-E][).]\s/.test(opt.text)) {
                fixes.push(`Şık temizlendi: ${opt.id}`);
                opt.text = opt.text.replace(/^[A-E][).]\s/, '').trim();
                summary.answerFixes += 1;
            }
            if (opt.text.length < 1) {
                errors.push(`Şık ${opt.id} boş`);
            }
        });

        // 3. Uzunluk Kontrolü
        if (q.text && q.text.length < 10) {
            warnings.push('Soru metni çok kısa (<10)');
            summary.warningCount += 1;
        }



        const isValid = errors.length === 0;
        q._isValid = isValid;
        q._hasWarnings = warnings.length > 0;
        q._hasErrors = errors.length > 0;
        q._hasIssues = q._hasWarnings || q._hasErrors || q._needsCategoryConfirm;
        q._autoMatched = !q._needsCategoryConfirm && !q._manualCategory && smartMatch.score >= SMART_MATCH_THRESHOLDS.high;
        q._isUndefined = q._needsCategoryConfirm && (isUndefinedCategory || q._matchScore < SMART_MATCH_THRESHOLDS.low || !q._suggestedCategory);
        if (isValid) validCount++; else invalidCount++;
        if (q._isUndefined) lowConfidence += 1;
        warningCount += warnings.length > 0 ? 1 : 0;
        issueCount += q._hasIssues ? 1 : 0;

        // ... (Previous existing code)

        // --- Render ---
        const shortText = q.text ? (q.text.length > 50 ? q.text.substring(0, 50) + '...' : q.text) : '---';
        const titleText = q.text || errors[0] || 'Geçersiz veri';


        // Durum Mesajı
        let statusBadge = '';
        if (errors.length) statusBadge = `<span class="badge badge-danger">Hata: ${errors.join(', ')}</span>`;
        else if (warnings.length) statusBadge = `<span class="badge badge-warning text-dark"><i class="validation-warning">⚠️</i> ${warnings.join(', ')}</span>`;
        else statusBadge = `<span class="badge badge-success">Hazır</span>`;

        if (fixes.length) statusBadge += `<br><small class="text-info">${fixes.join('<br>')}</small>`;

        const tr = document.createElement('tr');
        if (!isValid) tr.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
        if (warnings.length > 0 && isValid) tr.style.backgroundColor = 'rgba(245, 158, 11, 0.05)';

        // Kategori Input'u Oluştur
        const categoryInput = document.createElement('input');
        const needsCategoryConfirm = Boolean(q._needsCategoryConfirm);
        categoryInput.type = 'text';
        categoryInput.className = `form-control form-control-sm ${(needsCategoryConfirm || !isCategoryValid) ? 'is-invalid' : 'is-valid'}`;
        categoryInput.setAttribute('list', 'categoryListOptions');
        categoryInput.value = q.category || '';
        categoryInput.placeholder = 'Kategori Seçin...';

        if (q._suggestedCategory) {
            categoryInput.title = `Önerilen: ${q._suggestedCategory}`;
            // Eğer öneri varsa ve henüz onaylanmamışsa, placeholder'da göster
            if (!categoryInput.value) categoryInput.placeholder = `Öneri: ${q._suggestedCategory}`;
        }

        categoryInput.addEventListener('change', (e) => {
            const newVal = e.target.value;
            q.category = newVal;
            q._manualCategory = true;
            q._categoryConfirmed = true;
            validateAndPreview();
        });

        // "Göster" Butonu
        const btnView = document.createElement('button');
        btnView.className = 'btn btn-sm btn-outline-info btn-icon';
        btnView.innerHTML = '🔍';
        btnView.title = 'Detaylı İncele';
        btnView.onclick = () => showDetailModal(index);

        const tdSelect = document.createElement('td');
        const rowSelect = document.createElement('input');
        rowSelect.type = 'checkbox';
        rowSelect.className = 'form-check-input';
        rowSelect.checked = Boolean(q._selected);
        rowSelect.addEventListener('change', (e) => {
            q._selected = e.target.checked;
            updateSelectionState();
        });
        tdSelect.appendChild(rowSelect);

        const tdIndex = document.createElement('td');
        tdIndex.textContent = index + 1;

        const tdCat = document.createElement('td');
        tdCat.className = 'importer-category-cell';
        const categoryControls = document.createElement('div');
        categoryControls.className = 'importer-category-controls';
        categoryControls.appendChild(categoryInput);
        const actionGroup = document.createElement('div');
        actionGroup.className = 'importer-category-actions';
        if (needsCategoryConfirm) {
            const btnConfirmCategory = document.createElement('button');
            btnConfirmCategory.className = 'btn btn-compact btn-outline-success';
            btnConfirmCategory.innerHTML = '✅ Kategori doğru';
            btnConfirmCategory.title = 'Seçili kategori doğru, onayla';
            btnConfirmCategory.onclick = () => {
                q._categoryConfirmed = true;
                q._manualCategory = true;
                validateAndPreview();
            };
            actionGroup.appendChild(btnConfirmCategory);
        }

        if (q._suggestedCategory && needsCategoryConfirm) {
            const btnQuickConfirm = document.createElement('button');
            btnQuickConfirm.className = 'btn btn-compact btn-warning';
            btnQuickConfirm.innerHTML = '✨ Öneriyi uygula';
            btnQuickConfirm.title = `Öneriyi uygula: ${q._suggestedCategory}`;
            btnQuickConfirm.onclick = () => {
                q.category = q._suggestedCategory;
                q._manualCategory = true;
                q._categoryConfirmed = true;
                validateAndPreview();
            };
            actionGroup.appendChild(btnQuickConfirm);
        }
        categoryControls.appendChild(actionGroup);
        tdCat.appendChild(categoryControls);

        const tdQ = document.createElement('td');
        tdQ.className = 'importer-question-cell';
        tdQ.innerHTML = `<span class="importer-question-text">${shortText}</span>`;
        tdQ.appendChild(btnView); // Göster butonunu buraya ekledik

        const tdSmart = document.createElement('td');
        tdSmart.innerHTML = `
            <div class="small">
                <strong>%${Math.round((q._matchScore || 0) * 100)}</strong>
                <div class="text-muted" style="font-size:0.75rem">${q._matchReason || '---'}</div>
            </div>
        `;
        const tdStatus = document.createElement('td'); tdStatus.innerHTML = statusBadge;

        tr.appendChild(tdSelect);
        tr.appendChild(tdIndex);
        tr.appendChild(tdCat);
        tr.appendChild(tdQ);
        tr.appendChild(tdSmart);
        tr.appendChild(tdStatus);

        if (shouldRenderRow(q)) {
            table.appendChild(tr);
        }
    });

    document.getElementById('previewCard').style.display = 'block';
    const btn = document.getElementById('btnStartImport');

    // ÖZET KARTI Render
    const summaryEl = document.getElementById('smartSummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="smart-summary">
                <div class="smart-summary__header">
                    <div>
                        <strong>Durum Özeti</strong>
                        <div class="text-muted small">Akıllı eşleştirme sonuçlarının hızlı görünümü</div>
                    </div>
                    ${needsReview > 0 ? `<button onclick="window.confirmAllSuggestions()" class="btn btn-warning btn-sm smart-summary__action">⚠️ ${needsReview} Öneriyi Onayla</button>` : ''}
                </div>
                <div class="smart-summary__metrics">
                    <div class="smart-summary__metric">
                        <div class="smart-summary__value">${parsedQuestions.length}</div>
                        <div class="text-muted small">Toplam</div>
                    </div>
                    <div class="smart-summary__metric">
                        <div class="smart-summary__value text-success">${autoMatched}</div>
                        <div class="text-muted small">Otomatik</div>
                    </div>
                    <div class="smart-summary__metric">
                        <div class="smart-summary__value text-warning">${needsReview}</div>
                        <div class="text-muted small">İncelenecek</div>
                    </div>
                    <div class="smart-summary__metric">
                        <div class="smart-summary__value text-danger">${lowConfidence}</div>
                        <div class="text-muted small">Tanımsız</div>
                    </div>
                </div>
                <div class="smart-summary__badges">
                    <span class="badge bg-danger">Hatalı: ${invalidCount}</span>
                    <span class="badge bg-warning text-dark">Uyarılı: ${warningCount}</span>
                    <span class="badge bg-secondary">Sorunlu: ${issueCount}</span>
                </div>
                ${summary.categoryFixes ? `<div class="smart-summary__note text-success small">✨ ${summary.categoryFixes} kategori otomatik düzeltildi.</div>` : ''}
                ${categoryList.length ? `<div class="smart-summary__note text-muted small">Kategori listesi yüklendi.</div>` : `<div class="smart-summary__note text-warning small">Kategori listesi yüklenemedi. Manuel giriş açık.</div>`}
            </div>
        `;
    }

    updateCategoryFilterOptions();
    updatePreviewMeta(validCount, invalidCount, needsReview, issueCount);
    updateSelectionState();

    if (validCount > 0) {
        btn.disabled = false;
        btn.innerHTML = `🚀 ${validCount} Soruyu Yükle`;
        if (invalidCount > 0) {
            btn.innerHTML += ` <span class="badge bg-danger ms-2">${invalidCount} Hatalı (Atlanacak)</span>`;
        }
    } else {
        btn.disabled = true;
        btn.innerText = invalidCount > 0 ? `${invalidCount} Hatalı Soru Mevcut` : "Yüklenecek Soru Yok";
    }
}

// --- Yeni Fonksiyonlar ---

window.confirmAllSuggestions = () => {
    let appliedCount = 0;
    parsedQuestions.forEach(q => {
        if (q._needsCategoryConfirm && q._suggestedCategory) {
            q.category = q._suggestedCategory;
            q._manualCategory = true; // Artık manuel kabul edildi
            q._categoryConfirmed = true;
            appliedCount++;
        }
    });
    if (appliedCount > 0) {
        showToast(`${appliedCount} kategori önerisi onaylandı.`, "success");
        validateAndPreview();
    } else {
        showToast("Onaylanacak öneri bulunamadı.", "info");
    }
};

function updatePreviewMeta(validCount, invalidCount, needsReview, issueCount) {
    const meta = document.getElementById('previewMeta');
    if (!meta) return;
    meta.textContent = `${parsedQuestions.length} soru • ${validCount} hazır • ${invalidCount} hatalı • ${needsReview} inceleme • ${issueCount} sorunlu`;
}

function getQuestionCategoryLabel(question) {
    const category = String(question.category || '').trim();
    if (!category || question._isUndefined) return 'Tanımsız';
    return category;
}

function updateCategoryFilterOptions() {
    const filterEl = document.getElementById('previewCategoryFilter');
    if (!filterEl) return;

    const current = filterEl.value || 'all';
    const categorySet = new Set();

    parsedQuestions.forEach(question => {
        categorySet.add(getQuestionCategoryLabel(question));
    });

    const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'tr'));
    const options = [
        { value: 'all', label: 'Tüm Kategoriler' },
        ...categories.map(category => ({
            value: category === 'Tanımsız' ? '__uncategorized__' : category,
            label: category
        }))
    ];

    filterEl.innerHTML = options.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
    filterEl.value = options.some(option => option.value === current) ? current : 'all';
    previewCategoryFilter = filterEl.value;
}

function shouldRenderRow(question) {
    const filterEl = document.getElementById('previewFilter');
    if (!filterEl) return true;
    previewFilter = filterEl.value;
    const matchesStateFilter = (() => {
        switch (previewFilter) {
        case 'issues':
                return question._hasIssues;
        case 'invalid':
                return question._hasErrors;
        case 'needs-review':
                return question._needsCategoryConfirm;
        case 'warnings':
                return question._hasWarnings;
        case 'auto':
                return question._autoMatched;
        case 'low-confidence':
                return question._isUndefined;
        default:
                return true;
        }
    })();

    const categoryFilterEl = document.getElementById('previewCategoryFilter');
    if (categoryFilterEl) {
        previewCategoryFilter = categoryFilterEl.value;
    }

    if (!matchesStateFilter) return false;

    if (!previewCategoryFilter || previewCategoryFilter === 'all') return true;

    if (previewCategoryFilter === '__uncategorized__') {
        return question._isUndefined || !String(question.category || '').trim();
    }

    return String(question.category || '').trim() === previewCategoryFilter;
}

function handleSelectAllToggle(event) {
    const shouldSelect = event.target.checked;
    parsedQuestions.forEach(q => {
        if (shouldRenderRow(q)) {
            q._selected = shouldSelect;
        }
    });
    updateSelectionState();
    validateAndPreview();
}

function updateSelectionState() {
    const selectAll = document.getElementById('selectAllPreview');
    const selectionInfo = document.getElementById('previewSelectionInfo');
    const applyBtn = document.getElementById('btnApplySelectedSuggestions');
    const confirmBtn = document.getElementById('btnConfirmSelectedCategories');
    const clearBtn = document.getElementById('btnClearSelection');

    const visibleQuestions = parsedQuestions.filter(q => shouldRenderRow(q));
    const selected = parsedQuestions.filter(q => q._selected);
    const selectedVisible = visibleQuestions.filter(q => q._selected);
    const selectedSuggestions = selected.filter(q => q._suggestedCategory);

    if (selectionInfo) {
        selectionInfo.textContent = `${selected.length} soru seçili`;
        selectionInfo.className = `badge ${selected.length ? 'bg-primary' : 'bg-secondary'}`;
    }

    if (applyBtn) applyBtn.disabled = selectedSuggestions.length === 0;
    if (confirmBtn) confirmBtn.disabled = selected.length === 0;
    if (clearBtn) clearBtn.disabled = selected.length === 0;

    if (selectAll) {
        if (visibleQuestions.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        } else {
            selectAll.checked = selectedVisible.length === visibleQuestions.length;
            selectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleQuestions.length;
        }
    }
}

function applySelectedSuggestions() {
    let appliedCount = 0;
    parsedQuestions.forEach(q => {
        if (q._selected && q._suggestedCategory) {
            q.category = q._suggestedCategory;
            q._manualCategory = true;
            q._categoryConfirmed = true;
            appliedCount++;
        }
    });
    if (appliedCount > 0) {
        showToast(`${appliedCount} öneri uygulandı.`, "success");
        validateAndPreview();
    } else {
        showToast("Uygulanacak öneri bulunamadı.", "info");
    }
}

function confirmSelectedCategories() {
    let confirmedCount = 0;
    parsedQuestions.forEach(q => {
        if (q._selected) {
            q._manualCategory = true;
            q._categoryConfirmed = true;
            confirmedCount++;
        }
    });
    if (confirmedCount > 0) {
        showToast(`${confirmedCount} kategori onaylandı.`, "success");
        validateAndPreview();
    } else {
        showToast("Onaylanacak soru seçilmedi.", "info");
    }
}

function clearSelectedQuestions() {
    parsedQuestions.forEach(q => {
        q._selected = false;
    });
    updateSelectionState();
    validateAndPreview();
}

window.showDetailModal = (index) => {
    const q = parsedQuestions[index];
    if (!q) return;

    // Modal varsa önce temizle (basit implementasyon için DOM'a injection yapalım)
    let modal = document.getElementById('detailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detailModal';
        modal.className = 'admin-modal-overlay';
        document.body.appendChild(modal);
    }

    const optionsHtml = q.options.map(opt => {
        const isCorrect = opt.id === q.correctOption;
        return `
            <div class="option-item ${isCorrect ? 'correct' : ''}">
                <strong>${opt.id})</strong> ${opt.text}
                ${isCorrect ? ' <span class="ms-2 badge badge-success">Doğru Cevap</span>' : ''}
            </div>
        `;
    }).join('');

    const categoryOptions = categoryList.length
        ? categoryList.map(cat => `<option value="${cat}" ${cat === q.category ? 'selected' : ''}>${cat}</option>`).join('')
        : '';

    modal.innerHTML = `
        <div class="admin-modal-content">
            <div class="modal-header">
                <div>
                    <h5 class="m-0 text-white">Soru Detayı #${index + 1}</h5>
                    <div class="small text-muted">ID: ${index}</div>
                </div>
                <button onclick="document.getElementById('detailModal').style.display='none'" class="close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <div class="row">
                    <div class="col-md-8 border-end border-secondary">
                        <div class="modal-section-title">SORU METNİ</div>
                        <div class="p-3 bg-surface border rounded text-main">${q.text || 'Metin Yok'}</div>
                        ${q.questionRoot ? `<div class="mt-2 text-main"><strong>Kök:</strong> ${q.questionRoot}</div>` : ''}
                        
                        <div class="modal-section-title">ŞIKLAR</div>
                        <div>${optionsHtml}</div>
                        
                        <div class="modal-section-title">ÇÖZÜM & ANALİZ</div>
                        <div class="p-3 bg-hover border rounded text-muted small">
                            ${q.solution.analiz || 'Analiz bulunmuyor.'}
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="p-3 rounded bg-hover mb-3">
                            <label class="form-label small text-muted text-uppercase fw-bold">Kategori Yönetimi</label>
                            <input type="text" id="modalCategoryInput" class="form-control mb-2" list="categoryListOptions" value="${q.category}">
                            ${categoryList.length ? `
                                <select id="modalCategorySelect" class="form-select form-select-sm mb-2" onchange="window.syncModalCategorySelect()">
                                    <option value="">Kategori seçin...</option>
                                    ${categoryOptions}
                                </select>
                            ` : `<div class="small text-warning mb-2">Kategori listesi yüklenemedi. Manuel giriş yapabilirsiniz.</div>`}
                            <div class="d-flex gap-2 align-items-center importer-modal-actions">
                                <button class="btn btn-sm btn-outline-success btn-icon importer-action-btn flex-fill" title="Kategori doğru" aria-label="Kategori doğru" onclick="confirmCategoryInModal(${index})">
                                    <span aria-hidden="true">✅</span>
                                </button>
                                ${q._suggestedCategory ? `<button class="btn btn-sm btn-warning btn-icon importer-action-btn flex-fill" title="Öneriyi uygula" aria-label="Öneriyi uygula" onclick="applySuggestionInModal(${index})"><span aria-hidden="true">✨</span></button>` : ''}
                            </div>
                            
                            <div class="d-flex justify-content-between align-items-center small mt-3">
                                <span class="text-muted">Güven Skoru:</span>
                                <span class="fw-bold text-main">%${Math.round((q._matchScore || 0) * 100)}</span>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label small text-muted">Mevzuat Referansı</label>
                            <input type="text" class="form-control form-control-sm bg-surface text-muted" value="${q.legislationRef.code || ''} md. ${q.legislationRef.article || ''}" readonly>
                        </div>

                        <button onclick="saveModalChanges(${index})" class="btn btn-primary w-100 py-3">
                            💾 Değişiklikleri Kaydet
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.applySuggestionInModal = (index) => {
    const q = parsedQuestions[index];
    if (q && q._suggestedCategory) {
        const input = document.getElementById('modalCategoryInput');
        const select = document.getElementById('modalCategorySelect');
        if (input) input.value = q._suggestedCategory;
        if (select) select.value = q._suggestedCategory;
    }
};

window.syncModalCategorySelect = () => {
    const select = document.getElementById('modalCategorySelect');
    const input = document.getElementById('modalCategoryInput');
    if (select && input) {
        input.value = select.value;
    }
};

window.confirmCategoryInModal = (index) => {
    parsedQuestions[index]._manualCategory = true;
    parsedQuestions[index]._categoryConfirmed = true;
    saveModalChanges(index);
};

window.saveModalChanges = (index) => {
    const input = document.getElementById('modalCategoryInput');
    if (input) {
        parsedQuestions[index].category = input.value;
        parsedQuestions[index]._manualCategory = true;
        parsedQuestions[index]._categoryConfirmed = true;
        validateAndPreview();
        document.getElementById('detailModal').style.display = 'none';
        showToast("Değişiklik kaydedildi.", "success");
    }
};

async function startBatchImport() {
    const validQuestions = parsedQuestions.filter(q => q._isValid);
    // ... lines 891+ default
    if (validQuestions.length === 0) return;

    const shouldImport = await showConfirm(
        `${validQuestions.length} soru yüklenecek.\n(Hatalı olan ${parsedQuestions.length - validQuestions.length} soru atlanacak)\nOnaylıyor musunuz?`,
        {
            title: "Toplu Yükleme Onayı",
            confirmText: "Evet, Yükle",
            cancelText: "İptal"
        }
    );

    if (!shouldImport) return;

    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    btn.innerText = "Yükleniyor...";

    try {
        const batchSize = 450;
        const chunks = [];

        for (let i = 0; i < validQuestions.length; i += batchSize) {
            chunks.push(validQuestions.slice(i, i + batchSize));
        }

        log(`Toplam ${validQuestions.length} soru, ${chunks.length} paket halinde yükleniyor...`);

        for (let i = 0; i < chunks.length; i++) {
            const batch = writeBatch(db);
            const chunk = chunks[i];

            chunk.forEach(q => {
                const docRef = doc(collection(db, "questions"));
                // _meta, _manualCategory, _isValid gibi geçici alanları temizle
                const { _meta, _matchScore, _matchReason, _needsCategoryConfirm, _suggestedCategory, _isValid, _manualCategory, _categoryConfirmed, _selected, _rowIndex, ...payload } = q;
                batch.set(docRef, payload);
            });

            await batch.commit();
            log(`Paket ${i + 1}/${chunks.length} başarıyla yüklendi.`, "success");
        }

        log("✅ Tüm işlemler tamamlandı!", "success");
        showToast("Tüm sorular başarıyla yüklendi.", "success");

        // Temizlik
        document.getElementById('previewCard').style.display = 'none';
        document.getElementById('fileInput').value = '';
        parsedQuestions = [];

    } catch (e) {
        console.error(e);
        log("Hata oluştu: " + e.message, "error");
        btn.disabled = false;
        btn.innerText = "Tekrar Dene";
    }
}

function log(msg, type = "info") {
    const area = document.getElementById('importLog');
    const color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#9ca3af');
    area.innerHTML += `<div style="color:${color}">> ${msg}</div>`;
    area.scrollTop = area.scrollHeight;
}

window.showGuide = () => {
    document.getElementById('guideModal').style.display = 'flex';
};
