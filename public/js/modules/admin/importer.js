import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import { collection, writeBatch, doc, serverTimestamp, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";
import { TOPIC_KEYWORDS } from './keyword-map.js';

export function initImporterPage() {
    const container = document.getElementById('section-importer');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📥 Akıllı Soru Yükleme</h2>
                <p class="text-muted">Mevzuat ve anahtar kelime destekli otomatik eşleştirme sistemi.</p>
            </div>
            <div class="d-flex gap-2">
                <button onclick="window.Importer.migrate()" class="btn btn-warning btn-sm">⚠️ Veritabanı Kelimelerini Güncelle</button>
                <button onclick="showGuide()" class="btn btn-guide">ℹ️ Format Rehberi</button>
            </div>
        </div>

        <div class="row">
            <div class="col-md-5">
                <div class="card p-5 text-center border-dashed" style="border: 2px dashed var(--border-color); cursor:pointer;" onclick="document.getElementById('fileInput').click()">
                    <div style="font-size: 3rem; margin-bottom: 10px;">📂</div>
                    <h5>Dosya Seç (JSON/Excel)</h5>
                    <p class="text-muted small">Sürükleyip bırakabilir veya tıklayabilirsiniz.</p>
                    <input type="file" id="fileInput" accept=".json, .xlsx, .xls" style="display: none;">
                </div>
                
                <div class="card mt-3 bg-dark text-white">
                    <div class="card-header py-2 border-secondary d-flex justify-content-between align-items-center">
                        <small>İŞLEM GÜNLÜĞÜ</small>
                        <small id="logStatus" class="text-secondary">Hazır</small>
                    </div>
                    <div id="importLog" class="card-body p-2" style="height: 150px; overflow-y: auto; font-family: monospace; font-size: 0.8rem;">
                        <span class="text-muted">> Sistem hazır...</span>
                    </div>
                </div>
            </div>

            <div class="col-md-7">
                <div class="card h-100" id="previewCard" style="display:none;">
                    <div class="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
                        <h5 class="m-0">Önizleme ve Onay</h5>
                        <div class="d-flex gap-2">
                             <button class="btn btn-outline-success btn-sm" onclick="window.Importer.approveHigh()">✅ Yüksek Güvenlileri Onayla</button>
                             <button class="btn btn-outline-primary btn-sm" onclick="window.Importer.approveAll()">✅ Tümünü Onayla</button>
                        </div>
                    </div>
                    <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                        <table class="admin-table table-sm" style="font-size: 0.9rem;">
                            <thead style="position:sticky; top:0; z-index:10;">
                                <tr>
                                    <th style="width:40px;">#</th>
                                    <th>Soru Özeti</th>
                                    <th style="width:250px;">Önerilen Konu</th>
                                    <th style="width:100px;">Güven</th>
                                    <th style="width:100px;">Durum</th>
                                </tr>
                            </thead>
                            <tbody id="previewTableBody"></tbody>
                        </table>
                    </div>
                    <div class="card-footer text-end">
                        <button id="btnStartImport" class="btn btn-success" disabled onclick="window.Importer.save()">Veritabanına Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- REHBER MODALI (Aynı İçerik) -->
        <div id="guideModal" class="modal-overlay" style="display:none;">
             <div class="modal-content admin-modal-content">
                <div class="modal-header">
                    <h3>📋 Format Rehberi</h3>
                    <button onclick="document.getElementById('guideModal').style.display='none'" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll">
                    <p>JSON formatı önerilir. Excel yüklemelerinde 'Soru Metni', 'A', 'B', 'C', 'D', 'E', 'Doğru Cevap' sütunları zorunludur.</p>
                    <p>Mevzuat kodu (örn: 5271) veya anahtar kelime (örn: tutuklama) içeren sorular otomatik eşleştirilir.</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    // Window export
    window.Importer = {
        save: startBatchImport,
        migrate: runKeywordMigration,
        updateTopic: updateRowTopic,
        approveRow: toggleRowApproval,
        approveHigh: approveHighConfidence,
        approveAll: approveAll
    };

    fetchTopics();
}

let parsedQuestions = [];
let allTopics = [];

// ============================================================
// --- VERİ HAZIRLIĞI VE GÖÇ (MIGRATION) ---
// ============================================================

async function fetchTopics() {
    try {
        const snapshot = await getDocs(query(collection(db, "topics"), orderBy("title", "asc")));
        allTopics = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            allTopics.push({
                id: doc.id,
                title: d.title,
                parentId: d.parentId,
                keywords: d.keywords || []
            });
        });
        log(`${allTopics.length} konu ve anahtar kelimeleri belleğe alındı.`, "success");
    } catch (e) {
        console.error(e);
        log("Konu listesi alınamadı!", "error");
    }
}

