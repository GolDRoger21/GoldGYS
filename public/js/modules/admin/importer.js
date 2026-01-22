import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import { collection, writeBatch, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
                <button onclick="showGuide()" class="btn btn-info text-white">ℹ️ Format Rehberi</button>
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
                            <thead><tr><th>#</th><th>Kategori</th><th>Soru</th><th>Durum</th></tr></thead>
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
                    <p>JSON yüklemesi en sağlıklı yöntemdir. Aşağıdaki format birebir korunmalıdır.</p>
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
                    <h5>Yapay Zeka Promptu (JSON üretimi için)</h5>
                    <p>Aşağıdaki promptu kopyalayıp yapay zekaya verin. Çıktıyı sadece JSON olarak üretmesini isteyin.</p>
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
}

let parsedQuestions = [];

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
    const fallbackCorrect = normalizedOptions[0]?.id || '';
    const normalizedCorrectOption = normalizeCorrectOption(rawQuestion.correctOption, normalizedOptions) || fallbackCorrect;

    return {
        category: rawQuestion.category || 'Genel',
        difficulty: Number.isFinite(rawQuestion.difficulty) ? rawQuestion.difficulty : 3,
        type: rawQuestion.type || 'standard',
        text: rawQuestion.text || '',
        questionRoot: rawQuestion.questionRoot ?? null,
        onculler: Array.isArray(rawQuestion.onculler) ? rawQuestion.onculler : [],
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
        .filter(option => option.text);

    return normalized.map(option => ({
        id: option.id || ['A', 'B', 'C', 'D', 'E'][option._index] || '',
        text: option.text
    }));
}

function normalizeCorrectOption(correctOption, options) {
    if (!correctOption) return '';
    const normalized = String(correctOption).toUpperCase();
    return options.some(option => option.id === normalized) ? normalized : '';
}

function validateAndPreview() {
    const table = document.getElementById('previewTableBody');
    table.innerHTML = '';
    let validCount = 0;

    parsedQuestions.forEach((q, index) => {
        const optionIds = new Set(q.options.map(option => option.id));
        const hasRequiredOptions = ['A', 'B', 'C', 'D', 'E'].every(id => optionIds.has(id));
        const isValid = Boolean(q.text) && Boolean(q.correctOption) && hasRequiredOptions;
        if (isValid) validCount++;

        const shortText = q.text ? (q.text.length > 50 ? q.text.substring(0, 50) + '...' : q.text) : '---';
        const reason = !q.text
            ? 'Soru metni eksik'
            : !q.correctOption
                ? 'Doğru cevap hatalı/eksik'
                : !hasRequiredOptions
                    ? 'Şıklar A-E eksik'
                    : '';

        table.innerHTML += `
            <tr style="${!isValid ? 'background:rgba(255,0,0,0.1)' : ''}">
                <td>${index + 1}</td>
                <td>${q.category || '-'}</td>
                <td title="${q.text || reason}">${shortText}</td>
                <td>${isValid ? '✅' : `❌ ${reason}`}</td>
            </tr>
        `;
    });

    document.getElementById('previewCard').style.display = 'block';
    const btn = document.getElementById('btnStartImport');

    if (validCount > 0) {
        btn.disabled = false;
        btn.innerText = `🚀 ${validCount} Soruyu Yükle`;
        log(`${validCount} geçerli soru bulundu. Yüklemeye hazır.`, "success");
    } else {
        btn.disabled = true;
        btn.innerText = "Yüklenecek Soru Yok";
        log("Geçerli soru bulunamadı. Lütfen dosya formatını kontrol edin.", "error");
    }
}

async function startBatchImport() {
    const shouldImport = await showConfirm(`${parsedQuestions.length} soruyu veritabanına yüklemek istiyor musunuz?`, {
        title: "Toplu Yükleme",
        confirmText: "Yüklemeyi Başlat",
        cancelText: "Vazgeç"
    });
    if (!shouldImport) return;

    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    btn.innerText = "Yükleniyor...";

    try {
        // Firestore Batch limiti 500'dür. Büyük dosyaları parçalayalım.
        const batchSize = 450;
        const chunks = [];

        for (let i = 0; i < parsedQuestions.length; i += batchSize) {
            chunks.push(parsedQuestions.slice(i, i + batchSize));
        }

        log(`Toplam ${chunks.length} paket halinde yüklenecek...`);

        for (let i = 0; i < chunks.length; i++) {
            const batch = writeBatch(db);
            const chunk = chunks[i];

            chunk.forEach(q => {
                const docRef = doc(collection(db, "questions"));
                batch.set(docRef, q);
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
