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

const CATEGORY_MATCH_THRESHOLDS = {
    high: 0.72,
    low: 0.45
};

const CATEGORY_REWRITES = [
    { pattern: /\bkararnamesi\b/g, replace: "kararname" },
    { pattern: /\bkararnameleri\b/g, replace: "kararname" },
    { pattern: /\bkanunu\b/g, replace: "kanun" },
    { pattern: /\bkanunlari\b/g, replace: "kanun" },
    { pattern: /\bmahkemesi\b/g, replace: "mahkeme" },
    { pattern: /\bmahkemeleri\b/g, replace: "mahkeme" }
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
            </div>

            <div class="col-md-7">
                <div class="card h-100" id="previewCard" style="display:none;">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="m-0">Önizleme</h5>
                        <button id="btnStartImport" class="btn btn-success btn-sm" disabled>Yüklemeyi Başlat</button>
                    </div>
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="admin-table table-sm">
                            <thead>
                                <tr>
                                    <th style="width: 40px;">#</th>
                                    <th style="min-width: 250px;">Kategori</th>
                                    <th>Soru</th>
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

    ensureCategoryIndex();
}

let parsedQuestions = [];
let categoryIndex = null;
let categoryList = [];
let categoryIndexPromise = null;

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
        _rowIndex: index + 1
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
            log(`Kategori listesi yüklendi (${categoryList.length} kayıt).`, "success");
        } catch (error) {
            console.error("Kategoriler yüklenemedi:", error);
            log("Kategori listesi alınamadı. Eşleştirme sınırlı çalışacak.", "error");
            categoryIndex = new Map();
            categoryList = [];
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

function normalizeCategoryName(value) {
    let normalized = normalizeText(value);
    if (!normalized) return '';

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
        return { match: inputCategory, score: 0 }; // Liste yoksa
    }

    // Tam eşleşme (Doğrudan map'te var mı?)
    if (categoryIndex?.has(normalized)) {
        return { match: categoryIndex.get(normalized), score: 1 };
    }

    // Levenshtein / Token çakışması ile en iyi tahmini bul
    let bestMatch = '';
    let bestScore = 0;
    const inputTokens = tokenizeCategory(normalized);
    const inputTokenSet = new Set(inputTokens);
    const inputNumbers = inputTokens.filter(token => /^\d+$/.test(token));

    categoryList.forEach(candidate => {
        const candidateNormalized = normalizeCategoryName(candidate);
        if (!candidateNormalized) return;

        // 1. İçerme kontrolü (biri diğerini içeriyor mu?)
        let candidateScore = 0;

        if (candidateNormalized.includes(normalized) || normalized.includes(candidateNormalized)) {
            // Uzunluk oranı skoru
            const lenScore = Math.min(candidateNormalized.length, normalized.length) / Math.max(candidateNormalized.length, normalized.length);
            candidateScore = Math.max(candidateScore, lenScore);
        }

        // 2. Token (Kelime) bazlı benzerlik (Ağırlıklı Jaccard)
        const candidateTokens = tokenizeCategory(candidateNormalized);
        const candidateTokenSet = new Set(candidateTokens);
        const tokenScore = calculateWeightedJaccard(inputTokens, candidateTokens);

        candidateScore = Math.max(candidateScore, tokenScore);

        // Sayı ve kritik kelimeler ekstra güven sağlar
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
            bestMatch = candidate;
        }
    });

    return { match: bestMatch, score: bestScore };
}

