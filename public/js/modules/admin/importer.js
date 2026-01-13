import { db } from "../../firebase-config.js";
import { 
    collection, writeBatch, doc, serverTimestamp, getDocs, query, where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// Excel okuma kütüphanesini dinamik import ediyoruz (CDN üzerinden)
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";

export function initImporterPage() {
    console.log("Toplu Yükleme Modülü Başlatılıyor...");
    
    const container = document.getElementById('section-content'); // İçerik sekmesine ekleyelim veya ayrı sekme yapalım
    // Mevcut içeriği temizle ve Importer arayüzünü bas
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
                    <div class="mb-3">
                        <span style="font-size: 3rem;">📂</span>
                    </div>
                    <h4>Dosyayı Buraya Sürükleyin</h4>
                    <p class="text-muted">veya seçmek için tıklayın (.xlsx, .json)</p>
                    <input type="file" id="fileInput" accept=".json, .xlsx, .xls" style="display: none;">
                    <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">Dosya Seç</button>
                </div>
                
                <div class="card mt-3 bg-dark text-white">
                    <div class="card-header border-bottom border-secondary">
                        <small>İŞLEM GÜNLÜĞÜ</small>
                    </div>
                    <div id="importLog" class="card-body" style="height: 200px; overflow-y: auto; font-family: monospace; font-size: 0.85rem;">
                        <div class="text-muted">> Yükleme bekleniyor...</div>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="card" id="previewCard" style="display:none;">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4 id="previewTitle">Önizleme (0 Soru)</h4>
                        <button id="btnStartImport" class="btn btn-success" disabled>🚀 Yüklemeyi Başlat</button>
                    </div>
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="admin-table table-sm">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Kategori</th>
                                    <th>Soru Metni</th>
                                    <th>Durum</th>
                                </tr>
                            </thead>
                            <tbody id="previewTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listenerlar
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('btnStartImport').addEventListener('click', startBatchImport);
    document.getElementById('btnDownloadTemplate').addEventListener('click', downloadTemplate);
}

let parsedQuestions = []; // Yüklenmeye hazır sorular

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    log(`Dosya seçildi: ${file.name} (${(file.size/1024).toFixed(2)} KB)`);
    
    try {
        if (file.name.endsWith('.json')) {
            const text = await file.text();
            parsedQuestions = JSON.parse(text);
            validateAndPreview();
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(firstSheet);
            parsedQuestions = convertExcelData(rawData);
            validateAndPreview();
        } else {
            log("❌ Desteklenmeyen dosya formatı!", "error");
        }
    } catch (error) {
        log(`❌ Okuma Hatası: ${error.message}`, "error");
    }
}

// Excel verisini Firestore formatına dönüştür
function convertExcelData(rawData) {
    return rawData.map(row => {
        // Excel kolon isimleri ile eşleştirme
        return {
            text: row['Soru Metni'] || row['text'],
            category: row['Kategori'] || row['category'] || 'Genel',
            type: row['Tip'] || 'standard',
            difficulty: parseInt(row['Zorluk'] || 3),
            options: [
                { id: 'A', text: row['A'] || '' },
                { id: 'B', text: row['B'] || '' },
                { id: 'C', text: row['C'] || '' },
                { id: 'D', text: row['D'] || '' },
                { id: 'E', text: row['E'] || '' }
            ],
            correctOption: row['Doğru Cevap'] || row['correctOption'],
            solution: {
                analiz: row['Çözüm Analiz'] || '',
                dayanakText: row['Mevzuat Dayanak'] || '',
                hap: row['Hap Bilgi'] || '',
                tuzak: row['Tuzak Bilgi'] || ''
            },
            legislationRef: {
                code: row['Kanun No'] || '',
                name: row['Kanun Adı'] || '',
                article: row['Madde No'] || ''
            },
            tags: row['Etiketler'] ? row['Etiketler'].split(',').map(t=>t.trim()) : [],
            isFlaggedForReview: false,
            isActive: true
        };
    });
}

