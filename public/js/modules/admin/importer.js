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
                <p class="text-muted">Mevzuat ve anahtar kelime destekli otomatik eşleştirme, kalite kontrol ve güvenli toplu aktarım sistemi.</p>
            </div>
            <div class="d-flex gap-2">
                <button onclick="window.Importer.migrate()" class="btn btn-warning btn-sm">⚠️ Veritabanı Kelimelerini Güncelle</button>
                <button onclick="showGuide()" class="btn btn-guide">ℹ️ Format Rehberi</button>
            </div>
        </div>

        <div class="row importer-layout g-4 align-items-start">
            <div class="col-12 col-xl-4 d-flex flex-column importer-side-stack">
                <div id="importerDropzone" class="card p-5 text-center border-dashed importer-dropzone" onclick="document.getElementById('fileInput').click()">
                    <div class="importer-dropzone-icon">📂</div>
                    <h5>Dosya Seç (JSON/Excel)</h5>
                    <p class="text-muted small">Sürükleyip bırakabilir veya tıklayabilirsiniz. Sistem otomatik kalite kontrolü uygular.</p>
                    <input type="file" id="fileInput" accept=".json, .xlsx, .xls" style="display: none;">
                </div>

                <div class="card importer-ops-card p-3">
                    <h6 class="mb-2">Kalite Özeti</h6>
                    <div id="qualityStats" class="d-grid gap-2">
                        <div class="quality-card text-muted small">Dosya yüklendiğinde kalite raporu burada görünecek.</div>
                    </div>
                </div>
                
                <div class="card importer-log-card">
                    <div class="card-header py-2 d-flex justify-content-between align-items-center">
                        <small>İŞLEM GÜNLÜĞÜ</small>
                        <small id="logStatus" class="text-secondary">Hazır</small>
                    </div>
                    <div id="importLog" class="card-body p-2 importer-log-body">
                        <span class="text-muted">> Sistem hazır...</span>
                    </div>
                </div>
            </div>

            <div class="col-12 col-xl-8">
                <div class="card h-100 preview-card" id="previewCard" style="display:none;">
                    <div class="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
                        <div>
                            <h5 class="m-0 preview-title">Önizleme ve Onay</h5>
                            <small class="text-muted">Önerilen konu, güven skoru ve kontrol aksiyonlarını buradan yönetin.</small>
                        </div>
                        <div class="preview-stats" id="previewStats"></div>
                    </div>
                    <div class="d-flex flex-wrap justify-content-between preview-toolbar">
                        <div class="toolbar-group">
                            <button class="btn btn-outline-success btn-sm" onclick="window.Importer.approveHigh()">
                                <span class="btn-icon">🛡️</span> Güvenlileri Onayla
                            </button>
                            <button class="btn btn-outline-primary btn-sm" onclick="window.Importer.approveAll()">
                                <span class="btn-icon">📑</span> Tümünü Onayla
                            </button>
                            <button class="btn btn-outline-secondary btn-sm" onclick="window.Importer.approveSelected()">
                                <span class="btn-icon">✨</span> Seçilenleri Onayla
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="window.Importer.clearSelection()">
                                <span class="btn-icon">🧹</span> Seçimi Temizle
                            </button>
                        </div>
                        <div class="toolbar-group">
                            <select class="form-select form-select-sm filter-select" id="previewFilter" onchange="window.Importer.applyFilter()">
                                <option value="all">Tüm Sorular</option>
                                <option value="pending">Onay Bekleyenler</option>
                                <option value="approved">Onaylılar</option>
                                <option value="high">Yüksek Güven</option>
                                <option value="needs-review">Kontrol Gerekiyor</option>
                                <option value="issues">Kalite Sorunları</option>
                            </select>
                            <input type="text" class="form-control form-control-sm search-input" id="previewSearch" placeholder="Soru içinde ara..." oninput="window.Importer.applyFilter()">
                        </div>
                    </div>
                    <div class="table-responsive preview-table-wrap">
                        <table class="admin-table table-sm align-middle preview-table">
                            <thead style="position:sticky; top:0; z-index:10;">
                                <tr>
                                    <th style="width:34px;">
                                        <input type="checkbox" id="selectAllRows" onclick="window.Importer.toggleSelectAll(this.checked)">
                                    </th>
                                    <th style="width:40px;">#</th>
                                    <th>Soru Özeti</th>
                                    <th style="width:260px;">Önerilen Konu</th>
                                    <th style="width:120px;">Güven</th>
                                    <th style="width:120px;">Durum</th>
                                    <th style="width:140px;">Kontrol</th>
                                </tr>
                            </thead>
                            <tbody id="previewTableBody"></tbody>
                        </table>
                    </div>
                    <div class="card-footer d-flex justify-content-between align-items-center preview-footer">
                        <small class="text-muted" id="previewFooterInfo">0 soru seçildi.</small>
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

        <div id="questionPreviewModal" class="modal-overlay" style="display:none;">
                <div class="modal-content admin-modal-content importer-preview-modal">
                <div class="modal-header">
                    <h3>🧾 Soru Detayı</h3>
                    <button onclick="window.Importer.closePreview()" class="close-btn">&times;</button>
                </div>
                <div class="modal-body-scroll preview-modal-body" id="questionPreviewBody"></div>
            </div>
        </div>
    `;

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    setupDropzoneEvents();

    // Window export
    window.Importer = {
        save: startBatchImport,
        migrate: runKeywordMigration,
        updateTopic: updateRowTopic,
        approveRow: toggleRowApproval,
        approveHigh: approveHighConfidence,
        approveAll: approveAll,
        approveSelected: approveSelectedRows,
        clearSelection: clearSelection,
        toggleSelectAll: toggleSelectAll,
        toggleRowSelect: toggleRowSelect,
        applyFilter: applyFilter,
        openPreview: openQuestionPreview,
        savePreviewEdits: savePreviewEdits,
        closePreview: closeQuestionPreview,
        updateQuestionText: updateQuestionText
    };

    fetchTopics();
}

let parsedQuestions = [];
let allTopics = [];
let selectedRows = new Set();
let currentFilter = 'all';
let currentSearch = '';
let qualityStats = { total: 0, critical: 0, warning: 0, duplicates: 0, importable: 0 };

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
            let mappedKeywords = null;
            const dbTitle = topic.title.toLowerCase().trim();

            // 1. Tam Eşleşme Kontrolü
            if (TOPIC_KEYWORDS[topic.title]) {
                mappedKeywords = TOPIC_KEYWORDS[topic.title];
            } else {
                // 2. Fuzzy / Akıllı Eşleşme
                // Haritadaki her anahtarı gez
                const matchedKey = Object.keys(TOPIC_KEYWORDS).find(mapTitle => {
                    const mapTitleLower = mapTitle.toLowerCase();
                    // Örn: DB="Anayasa", Map="Türkiye Cumhuriyeti Anayasası" -> Eşleşir
                    // Örn: DB="İdare Hukuku", Map="İdare Hukuku" -> Eşleşir
                    return mapTitleLower.includes(dbTitle) || dbTitle.includes(mapTitleLower);
                });

                if (matchedKey) {
                    mappedKeywords = TOPIC_KEYWORDS[matchedKey];
                    // log(`Eşleşme Bulundu: "${topic.title}" -> "${matchedKey}"`);
                }
            }

            if (mappedKeywords) {
                const ref = doc(db, "topics", topic.id);
                const finalKeywords = mappedKeywords.map(k => k.toLowerCase());

                batch.update(ref, { keywords: finalKeywords });
                updateCount++;
            } else {
                // EŞLEŞME YOKSA: Konu başlığından otomatik kelime üret
                missingCount++;

                const ref = doc(db, "topics", topic.id);
                // Başlıktaki kelimeleri ayır (Örn: "İdari Yargılama Usulü" -> "idari", "yargılama", "usulü")
                const autoKeywords = [
                    topic.title.toLowerCase(),
                    ...topic.title.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['ve', 'ile', 'veya'].includes(w))
                ];

                // Benzersiz yap
                const uniqueKeywords = [...new Set(autoKeywords)];

                batch.update(ref, { keywords: uniqueKeywords });
                // Bunu da güncellendi sayabiliriz ama logda belirtelim
                // updateCount++; 
                console.log(`Otomatik kelime üretildi: ${topic.title} -> ${uniqueKeywords}`);
            }
        });

        if (updateCount > 0 || missingCount > 0) {
            await batch.commit();
            const totalProcessed = updateCount + missingCount;
            log(`✅ İŞLEM TAMAMLANDI: Toplam ${totalProcessed} konu işlendi.`, "success");
            log(`📌 ${updateCount} konu haritadan eşleşti.`, "success");
            log(`📌 ${missingCount} konu için başlıktan otomatik kelime üretildi.`, "warning");

            await fetchTopics(); // Belleği tazele
            showToast(`Tüm konular (${totalProcessed} adet) için anahtar kelimeler tanımlandı.`, "success");
        } else {
            log("Güncellenecek eşleşme bulunamadı. Konu başlıklarını kontrol edin.", "info");
        }

    } catch (e) {
        console.error(e);
        log("Güncelleme hatası: " + e.message, "error");
    }
}

// ============================================================
// --- DOSYA İŞLEME VE ANALİZ ---
// ============================================================


function setupDropzoneEvents() {
    const dropzone = document.getElementById('importerDropzone');
    const fileInput = document.getElementById('fileInput');
    if (!dropzone || !fileInput) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, e => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, e => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', e => {
        const files = e.dataTransfer?.files;
        if (!files || !files.length) return;
        fileInput.files = files;
        handleFileSelect({ target: fileInput });
    });
}

function normalizeText(value = '') {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function evaluateQuestionIssues(question) {
    const issues = [];
    if (!question.text || question.text.trim().length < 15) issues.push('Soru metni çok kısa veya boş');

    const options = Array.isArray(question.options) ? question.options : [];
    const filledOptions = options.filter(o => (o?.text || '').trim().length > 0);
    if (filledOptions.length < 4) issues.push('En az 4 dolu seçenek olmalı');

    const correct = (question.correctOption || '').toString().trim().toUpperCase();
    if (!correct) {
        issues.push('Doğru cevap bilgisi eksik');
    } else if (!filledOptions.some(o => (o.id || '').toUpperCase() === correct)) {
        issues.push('Doğru cevap, dolu seçeneklerle uyuşmuyor');
    }

    if (!question._suggestedTopicId) issues.push('Önerilen konu bulunamadı');
    return issues;
}

function recomputeQualityStats() {
    const occurrences = new Map();
    parsedQuestions.forEach(q => {
        const key = normalizeText(q.text);
        if (!key) return;
        occurrences.set(key, (occurrences.get(key) || 0) + 1);
    });

    let critical = 0;
    let warning = 0;
    let duplicates = 0;
    let importable = 0;

    parsedQuestions.forEach(q => {
        q._issues = evaluateQuestionIssues(q);
        const key = normalizeText(q.text);
        q._isDuplicate = !!key && (occurrences.get(key) || 0) > 1;
        if (q._isDuplicate) {
            q._issues.push('Aynı metin birden fazla soruda tekrar ediyor');
            duplicates++;
        }

        q._criticalIssue = q._issues.some(issue =>
            issue.includes('boş') || issue.includes('Doğru cevap') || issue.includes('4 dolu seçenek')
        );

        if (q._criticalIssue) critical++;
        if (!q._criticalIssue && q._issues.length > 0) warning++;
        if (!q._criticalIssue) importable++;
    });

    qualityStats = {
        total: parsedQuestions.length,
        critical,
        warning,
        duplicates,
        importable
    };

    renderQualityStats();
}

function renderQualityStats() {
    const box = document.getElementById('qualityStats');
    if (!box) return;

    if (!qualityStats.total) {
        box.innerHTML = '<div class="quality-card text-muted small">Dosya yüklendiğinde kalite raporu burada görünecek.</div>';
        return;
    }

    box.innerHTML = `
        <div class="quality-card"><strong>${qualityStats.total}</strong> toplam soru</div>
        <div class="quality-card"><strong>${qualityStats.importable}</strong> aktarılabilir soru</div>
        <div class="quality-card text-danger"><strong>${qualityStats.critical}</strong> kritik hata</div>
        <div class="quality-card text-warning"><strong>${qualityStats.warning}</strong> uyarı</div>
        <div class="quality-card"><strong>${qualityStats.duplicates}</strong> mükerrer aday</div>
    `;
}

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
        recomputeQualityStats();
        log(`${parsedQuestions.length} soru analiz edildi. Önizleme oluşturuluyor...`, "success");

        selectedRows.clear();
        currentFilter = 'all';
        currentSearch = '';
        const filterSelect = document.getElementById('previewFilter');
        const searchInput = document.getElementById('previewSearch');
        if (filterSelect) filterSelect.value = 'all';
        if (searchInput) searchInput.value = '';
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
        _suggestedTopicTitle: suggestedTopic.title,
        _issues: [],
        _criticalIssue: false,
        _isDuplicate: false
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
        // Metin benzerliği için basit bir kontrol
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

    // D) PARENT (ÜST KONU) KISITLAMASI
    // Eğer bulunan konu bir üst konuysa ve altında alt konular varsa, soru üst konuya eklenemez.
    // Alt konular arasında yeniden puanlama yaparak en uygununu seçmeliyiz.
    if (bestTopicId) {
        const children = allTopics.filter(t => t.parentId === bestTopicId);

        if (children.length > 0) {
            let bestChild = null;
            let bestChildScore = -1;
            const parentTitle = allTopics.find(t => t.id === bestTopicId)?.title || '';

            reasons.push(`Üst Konu (${parentTitle}) yerine alt konu arandı`);

            children.forEach(child => {
                let currentChildScore = 0;

                // 1. Keyword check
                if (child.keywords) {
                    child.keywords.forEach(kw => {
                        if (isNaN(kw) && text.includes(kw)) currentChildScore += 20;
                    });
                }

                // 2. Title similarity
                const titleParts = child.title.toLowerCase().split(' ').filter(w => w.length > 3);
                titleParts.forEach(p => { if (text.includes(p)) currentChildScore += 10; });

                if (currentChildScore > bestChildScore) {
                    bestChildScore = currentChildScore;
                    bestChild = child;
                }
            });

            if (bestChild) { // En az bir child bulundu veya hepsi 0 olsa bile ilkini (bestChildScore -1 oldugu icin hepsi 0 ise ilkini alir mi? Hayir, score 0 ise alır.)
                // bestChildScore initialization -1, so if score is 0 it is > -1. logic holds.
                bestTopicId = bestChild.id;
                // Skoru child'ın skoruna göre güncelle veya parent skorunu koru (ama güveni düşür)
                if (bestChildScore > 0) {
                    // Child da kelime bulduysa puanı artır
                    maxScore += bestChildScore;
                } else {
                    // Child için özel bir kelime bulamadı ama mecbur seçtik
                    reasons.push("Net alt konu bulunamadı, varsayılan seçildi");
                    // Güveni düşür ki kullanıcı kontrol etsin
                    if (maxScore > 45) maxScore = 45;
                }
            } else {
                // Çok nadir durum (children array dolu ama loop çalışmadı?!), garanti olsun
                bestTopicId = children[0].id;
                if (maxScore > 45) maxScore = 45;
            }
        }
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

    const filteredQuestions = getFilteredQuestions();
    let rows = filteredQuestions.map(q => {
        // Tooltip
        const tooltip = `Sebep: ${q._reasons.join(', ')}`;

        // Satır Rengi (Onay durumuna göre)
        const rowClass = q._status === 'approved' ? 'preview-row-approved' : '';
        const checkIcon = q._status === 'approved' ? '✅ Onaylı' : '⬜ Onayla';
        const hasIssues = q._issues && q._issues.length > 0;
        const statusClass = q._status === 'approved'
            ? 'approved'
            : (q._criticalIssue ? 'review' : (q._confidence === 'low' || hasIssues ? 'review' : 'pending'));
        const statusLabel = q._status === 'approved' ? 'Onaylandı' : (q._criticalIssue ? 'Kritik' : (hasIssues ? 'Uyarı' : (q._confidence === 'low' ? 'Kontrol' : 'Bekliyor')));
        const isChecked = selectedRows.has(q._id) ? 'checked' : '';
        const confidenceWidth = Math.min(Math.max(q._score, 0), 100);
        const confidenceClass = q._confidence === 'high' ? 'confidence-high' : (q._confidence === 'medium' ? 'confidence-medium' : 'confidence-low');
        const confidenceText = q._confidence === 'high' ? 'Yüksek' : (q._confidence === 'medium' ? 'Orta' : 'Düşük');

        return `
            <tr id="row-${q._id}" class="${rowClass}">
                <td class="text-center">
                    <input type="checkbox" class="form-check-input" ${isChecked} onclick="window.Importer.toggleRowSelect(${q._id}, this.checked)">
                </td>
                <td>${q._id + 1}</td>
                <td class="question-cell">
                    <textarea class="form-control form-control-sm question-textarea" rows="3" onchange="window.Importer.updateQuestionText(${q._id}, this.value)">${q.text}</textarea>
                    <div class="question-meta mt-1 d-flex justify-content-between text-muted small">
                        <span>Kategori: ${q.category || '-'}</span>
                    </div>
                    <div class="question-meta">
                        ${(q._issues || []).slice(0, 2).map(issue => `<span class="quality-chip ${q._criticalIssue ? 'critical' : 'warning'}">⚑ ${issue}</span>`).join('')}
                        ${q._issues && q._issues.length > 2 ? `<span class="quality-chip">+${q._issues.length - 2} ek</span>` : ''}
                    </div>
                </td>
                <td>
                    <select class="form-select form-select-sm topic-select" onchange="window.Importer.updateTopic(${q._id}, this.value)">
                        ${options.replace(`value="${q._suggestedTopicId}"`, `value="${q._suggestedTopicId}" selected`)}
                    </select>
                </td>
                <td class="text-center">
                    <div class="confidence-stack" title="${tooltip}">
                        <span class="confidence-badge ${confidenceClass === 'confidence-high' ? 'bg-success text-white' : (confidenceClass === 'confidence-medium' ? 'bg-warning text-dark' : 'bg-secondary text-white')}">
                            %${q._score} - ${confidenceText}
                        </span>
                        <div class="confidence-progress">
                            <span class="${confidenceClass === 'confidence-high' ? 'bg-success' : (confidenceClass === 'confidence-medium' ? 'bg-warning' : 'bg-secondary')}" role="progressbar" style="width: ${confidenceWidth}%"></span>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                    <span class="status-pill ${statusClass}">${statusLabel}</span>
                </td>
                <td class="text-center">
                    <div class="control-buttons">
                        <button class="btn action-btn-success" onclick="window.Importer.approveRow(${q._id})">${checkIcon}</button>
                        <button class="btn action-btn-primary" onclick="window.Importer.openPreview(${q._id})">🔍 İncele</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    table.innerHTML = rows;
    updatePreviewStats();
    updateSelectionFooter();
    updateSelectAllState();
    updateSaveButtonState();
}

