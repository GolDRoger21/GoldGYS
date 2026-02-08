import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import { collection, writeBatch, doc, serverTimestamp, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";

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
                            <thead><tr><th>#</th><th>Kategori</th><th>Soru</th><th>Düzeltmeler</th><th>Durum</th></tr></thead>
                            <tbody id="previewTableBody"></tbody>
                        </table>
                    </div>
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
                    <h5>Yapay Zeka Promptu (JSON üretimi için)</h5>
                    <p>Aşağıdaki promptu kopyalayıp yapay zekaya verin. Çıktıyı sadece JSON olarak üretmesini isteyin. Kategori için kendi kısa adlarınızı yazabilirsiniz; sistem en yakın kategoriyle eşleştirir.</p>
                    <pre style="background:var(--bg-hover); color:var(--text-main); padding:10px; border-radius:5px; border:1px solid var(--border-color); white-space: pre-wrap;">
Sen bir hukuk sınavı soru üretim asistanısın. Aşağıdaki kurallara uyarak SADECE JSON dizi çıktısı üret:
- Çıktı bir JSON array olmalı.
- Her nesnede şu alanlar zorunlu: category, difficulty (1-5), type, text, options (A-E), correctOption, legislationRef, solution.
- options alanı A, B, C, D, E id’lerine sahip 5 seçenek içermeli.
- correctOption yalnızca "A", "B", "C", "D" veya "E" olabilir.
- legislationRef alanında code ve article string olmalı (bilinmiyorsa boş string).
- solution alanında analiz, dayanakText, hap, tuzak alanları string olmalı (bilinmiyorsa boş string).
- questionRoot null olabilir, onculler ise string dizisi olabilir.
- Asla açıklama, markdown veya ek metin yazma; yalnızca JSON döndür.
- category alanında uzun resmi isim yerine kısa isim kullanılabilir (örn. "Anayasa"). Sistem otomatik eşleştirir.

Örnek çıktı formatı:
[
  {
    "category": "Anayasa",
    "difficulty": 3,
    "type": "standard",
    "text": "Soru metni...",
    "questionRoot": null,
    "onculler": [],
    "options": [
      {"id": "A", "text": "Seçenek A"},
      {"id": "B", "text": "Seçenek B"},
      {"id": "C", "text": "Seçenek C"},
      {"id": "D", "text": "Seçenek D"},
      {"id": "E", "text": "Seçenek E"}
    ],
    "correctOption": "A",
    "legislationRef": { "code": "5271", "article": "12" },
    "solution": {
      "analiz": "Detaylı açıklama",
      "dayanakText": "",
      "hap": "",
      "tuzak": ""
    }
  }
]
                    </pre>
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
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
        getCategoryAliases(category).forEach(alias => {
            const aliasKey = normalizeCategoryName(alias);
            if (aliasKey && !map.has(aliasKey)) {
                map.set(aliasKey, category);
            }
        });
    });
    return map;
}

function normalizeCategoryName(value) {
    return normalizeText(value);
}

function getCategoryAliases(category) {
    const aliases = new Set();
    const normalized = normalizeCategoryName(category);
    if (normalized) aliases.add(normalized);

    const tokens = normalized.split(' ').filter(Boolean);
    const filteredTokens = tokens.filter(token => !['turkiye', 'cumhuriyeti', 'cumhuriyet', 'tc', 't', 'c', 'hakkinda'].includes(token));
    if (filteredTokens.length) {
        aliases.add(filteredTokens.join(' '));
    }

    const withoutSuffix = filteredTokens.filter(token => !['kanunu', 'kanun', 'mevzuati', 'mevzuat'].includes(token));
    if (withoutSuffix.length) {
        aliases.add(withoutSuffix.join(' '));
    }

    if (tokens.length) {
        aliases.add(tokens.map(token => token[0]).join(''));
    }

    return Array.from(aliases).filter(Boolean);
}

