import { db } from "../../firebase-config.js";
import { collection, writeBatch, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";

export function initImporterPage() {
    const container = document.getElementById('section-importer');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📥 Toplu Soru Yükleme</h2>
                <p class="text-muted">Excel dosyasından binlerce soruyu tek seferde yükleyin.</p>
            </div>
            <button onclick="downloadTemplate()" class="btn btn-outline-primary">📄 Şablon İndir</button>
        </div>

        <div class="row">
            <div class="col-md-5">
                <div class="card p-5 text-center border-dashed" style="border: 2px dashed var(--border-color); cursor:pointer;" onclick="document.getElementById('fileInput').click()">
                    <div style="font-size: 3rem; margin-bottom: 10px;">📂</div>
                    <h5>Dosya Seç veya Sürükle</h5>
                    <p class="text-muted small">.xlsx veya .json formatında</p>
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
    `;

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('btnStartImport').addEventListener('click', startBatchImport);
}

let parsedQuestions = [];

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    log(`Dosya okunuyor: ${file.name}`);

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedQuestions = convertExcelData(XLSX.utils.sheet_to_json(firstSheet));
        validateAndPreview();
    } catch (error) { log(`Hata: ${error.message}`, "error"); }
}

// --- GÜNCELLENECEK FONKSİYON: Excel Verisini Dönüştürme ---
function convertExcelData(rawData) {
    return rawData.map(row => {
        // Excel sütun isimleri (Esnek yapı)
        const type = row['Tip'] || row['type'] || 'standard';

        // Öncülleri ayır (Excel'de "I. ..., II. ..." şeklinde tek hücrede veya ayrı sütunlarda olabilir)
        // Basitlik için Excel'de "Onculler" sütununda alt alta satırlarla veya özel bir ayraçla (|) geldiğini varsayalım.
        let onculler = [];
        if (row['Onculler']) {
            onculler = row['Onculler'].split('|').map(s => s.trim());
        }

        return {
            category: row['Kategori'] || row['category'] || 'Genel',
            difficulty: parseInt(row['Zorluk'] || row['difficulty']) || 3,
            type: type,
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

            // Detaylı Çözüm Objesi
            solution: {
                analiz: row['Çözüm Analiz'] || row['analiz'] || '',
                dayanakText: row['Mevzuat Dayanak'] || row['dayanak'] || '',
                hap: row['Hap Bilgi'] || row['hap'] || '',
                tuzak: row['Sınav Tuzağı'] || row['tuzak'] || ''
            },

            // Mevzuat Referansı Objesi
            legislationRef: {
                code: String(row['Kanun No'] || row['code'] || ''),
                name: row['Kanun Adı'] || row['legName'] || '',
                article: String(row['Madde No'] || row['article'] || '')
            },

            tags: (row['Etiketler'] || '').split(',').map(t => t.trim()).filter(Boolean),

            isActive: true,
            isFlaggedForReview: false,
            createdAt: serverTimestamp()
        };
    });
}

function validateAndPreview() {
    const table = document.getElementById('previewTableBody');
    table.innerHTML = '';
    let validCount = 0;

    parsedQuestions.forEach((q, index) => {
        const isValid = q.text && q.correctOption;
        if (isValid) validCount++;

        table.innerHTML += `
            <tr style="${!isValid ? 'background:rgba(255,0,0,0.1)' : ''}">
                <td>${index + 1}</td>
                <td>${q.category}</td>
                <td>${q.text?.substring(0, 30)}...</td>
                <td>${isValid ? '✅' : '❌'}</td>
            </tr>
        `;
    });

    document.getElementById('previewCard').style.display = 'block';
    const btn = document.getElementById('btnStartImport');
    btn.disabled = validCount === 0;
    btn.innerText = `🚀 ${validCount} Soruyu Yükle`;
}

async function startBatchImport() {
    if (!confirm("Yükleme başlatılsın mı?")) return;
    const batch = writeBatch(db);
    parsedQuestions.forEach(q => {
        const docRef = doc(collection(db, "questions"));
        batch.set(docRef, q);
    });
    try {
        await batch.commit();
        log("✅ Başarıyla Yüklendi!", "success");
        alert("İşlem tamamlandı.");
        document.getElementById('previewCard').style.display = 'none';
    }
    catch (e) { log("Hata: " + e.message, "error"); }
}

function log(msg, type = "info") {
    const area = document.getElementById('importLog');
    const color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#9ca3af');
    area.innerHTML += `<div style="color:${color}">> ${msg}</div>`;
    area.scrollTop = area.scrollHeight;
}

window.downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ "Kategori": "Genel", "Soru Metni": "Soru?", "A": "Cevap A", "Doğru Cevap": "A", "Çözüm": "Açıklama", "Kanun No": "5271", "Madde No": "1" }]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sablon");
    XLSX.writeFile(wb, "Soru_Sablonu.xlsx");
};