// ============================================================
// --- AKSİYONLAR ---
// ============================================================

function toggleRowApproval(index) {
    const q = parsedQuestions[index];
    q._status = q._status === 'approved' ? 'pending' : 'approved';
    updateRowUI(index);
}

function updateRowTopic(index, newTopicId) {
    const q = parsedQuestions[index];
    q._suggestedTopicId = newTopicId;
    const topic = allTopics.find(t => t.id === newTopicId);
    q._suggestedTopicTitle = topic ? topic.title : '';

    // Kullanıcı elle değiştirdiyse otomatik onayla
    if (q._status !== 'approved') {
        q._status = 'approved';
    }
    recomputeQualityStats();
    updateRowUI(index);
}

function updateQuestionText(index, newText) {
    const q = parsedQuestions[index];
    if (q) {
        q.text = newText;
        recomputeQualityStats();
        updateRowUI(index);
    }
}

function approveHighConfidence() {
    let count = 0;
    parsedQuestions.forEach((q, idx) => {
        if (q._confidence === 'high' && q._status !== 'approved') {
            q._status = 'approved';
            count++;
        }
    });
    renderPreviewTable();
    showToast(`${count} yüksek güvenli soru onaylandı.`, "success");
}

function approveAll() {
    parsedQuestions.forEach((q, idx) => {
        q._status = 'approved';
    });
    renderPreviewTable();
    showToast("Tüm sorular onaylandı.", "success");
}