async function runKeywordMigration() {
    const confirm = await showConfirm("Tüm konuların anahtar kelimeleri 'keyword-map.js' dosyasındaki verilerle güncellenecektir. Onaylıyor musunuz?", {
        title: "Veritabanı Güncelleme",
        confirmText: "Kelimeleri Güncelle (Overwrite)",
        cancelText: "İptal"
    });
    if (!confirm) return;

    log("Veritabanı güncellemesi başlatılıyor...", "warning");

    try {
        const batch = writeBatch(db);
        let updateCount = 0;
        let missingCount = 0;

        // DB'deki her konuyu gez
        allTopics.forEach(topic => {
            // Haritada bu başlık var mı?
            const mappedKeywords = TOPIC_KEYWORDS[topic.title];

            if (mappedKeywords) {
                const ref = doc(db, "topics", topic.id);
                // Mevcut kelimeleri korumak isterseniz birleştirin, burada OVERWRITE yapıyoruz (temiz başlangıç için)
                // İstenirse: const merged = [...new Set([...(topic.keywords||[]), ...mappedKeywords])];
                const finalKeywords = mappedKeywords.map(k => k.toLowerCase());

                batch.update(ref, { keywords: finalKeywords });
                updateCount++;
            } else {
                missingCount++;
                // console.warn("Haritada bulunamayan konu:", topic.title);
            }
        });

        if (updateCount > 0) {
            await batch.commit();
            log(`✅ ${updateCount} konu güncellendi. (${missingCount} konu haritada yok)`, "success");
            await fetchTopics(); // Belleği tazele
            showToast(`${updateCount} konu başarıyla güncellendi.`, "success");
        } else {
            log("Güncellenecek eşleşme bulunamadı.", "info");
        }

    } catch (e) {
        console.error(e);
        log("Güncelleme hatası: " + e.message, "error");
    }
}

// ============================================================
// --- DOSYA İŞLEME VE ANALİZ ---
// ============================================================

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    log(`Dosya okunuyor: ${file.name}`);
    parsedQuestions = [];

    try {
        let rawData = [];
        if (file.name.endsWith('.json')) {
            const text = await file.text();
            rawData = JSON.parse(text);
        } else {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            rawData = XLSX.utils.sheet_to_json(firstSheet);
            rawData = convertExcelData(rawData); // Excel formatını JSON standardına çevir
        }

        if (!Array.isArray(rawData)) throw new Error("Veri listesi bulunamadı.");

        // Analiz Başlat
        parsedQuestions = rawData.map((q, index) => analyzeQuestion(q, index));
        log(`${parsedQuestions.length} soru analiz edildi. Önizleme oluşturuluyor...`, "success");

        renderPreviewTable();

    } catch (error) {
        console.error(error);
        log(`Hata: ${error.message}`, "error");
    }
}

function analyzeQuestion(q, index) {
    const text = (q.text || '').toLowerCase();
    const cleanCategory = (q.category || '').trim();

    // 1. CONFIDENCE HESAPLA
    const { bestTopicId, score, reasons, matchType } = calculateConfidence(text, cleanCategory);

    // 2. STATÜ BELİRLE
    let status = 'pending'; // pending, approved, ignored
    let confidenceLabel = 'low'; // low, medium, high

    if (score >= 80) confidenceLabel = 'high';
    else if (score >= 40) confidenceLabel = 'medium';

    // Eşleşen konuyu bul (yoksa null)
    let suggestedTopic = allTopics.find(t => t.id === bestTopicId) || { id: '', title: q.category || 'Genel' };

    return {
        ...q,
        _id: index,
        _score: score,
        _reasons: reasons,
        _matchType: matchType,
        _confidence: confidenceLabel,
        _status: status, // Kullanıcı onayı için
        _suggestedTopicId: suggestedTopic.id,
        _suggestedTopicTitle: suggestedTopic.title
    };
}