function matchCategory(inputCategory) {
    const normalized = normalizeCategoryName(inputCategory);
    if (!normalized) return '';
    if (!categoryList.length) {
        return inputCategory;
    }
    if (categoryIndex?.has(normalized)) {
        return categoryIndex.get(normalized);
    }

    let bestMatch = '';
    let bestScore = 0;
    const inputTokens = new Set(normalized.split(' '));
    categoryList.forEach(candidate => {
        const candidateNormalized = normalizeCategoryName(candidate);
        if (!candidateNormalized) return;
        if (candidateNormalized.includes(normalized) || normalized.includes(candidateNormalized)) {
            const score = Math.min(candidateNormalized.length, normalized.length) / Math.max(candidateNormalized.length, normalized.length);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = candidate;
            }
        }
        const candidateTokens = new Set(candidateNormalized.split(' '));
        const overlap = [...inputTokens].filter(token => candidateTokens.has(token)).length;
        const score = overlap / Math.max(candidateTokens.size, inputTokens.size);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    });

    return bestScore >= 0.45 ? bestMatch : '';
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
        const fixes = [];
        const warnings = [];
        const errors = [];

        const cleanedCategory = String(q.category || '').trim();
        const categoryMatch = matchCategory(cleanedCategory);
        if (categoryMatch && categoryMatch !== cleanedCategory) {
            q.category = categoryMatch;
            fixes.push(`Kategori → ${categoryMatch}`);
            summary.categoryFixes += 1;
        } else if (!categoryMatch && cleanedCategory) {
            warnings.push('Kategori eşleşmedi');
            summary.warningCount += 1;
        } else if (!cleanedCategory) {
            q.category = 'Genel';
            fixes.push('Kategori → Genel');
            summary.categoryFixes += 1;
        }

        const difficulty = Number(q.difficulty);
        if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 5) {
            q.difficulty = 3;
            fixes.push('Zorluk → 3');
            summary.difficultyFixes += 1;
        }

        if (!q.type || !String(q.type).trim()) {
            q.type = 'standard';
            fixes.push('Tip → standard');
        }

        const optionIds = new Set(q.options.map(option => option.id));
        const hasRequiredOptions = ['A', 'B', 'C', 'D', 'E'].every(id => optionIds.has(id));
        if (!hasRequiredOptions) {
            errors.push('Şıklar A-E eksik');
        }

        if (!q.text || !String(q.text).trim()) {
            errors.push('Soru metni eksik');
        } else {
            q.text = String(q.text).trim();
        }

        if (q.legislationRef) {
            if (q.legislationRef.code) q.legislationRef.code = String(q.legislationRef.code).trim();
            if (q.legislationRef.article) q.legislationRef.article = String(q.legislationRef.article).trim();
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

        q._meta = { fixes, warnings, errors };
        const isValid = errors.length === 0;
        q._isValid = isValid;
        if (isValid) {
            validCount++;
        } else {
            invalidCount++;
        }

        const shortText = q.text ? (q.text.length > 50 ? q.text.substring(0, 50) + '...' : q.text) : '---';
        const titleText = q.text || errors[0] || 'Geçersiz veri';
        const statusText = errors.length ? `❌ ${errors.join(', ')}` : '✅ Hazır';
        const fixText = [...fixes, ...warnings.map(w => `⚠️ ${w}`)].join('<br>') || '—';

        table.innerHTML += `
            <tr style="${!isValid ? 'background:rgba(255,0,0,0.08)' : ''}">
                <td>${index + 1}</td>
                <td>${q.category || '-'}</td>
                <td title="${titleText}">${shortText}</td>
                <td>${fixText}</td>
                <td>${statusText}</td>
            </tr>
        `;
    });

    document.getElementById('previewCard').style.display = 'block';
    const btn = document.getElementById('btnStartImport');

    if (validCount > 0) {
        btn.disabled = false;
        btn.innerText = `🚀 ${validCount} Soruyu Yükle`;
        log(`${validCount} geçerli soru bulundu. Yüklemeye hazır.`, "success");
        if (invalidCount > 0) {
            log(`${invalidCount} soru hatalı olduğu için atlanacak.`, "error");
        }
        if (summary.categoryFixes || summary.answerFixes || summary.difficultyFixes) {
            log(`Otomatik düzeltmeler: ${summary.categoryFixes} kategori, ${summary.answerFixes} cevap, ${summary.difficultyFixes} zorluk.`, "success");
        }
    } else {
        btn.disabled = true;
        btn.innerText = "Yüklenecek Soru Yok";
        log("Geçerli soru bulunamadı. Lütfen dosya formatını kontrol edin.", "error");
    }
}

async function startBatchImport() {
    const validQuestions = parsedQuestions.filter(q => q._isValid);
    const invalidCount = parsedQuestions.length - validQuestions.length;
    const shouldImport = await showConfirm(`${validQuestions.length} soruyu veritabanına yüklemek istiyor musunuz?${invalidCount ? ` (${invalidCount} soru hatalı olduğu için atlanacak.)` : ''}`, {
        title: "Toplu Yükleme",
        confirmText: "Yüklemeyi Başlat",
        cancelText: "Vazgeç"
    });
    if (!shouldImport) return;
    if (validQuestions.length === 0) return;

    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    btn.innerText = "Yükleniyor...";

    try {
        // Firestore Batch limiti 500'dür. Büyük dosyaları parçalayalım.
        const batchSize = 450;
        const chunks = [];

        for (let i = 0; i < validQuestions.length; i += batchSize) {
            chunks.push(validQuestions.slice(i, i + batchSize));
        }

        log(`Toplam ${chunks.length} paket halinde yüklenecek...`);

        for (let i = 0; i < chunks.length; i++) {
            const batch = writeBatch(db);
            const chunk = chunks[i];

            chunk.forEach(q => {
                const docRef = doc(collection(db, "questions"));
                const { _meta, _isValid, ...payload } = q;
                batch.set(docRef, payload);
            });

            await batch.commit();
            log(`Paket ${i + 1}/${chunks.length} yüklendi (${chunk.length} soru).`, "success");
        }

        log("✅ TÜM İŞLEMLER BAŞARIYLA TAMAMLANDI!", "success");
        showToast("Yükleme başarıyla tamamlandı.", "success");

        // Temizlik
        document.getElementById('previewCard').style.display = 'none';
        document.getElementById('fileInput').value = '';
        parsedQuestions = [];

    } catch (e) {
        console.error(e);
        log("Yükleme sırasında hata: " + e.message, "error");
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