function approveSelectedRows() {
    if (selectedRows.size === 0) {
        showToast("Onaylanacak seçili soru bulunamadı.", "warning");
        return;
    }
    selectedRows.forEach(id => {
        const q = parsedQuestions[id];
        if (q) q._status = 'approved';
    });
    renderPreviewTable();
    showToast(`${selectedRows.size} soru seçili olarak onaylandı.`, "success");
}

function clearSelection() {
    selectedRows.clear();
    renderPreviewTable();
    showToast("Seçim temizlendi.", "info");
}

function toggleSelectAll(isChecked) {
    const filteredQuestions = getFilteredQuestions();
    filteredQuestions.forEach(q => {
        if (isChecked) {
            selectedRows.add(q._id);
        } else {
            selectedRows.delete(q._id);
        }
    });
    updateSelectionFooter();
    renderPreviewTable();
}

function toggleRowSelect(index, isChecked) {
    if (isChecked) {
        selectedRows.add(index);
    } else {
        selectedRows.delete(index);
    }
    updateSelectionFooter();
    updateSelectAllState();
}

function updateRowUI(index) {
    const row = document.getElementById(`row-${index}`);
    const q = parsedQuestions[index];
    if (!row || !q) return;

    row.classList.toggle('preview-row-approved', q._status === 'approved');

    const controlButton = row.querySelector('.control-buttons .btn');
    if (controlButton) {
        controlButton.innerText = q._status === 'approved' ? '✅ Onaylı' : '⬜ Onayla';
    }

    const statusPill = row.querySelector('.status-pill');
    if (statusPill) {
        const hasIssues = q._issues && q._issues.length > 0;
        const statusClass = q._status === 'approved'
            ? 'approved'
            : (q._criticalIssue ? 'review' : (q._confidence === 'low' || hasIssues ? 'review' : 'pending'));
        const statusLabel = q._status === 'approved' ? 'Onaylandı' : (q._criticalIssue ? 'Kritik' : (hasIssues ? 'Uyarı' : (q._confidence === 'low' ? 'Kontrol' : 'Bekliyor')));
        statusPill.className = `status-pill ${statusClass}`;
        statusPill.textContent = statusLabel;
    }
    updatePreviewStats();
    updateSaveButtonState();
}