function validateAndPreview() {
    const table = document.getElementById('previewTableBody');
    table.innerHTML = '';
    let validCount = 0;
    let invalidCount = 0;
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

        // Kategori Kontrolü - ARTIK DAHA AKILLI VE MANUEL SEÇİME AÇIK
        if (!q._manualCategory) { // Manuel seçim yapılmadıysa otomatik bul
            const cleanedCategory = String(q.category || '').trim();
            const { match, score } = matchCategory(cleanedCategory);

            if (match && score >= CATEGORY_MATCH_THRESHOLDS.high) { // Yüksek güven
                if (match !== cleanedCategory) {
                    q.category = match;
                    fixes.push(`Otomatik Kategori: ${match} (%${Math.round(score * 100)})`);
                    summary.categoryFixes += 1;
                }
                q._needsCategoryConfirm = false;
                q._suggestedCategory = '';
            } else if (match && score >= CATEGORY_MATCH_THRESHOLDS.low) {
                q.category = match;
                q._suggestedCategory = match;
                q._needsCategoryConfirm = true;
                warnings.push(`Kategori şüpheli. Öneri: ${match} (%${Math.round(score * 100)})`);
                summary.warningCount += 1;
            } else if (cleanedCategory) {
                q._needsCategoryConfirm = true;
                warnings.push('Kategori bulunamadı, lütfen seçin.');
                summary.warningCount += 1;
            } else {
                q.category = '';
                q._needsCategoryConfirm = true;
                warnings.push('Kategori boş.');
            }
        } else {
            q._needsCategoryConfirm = false;
            q._suggestedCategory = '';
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
            q._suggestedCategory = '';
        }
        const isCategoryValid = !hasCategoryList || categoryList.includes(q.category);
        if (q._needsCategoryConfirm) {
            const suggestionNote = q._suggestedCategory ? ` (Öneri: ${q._suggestedCategory})` : '';
            errors.push(`Kategori doğrulaması gerekli${suggestionNote}`);
        } else if (!isCategoryValid) {
            errors.push('Geçersiz Kategori');
        }

        const isValid = errors.length === 0;
        q._isValid = isValid;
        if (isValid) validCount++; else invalidCount++;

        // --- Render ---
        const shortText = q.text ? (q.text.length > 50 ? q.text.substring(0, 50) + '...' : q.text) : '---';
        const titleText = q.text || errors[0] || 'Geçersiz veri';

        // Durum Mesajı
        let statusBadge = '';
        if (errors.length) statusBadge = `<span class="badge bg-danger">Hata: ${errors.join(', ')}</span>`;
        else if (warnings.length) statusBadge = `<span class="badge bg-warning text-dark">Uyarı: ${warnings.join(', ')}</span>`;
        else statusBadge = `<span class="badge bg-success">Hazır</span>`;

        if (fixes.length) statusBadge += `<br><small class="text-info">${fixes.join('<br>')}</small>`;

        const tr = document.createElement('tr');
        if (!isValid) tr.style.backgroundColor = 'rgba(255,0,0,0.05)';

        // Kategori Input'u Oluştur
        const categoryInput = document.createElement('input');
        const needsCategoryConfirm = Boolean(q._needsCategoryConfirm);
        categoryInput.type = 'text';
        categoryInput.className = `form-control form-control-sm ${(needsCategoryConfirm || !isCategoryValid) ? 'is-invalid' : 'is-valid'}`;
        categoryInput.setAttribute('list', 'categoryListOptions');
        categoryInput.value = q.category || '';
        categoryInput.placeholder = 'Kategori Seçin...';
        if (q._suggestedCategory) {
            categoryInput.title = `Önerilen kategori: ${q._suggestedCategory}`;
        }

        categoryInput.addEventListener('change', (e) => {
            const newVal = e.target.value;
            // Kullanıcı değiştirdiğinde
            q.category = newVal;
            q._manualCategory = true; // Artık otomatik düzeltme yapma
            validateAndPreview(); // Tabloyu güncelle
        });

        const tdIndex = document.createElement('td'); tdIndex.textContent = index + 1;
        const tdCat = document.createElement('td'); tdCat.appendChild(categoryInput);
        const tdQ = document.createElement('td'); tdQ.textContent = shortText; tdQ.title = titleText;
        const tdStatus = document.createElement('td'); tdStatus.innerHTML = statusBadge;

        tr.appendChild(tdIndex);
        tr.appendChild(tdCat);
        tr.appendChild(tdQ);
        tr.appendChild(tdStatus);

        table.appendChild(tr);
    });

    document.getElementById('previewCard').style.display = 'block';
    const btn = document.getElementById('btnStartImport');

    // Valid count ve invalid count
    // Eğer tüm sorular valid ise buton açılır
    // Ancak sadece WARNINGS varsa (örn: kategori emin değiliz) yine de açılmalı ama kullanıcı düzeltse iyi olur.

    // Bizim mantığımızda: Errors varsa import edilemez. Warnings varsa edilebilir.
    // Ancak "Geçersiz Kategori" bir ERROR olarak eklendi, yani kategori seçilene kadar import butonu açılmaz.

    if (validCount > 0) {
        btn.disabled = false;
        btn.innerHTML = `🚀 ${validCount} Soruyu Yükle`;

        if (invalidCount > 0) {
            btn.innerHTML += ` (${invalidCount} Hatalı)`;
            // Hatalı olanları yine de yükleyemeyiz, sadece geçerliler yüklenir
        }
    } else {
        btn.disabled = true;
        btn.innerText = invalidCount > 0 ? `${invalidCount} Soruda Hata Var` : "Yüklenecek Soru Yok";
    }
}

async function startBatchImport() {
    const validQuestions = parsedQuestions.filter(q => q._isValid);
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
                const { _meta, _isValid, _manualCategory, _rowIndex, ...payload } = q;
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