function calculateConfidence(text, inputCategoryName) {
    let bestTopicId = null;
    let maxScore = 0;
    let reasons = [];
    let matchType = 'none'; // keyword, legislation, similarity

    // A) MEVZUAT NO KONTROLÜ (En Güçlü)
    // Metin içinde 4 haneli sayıları (2709, 5271 vb.) ara
    const legislationMatches = text.match(/\b\d{3,4}\b/g) || [];

    if (legislationMatches.length > 0) {
        for (const topic of allTopics) {
            const keywords = topic.keywords || [];
            // Konunun keywordlerinde bu sayılardan biri var mı?
            const match = legislationMatches.find(num => keywords.includes(num));
            if (match) {
                return {
                    bestTopicId: topic.id,
                    score: 100,
                    reasons: [`Kanun No Eşleşmesi: ${match}`],
                    matchType: 'legislation'
                };
            }
        }
    }

    // B) KELİME TARAMASI
    allTopics.forEach(topic => {
        let currentScore = 0;
        let matchedKw = [];
        const keywords = topic.keywords || [];

        keywords.forEach(kw => {
            // Sadece sayı olanları zaten yukarıda baktık, metinlere bak
            if (isNaN(kw) && text.includes(kw)) {
                currentScore += 20; // Her kelime 20 puan
                matchedKw.push(kw);
            }
        });

        // Eğer kullanıcı zaten doğru bir kategori adı yazmışsa
        if (inputCategoryName && topic.title.toLowerCase().includes(inputCategoryName.toLowerCase())) {
            currentScore += 50;
            matchedKw.push("(Kategori Adı)");
        }

        if (currentScore > maxScore) {
            maxScore = currentScore;
            bestTopicId = topic.id;
            reasons = matchedKw;
            matchType = 'keyword';
        }
    });

    // C) FALLBACK (Skor çok düşükse bile en iyiyi döndür, ama güven 'low' olacak)
    if (maxScore === 0) {
        // Metin benzerliği için basit bir kontrol (Levenshtein ağır kaçar, include ile yetinelim)
        allTopics.forEach(topic => {
            const titleParts = topic.title.toLowerCase().split(' ').filter(w => w.length > 4);
            let hit = 0;
            titleParts.forEach(p => { if (text.includes(p)) hit++; });
            if (hit > 0 && hit * 10 > maxScore) {
                maxScore = hit * 10;
                bestTopicId = topic.id;
                reasons = ["Başlık Benzerliği"];
                matchType = 'similarity';
            }
        });
    }

    // Tavan puan 100
    return { bestTopicId, score: Math.min(maxScore, 100), reasons, matchType };
}

// ============================================================
// --- ARAYÜZ VE TABLO (SMART UI) ---
// ============================================================

const topicOptionsHTML = () => {
    // Hiyerarşik Dropdown
    let html = `<option value="">-- Seçiniz --</option>`;
    // Parentları bul
    const parents = allTopics.filter(t => !t.parentId);
    parents.forEach(p => {
        html += `<option value="${p.id}" style="font-weight:bold;">${p.title}</option>`;
        const children = allTopics.filter(t => t.parentId === p.id);
        children.forEach(c => {
            html += `<option value="${c.id}">&nbsp;&nbsp;↳ ${c.title}</option>`;
        });
    });
    // Yetim konular
    const orphans = allTopics.filter(t => t.parentId && !allTopics.find(x => x.id === t.parentId));
    if (orphans.length) {
        html += `<optgroup label="Diğer">`;
        orphans.forEach(o => html += `<option value="${o.id}">${o.title}</option>`);
        html += `</optgroup>`;
    }
    return html;
};