function validateAndPreview() {
    const table = document.getElementById('previewTableBody');
    table.innerHTML = '';
    let validCount = 0;

    parsedQuestions.forEach((q, index) => {
        const isValid = q.text && q.correctOption && q.options.length === 5;
        if(isValid) validCount++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><span class="badge secondary">${q.category}</span></td>
            <td><div class="text-truncate" style="max-width: 200px;">${q.text}</div></td>
            <td>${isValid ? '✅' : '❌ Eksik'}</td>
        `;
        if(!isValid) tr.style.background = 'rgba(255,0,0,0.1)';
        table.appendChild(tr);
    });

    document.getElementById('previewCard').style.display = 'block';
    document.getElementById('previewTitle').innerText = `Önizleme (${validCount} Geçerli / ${parsedQuestions.length} Toplam)`;
    
    const btn = document.getElementById('btnStartImport');
    btn.disabled = validCount === 0;
    btn.innerText = `🚀 ${validCount} Soruyu Yükle`;
    
    log(`✅ ${validCount} soru doğrulandı ve yüklemeye hazır.`);
}

async function startBatchImport() {
    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Yükleniyor...';
    
    const batchSize = 400; // Firestore limit 500
    let batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    let successCount = 0;

    log("💾 Veritabanına yazma işlemi başlatıldı...");

    try {
        for (let i = 0; i < parsedQuestions.length; i++) {
            const q = parsedQuestions[i];
            
            // Basit doğrulama (Validation)
            if (!q.text || !q.correctOption) continue;

            // Timestamp ekle
            q.createdAt = serverTimestamp();
            q.updatedAt = serverTimestamp();

            const docRef = doc(collection(db, "questions"));
            currentBatch.set(docRef, q);
            operationCount++;

            // Batch dolduysa listeye ekle ve yenisini oluştur
            if (operationCount === batchSize || i === parsedQuestions.length - 1) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                operationCount = 0;
            }
        }

        // Batchleri sırayla çalıştır
        for (let i = 0; i < batches.length; i++) {
            log(`📦 Paket ${i+1}/${batches.length} gönderiliyor...`);
            await batches[i].commit();
            successCount += (i === batches.length - 1) ? (parsedQuestions.length % batchSize || batchSize) : batchSize;
        }

        log(`🎉 İŞLEM TAMAMLANDI! Toplam ${parsedQuestions.length} soru yüklendi.`, "success");
        alert("Tüm sorular başarıyla yüklendi!");
        
        // Temizle
        parsedQuestions = [];
        document.getElementById('previewCard').style.display = 'none';
        document.getElementById('fileInput').value = '';

    } catch (error) {
        console.error(error);
        log(`❌ KRİTİK HATA: ${error.message}`, "error");
        alert("Yükleme sırasında bir hata oluştu. Logları kontrol edin.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Tekrar Yükle";
    }
}

function log(msg, type="info") {
    const logArea = document.getElementById('importLog');
    const color = type === 'error' ? '#ff6b6b' : (type === 'success' ? '#51cf66' : '#ced4da');
    const time = new Date().toLocaleTimeString();
    logArea.innerHTML += `<div style="color:${color}; margin-bottom:4px;">[${time}] ${msg}</div>`;
    logArea.scrollTop = logArea.scrollHeight;
}

// Kullanıcıya Excel Şablonu Oluşturur
function downloadTemplate() {
    const sampleData = [
        {
            "Kategori": "Yazı İşleri - Ortak - Anayasa",
            "Soru Metni": "1982 Anayasasına göre...",
            "A": "Seçenek 1",
            "B": "Seçenek 2",
            "C": "Seçenek 3",
            "D": "Seçenek 4",
            "E": "Seçenek 5",
            "Doğru Cevap": "A",
            "Zorluk": 3,
            "Çözüm Analiz": "Detaylı açıklama...",
            "Mevzuat Dayanak": "Anayasa m.12",
            "Hap Bilgi": "Kısa özet...",
            "Kanun No": "2709",
            "Madde No": "12"
        }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Şablon");
    XLSX.writeFile(wb, "Soru_Yukleme_Sablonu.xlsx");
}