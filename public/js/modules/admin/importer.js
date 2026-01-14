import { db } from "../../firebase-config.js";
import { collection, writeBatch, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// Excel kütüphanesini CDN'den alıyoruz
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";

export function initImporterPage() {
    console.log("Toplu Yükleme Modülü Başlatılıyor...");
    
    // DÜZELTME: Artık Soru Bankası'nı ezmemesi için kendi section'ını kullanıyor
    const container = document.getElementById('section-importer'); 
    
    if (!container) {
        console.error("Importer section bulunamadı! (HTML'de #section-importer var mı kontrol edin)");
        return;
    }

    // Arayüzü oluştur
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📥 Toplu Soru Yükleme Merkezi</h2>
                <p class="text-muted">Excel veya JSON dosyasından binlerce soruyu saniyeler içinde yükleyin.</p>
            </div>
            <div class="actions">
                <button id="btnDownloadTemplate" class="btn btn-outline-primary">📄 Örnek Şablon İndir</button>
            </div>
        </div>

        <div class="row">
            <div class="col-md-6">
                <div class="card p-4" style="border: 2px dashed var(--border-color); text-align: center;">
                    <div class="mb-3"><span style="font-size: 3rem;">📂</span></div>
                    <h4>Dosyayı Buraya Sürükleyin</h4>
                    <p class="text-muted">veya seçmek için tıklayın (.xlsx, .json)</p>
                    <input type="file" id="fileInput" accept=".json, .xlsx, .xls" style="display: none;">
                    <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">Dosya Seç</button>
                </div>
                
                <div class="card mt-3 bg-dark text-white">
                    <div class="card-header border-bottom border-secondary"><small>İŞLEM GÜNLÜĞÜ</small></div>
                    <div id="importLog" class="card-body" style="height: 200px; overflow-y: auto; font-family: monospace; font-size: 0.85rem;">
                        <div class="text-muted">> Yükleme bekleniyor...</div>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="card" id="previewCard" style="display:none;">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4 id="previewTitle">Önizleme</h4>
                        <button id="btnStartImport" class="btn btn-success" disabled>🚀 Yüklemeyi Başlat</button>
                    </div>
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="admin-table table-sm">
                            <thead><tr><th>#</th><th>Kategori</th><th>Soru Metni</th><th>Durum</th></tr></thead>
                            <tbody id="previewTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listenerlar (Elementler oluştuktan sonra)
    const fileInp = document.getElementById('fileInput');
    const startBtn = document.getElementById('btnStartImport');
    const dlBtn = document.getElementById('btnDownloadTemplate');

    if(fileInp) fileInp.addEventListener('change', handleFileSelect);
    if(startBtn) startBtn.addEventListener('click', startBatchImport);
    if(dlBtn) dlBtn.addEventListener('click', downloadTemplate);
}

// --- YARDIMCI FONKSİYONLAR ---
let parsedQuestions = [];

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    log(`Dosya seçildi: ${file.name}`);
    
    try {
        if (file.name.endsWith('.json')) {
            const text = await file.text();
            parsedQuestions = JSON.parse(text);
            validateAndPreview();
        } else {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            parsedQuestions = convertExcelData(XLSX.utils.sheet_to_json(firstSheet));
            validateAndPreview();
        }
    } catch (error) { log(`Hata: ${error.message}`, "error"); }
}

function convertExcelData(rawData) {
    return rawData.map(row => ({
        text: row['Soru Metni'] || row['text'],
        category: row['Kategori'] || row['category'] || 'Genel',
        type: 'standard',
        difficulty: 3,
        options: [
            { id: 'A', text: row['A'] || '' }, { id: 'B', text: row['B'] || '' },
            { id: 'C', text: row['C'] || '' }, { id: 'D', text: row['D'] || '' },
            { id: 'E', text: row['E'] || '' }
        ],
        correctOption: row['Doğru Cevap'] || row['correctOption'],
        solution: { analiz: row['Çözüm Analiz'] || '' },
        legislationRef: { code: row['Kanun No'] || '', article: row['Madde No'] || '' },
        tags: [], isFlaggedForReview: false, isActive: true
    }));
}

function validateAndPreview() {
    const table = document.getElementById('previewTableBody');
    if(!table) return;
    
    table.innerHTML = '';
    let validCount = 0;
    
    parsedQuestions.forEach((q, index) => {
        const isValid = q.text && q.correctOption;
        if(isValid) validCount++;
        
        // Tablo satırı
        const tr = document.createElement('tr');
        if(!isValid) tr.style.background = 'rgba(255,0,0,0.1)';
        tr.innerHTML = `
            <td>${index+1}</td>
            <td>${q.category}</td>
            <td>${q.text?.substring(0,30)}...</td>
            <td>${isValid?'✅':'❌'}</td>
        `;
        table.appendChild(tr);
    });

    const card = document.getElementById('previewCard');
    const btn = document.getElementById('btnStartImport');
    
    if(card) card.style.display = 'block';
    if(btn) {
        btn.disabled = validCount === 0;
        btn.innerText = `🚀 ${validCount} Soruyu Yükle`;
    }
}

async function startBatchImport() {
    if(!confirm("Yükleme başlatılsın mı?")) return;
    const batch = writeBatch(db);
    parsedQuestions.forEach(q => {
        q.createdAt = serverTimestamp();
        // Yeni ID ile ekle
        const docRef = doc(collection(db, "questions"));
        batch.set(docRef, q);
    });
    try { 
        await batch.commit(); 
        log("✅ Başarıyla Yüklendi!", "success"); 
        alert("İşlem tamamlandı.");
        // Temizlik
        parsedQuestions = [];
        document.getElementById('previewCard').style.display = 'none';
    } 
    catch(e) { log("Hata: " + e.message, "error"); }
}

function log(msg, type="info") {
    const area = document.getElementById('importLog');
    if(!area) return;
    const color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#9ca3af');
    area.innerHTML += `<div style="color:${color}">> ${msg}</div>`;
    area.scrollTop = area.scrollHeight;
}

function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([{ "Kategori": "Genel", "Soru Metni": "Soru?", "A": "Cevap A", "Doğru Cevap": "A" }]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sablon");
    XLSX.writeFile(wb, "Soru_Sablonu.xlsx");
}