function renderPreviewTable() {
    const table = document.getElementById('previewTableBody');
    document.getElementById('previewCard').style.display = 'block';

    // Dropdown HTML'ini bir kere oluştur (Performans)
    const options = topicOptionsHTML();

    let rows = parsedQuestions.map(q => {
        // Güven Rozeti
        let badgeClass = 'bg-secondary';
        let badgeText = `${q._score} - Düşük`;
        if (q._confidence === 'high') { badgeClass = 'bg-success'; badgeText = `${q._score} - Yüksek`; }
        else if (q._confidence === 'medium') { badgeClass = 'bg-warning text-dark'; badgeText = `${q._score} - Orta`; }

        // Tooltip
        const tooltip = `Sebep: ${q._reasons.join(', ')}`;

        // Satır Rengi (Onay durumuna göre)
        const rowBg = q._status === 'approved' ? 'background:rgba(16, 185, 129, 0.1);' : '';
        const checkIcon = q._status === 'approved' ? '✅' : '⬜';

        return `
            <tr id="row-${q._id}" style="${rowBg}">
                <td>${q._id + 1}</td>
                <td>
                    <div class="text-truncate" style="max-width: 300px;" title="${q.text}">${q.text}</div>
                    <small class="text-muted">Gelen Kategori: ${q.category || '-'}</small>
                </td>
                <td>
                    <select class="form-select form-select-sm" onchange="window.Importer.updateTopic(${q._id}, this.value)">
                        ${options.replace(`value="${q._suggestedTopicId}"`, `value="${q._suggestedTopicId}" selected`)}
                    </select>
                </td>
                <td>
                    <span class="badge ${badgeClass}" title="${tooltip}" style="cursor:help;">${badgeText}</span>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-light border" onclick="window.Importer.approveRow(${q._id})">
                        ${checkIcon}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    table.innerHTML = rows;
    updateSaveButtonState();
}

// ============================================================
// --- AKSİYONLAR ---
// ============================================================

function toggleRowApproval(index) {
    const q = parsedQuestions[index];
    q._status = q._status === 'approved' ? 'pending' : 'approved';

    // UI Güncelle (Tüm tabloyu render etme, sadece satırı boya)
    const row = document.getElementById(`row-${index}`);
    const btn = row.querySelector('button');
    if (q._status === 'approved') {
        row.style.background = 'rgba(16, 185, 129, 0.1)';
        btn.innerText = '✅';
    } else {
        row.style.background = '';
        btn.innerText = '⬜';
    }
    updateSaveButtonState();
}

function updateRowTopic(index, newTopicId) {
    const q = parsedQuestions[index];
    q._suggestedTopicId = newTopicId;
    const topic = allTopics.find(t => t.id === newTopicId);
    q._suggestedTopicTitle = topic ? topic.title : '';

    // Kullanıcı elle değiştirdiyse otomatik onayla
    if (q._status !== 'approved') {
        toggleRowApproval(index);
    }
}

function approveHighConfidence() {
    let count = 0;
    parsedQuestions.forEach((q, idx) => {
        if (q._confidence === 'high' && q._status !== 'approved') {
            q._status = 'approved';
            count++;
            // UI Update
            const row = document.getElementById(`row-${idx}`);
            if (row) {
                row.style.background = 'rgba(16, 185, 129, 0.1)';
                row.querySelector('button').innerText = '✅';
            }
        }
    });
    showToast(`${count} yüksek güvenli soru onaylandı.`, "success");
    updateSaveButtonState();
}

function approveAll() {
    parsedQuestions.forEach((q, idx) => {
        q._status = 'approved';
        const row = document.getElementById(`row-${idx}`);
        if (row) {
            row.style.background = 'rgba(16, 185, 129, 0.1)';
            row.querySelector('button').innerText = '✅';
        }
    });
    showToast("Tüm sorular onaylandı.", "success");
    updateSaveButtonState();
}

function updateSaveButtonState() {
    const approvedCount = parsedQuestions.filter(q => q._status === 'approved').length;
    const btn = document.getElementById('btnStartImport');
    btn.disabled = approvedCount === 0;
    btn.innerText = approvedCount > 0 ? `Seçili ${approvedCount} Soruyu Kaydet` : 'Onaylanan Yok';
}

async function startBatchImport() {
    const approved = parsedQuestions.filter(q => q._status === 'approved');
    if (approved.length === 0) return;

    if (!await showConfirm(`${approved.length} soru veritabanına kaydedilecek. Onaylıyor musunuz?`)) return;

    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    btn.innerText = "Kaydediliyor...";

    try {
        const batchSize = 450;
        for (let i = 0; i < approved.length; i += batchSize) {
            const chunk = approved.slice(i, i + batchSize);
            const batch = writeBatch(db);

            chunk.forEach(q => {
                const docRef = doc(collection(db, "questions"));
                batch.set(docRef, {
                    text: q.text,
                    options: q.options || [], // Excel conv fonk. burayı doldurmalı
                    correctOption: q.correctOption,
                    topicId: q._suggestedTopicId,
                    topicName: q._suggestedTopicTitle,
                    difficulty: q.difficulty || 3,
                    createdAt: serverTimestamp(),
                    isActive: true,
                    // Diğer alanlar...
                    solution: q.solution || {},
                    type: q.type || 'standard'
                });
            });

            await batch.commit();
            log(`Paket yüklendi: ${chunk.length} soru.`, "success");
        }

        showToast("İşlem başarıyla tamamlandı!", "success");
        setTimeout(() => {
            document.getElementById('previewCard').style.display = 'none';
            document.getElementById('fileInput').value = '';
        }, 2000);

    } catch (e) {
        console.error(e);
        log("Kayıt hatası: " + e.message, "error");
        btn.disabled = false;
    }
}

// Helper: Excel Dönüştürücü (Basitleştirilmiş)
function convertExcelData(rawData) {
    return rawData.map(row => ({
        text: row['Soru Metni'] || row['text'] || '',
        category: row['Kategori'] || row['category'] || '',
        difficulty: row['Zorluk'] || 3,
        correctOption: row['Doğru Cevap'] || row['correctOption'],
        options: [
            { id: 'A', text: row['A'] || '' },
            { id: 'B', text: row['B'] || '' },
            { id: 'C', text: row['C'] || '' },
            { id: 'D', text: row['D'] || '' },
            { id: 'E', text: row['E'] || '' }
        ],
        solution: {
            analiz: row['Çözüm'] || ''
        }
    }));
}

function log(msg, type = "info") {
    const area = document.getElementById('importLog');
    const color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#9ca3af');
    area.innerHTML += `<div style="color:${color}">> ${msg}</div>`;
    area.scrollTop = area.scrollHeight;

    document.getElementById('logStatus').innerText = type === 'success' ? 'İşlem Tamam' : 'İşleniyor...';
}

window.showGuide = () => document.getElementById('guideModal').style.display = 'flex';