function applyFilter() {
    const filterSelect = document.getElementById('previewFilter');
    const searchInput = document.getElementById('previewSearch');
    currentFilter = filterSelect ? filterSelect.value : 'all';
    currentSearch = searchInput ? searchInput.value.trim().toLowerCase() : '';
    renderPreviewTable();
}

function getFilteredQuestions() {
    return parsedQuestions.filter(q => {
        const matchesSearch = !currentSearch || [
            q.text,
            q.category,
            q._suggestedTopicTitle
        ].some(value => (value || '').toLowerCase().includes(currentSearch));

        if (!matchesSearch) return false;

        switch (currentFilter) {
            case 'pending':
                return q._status !== 'approved';
            case 'approved':
                return q._status === 'approved';
            case 'high':
                return q._confidence === 'high';
            case 'needs-review':
                return (q._confidence === 'low' || q._criticalIssue) && q._status !== 'approved';
            case 'issues':
                return (q._issues || []).length > 0;
            default:
                return true;
        }
    });
}

function updatePreviewStats() {
    const stats = document.getElementById('previewStats');
    if (!stats) return;
    const total = parsedQuestions.length;
    const approved = parsedQuestions.filter(q => q._status === 'approved').length;
    const pending = total - approved;
    const high = parsedQuestions.filter(q => q._confidence === 'high').length;
    const review = parsedQuestions.filter(q => (q._confidence === 'low' || q._criticalIssue) && q._status !== 'approved').length;
    const critical = parsedQuestions.filter(q => q._criticalIssue).length;

    stats.innerHTML = `
        <span class="preview-stat"><strong>${total}</strong> Toplam</span>
        <span class="preview-stat"><strong>${approved}</strong> Onaylı</span>
        <span class="preview-stat"><strong>${pending}</strong> Bekleyen</span>
        <span class="preview-stat"><strong>${high}</strong> Yüksek Güven</span>
        <span class="preview-stat"><strong>${review}</strong> Kontrol</span>
        <span class="preview-stat"><strong>${critical}</strong> Kritik</span>
    `;
}

function updateSelectionFooter() {
    const footer = document.getElementById('previewFooterInfo');
    if (!footer) return;
    footer.innerText = `${selectedRows.size} soru seçildi.`;
}

function updateSelectAllState() {
    const selectAll = document.getElementById('selectAllRows');
    if (!selectAll) return;
    const filtered = getFilteredQuestions();
    const allSelected = filtered.length > 0 && filtered.every(q => selectedRows.has(q._id));
    selectAll.checked = allSelected;
}

function openQuestionPreview(index) {
    const q = parsedQuestions[index];
    if (!q) return;
    const modal = document.getElementById('questionPreviewModal');
    const body = document.getElementById('questionPreviewBody');
    if (!modal || !body) return;

    const options = (q.options || []).map(opt => `
        <div class="modal-field">
            <label>${opt.id || ''} Seçeneği</label>
            <input class="form-control form-control-sm" data-option-id="${opt.id || ''}" value="${opt.text || ''}">
        </div>
    `).join('');
    const reasons = q._reasons.length ? q._reasons.join(', ') : 'Belirgin eşleşme bulunamadı';
    const confidenceText = q._confidence === 'high' ? 'Yüksek' : (q._confidence === 'medium' ? 'Orta' : 'Düşük');
    const optionsFallback = `
        <div class="modal-field">
            <label>Seçenek A</label>
            <input class="form-control form-control-sm" data-option-id="A" value="">
        </div>
    `;

    body.innerHTML = `
        <div class="preview-section">
            <h6>Soru Metni</h6>
            <div class="modal-field">
                <label>Soru</label>
                <textarea class="form-control" rows="4" id="previewQuestionText">${q.text || ''}</textarea>
            </div>
        </div>
        <div class="preview-section">
            <h6>Cevap Seçenekleri</h6>
            <div class="preview-modal-body">
                ${options || optionsFallback}
            </div>
        </div>
        <div class="preview-section">
            <h6>Kategori ve Zorluk</h6>
            <div class="modal-field">
                <label>Gelen Kategori</label>
                <input class="form-control form-control-sm" id="previewQuestionCategory" value="${q.category || ''}">
            </div>
            <div class="modal-field">
                <label>Zorluk</label>
                <select class="form-select form-select-sm" id="previewQuestionDifficulty">
                    <option value="1" ${q.difficulty === 1 ? 'selected' : ''}>1</option>
                    <option value="2" ${q.difficulty === 2 ? 'selected' : ''}>2</option>
                    <option value="3" ${q.difficulty === 3 || !q.difficulty ? 'selected' : ''}>3</option>
                    <option value="4" ${q.difficulty === 4 ? 'selected' : ''}>4</option>
                    <option value="5" ${q.difficulty === 5 ? 'selected' : ''}>5</option>
                </select>
            </div>
        </div>
        <div class="preview-section">
            <h6>Önerilen Konu ve Güven</h6>
            <p><strong>${q._suggestedTopicTitle || '-'}</strong></p>
            <p>Skor: ${q._score} (${confidenceText})</p>
            <p>Gerekçe: ${reasons}</p>
        </div>
        <div class="preview-section">
            <h6>Aksiyon</h6>
            <div class="modal-actions">
                <div class="control-buttons">
                    <button class="btn btn-light border" onclick="window.Importer.approveRow(${q._id})">✅ Onay Durumunu Değiştir</button>
                </div>
                <div class="control-buttons">
                    <button class="btn btn-outline-primary" onclick="window.Importer.savePreviewEdits(${q._id})">💾 Değişiklikleri Kaydet</button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeQuestionPreview() {
    const modal = document.getElementById('questionPreviewModal');
    if (modal) modal.style.display = 'none';
}

function savePreviewEdits(index) {
    const q = parsedQuestions[index];
    if (!q) return;

    const textInput = document.getElementById('previewQuestionText');
    const categoryInput = document.getElementById('previewQuestionCategory');
    const difficultyInput = document.getElementById('previewQuestionDifficulty');
    if (textInput) q.text = textInput.value.trim();
    if (categoryInput) q.category = categoryInput.value.trim();
    if (difficultyInput) q.difficulty = Number(difficultyInput.value) || q.difficulty || 3;

    const optionInputs = document.querySelectorAll('#questionPreviewBody input[data-option-id]');
    if (optionInputs.length > 0) {
        const updatedOptions = [];
        optionInputs.forEach(input => {
            const id = input.getAttribute('data-option-id') || '';
            updatedOptions.push({ id, text: input.value.trim() });
        });
        q.options = updatedOptions;
    }

    recomputeQualityStats();
    renderPreviewTable();
    showToast("Soru güncellendi.", "success");
}

function updateSaveButtonState() {
    const approvedCount = parsedQuestions.filter(q => q._status === 'approved').length;
    const importableCount = parsedQuestions.filter(q => q._status === 'approved' && !q._criticalIssue && !q._isDuplicate).length;
    const btn = document.getElementById('btnStartImport');
    if (!btn) return;
    btn.disabled = importableCount === 0;
    btn.innerText = importableCount > 0
        ? `Seçili ${importableCount} Soruyu Kaydet`
        : (approvedCount > 0 ? 'Kalite kontrolü nedeniyle beklemede' : 'Onaylanan Yok');
}

async function startBatchImport() {
    const approved = parsedQuestions.filter(q => q._status === 'approved');
    if (approved.length === 0) return;

    const importable = approved.filter(q => !q._criticalIssue && !q._isDuplicate);
    const blocked = approved.length - importable.length;
    if (importable.length === 0) {
        showToast('Onaylı soruların tamamında kritik hata veya mükerrer içerik var.', 'warning');
        return;
    }

    if (!await showConfirm(`${importable.length} soru veritabanına kaydedilecek.${blocked > 0 ? ` ${blocked} soru kalite filtresi nedeniyle atlanacak.` : ''} Onaylıyor musunuz?`)) return;

    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    btn.innerText = "Kaydediliyor...";

    try {
        const batchSize = 450;
        for (let i = 0; i < importable.length; i += batchSize) {
            const chunk = importable.slice(i, i + batchSize);
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
