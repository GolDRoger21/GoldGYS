/* DOSYA: public/js/modules/admin/topics.ui.js */

// Tüm CSS stillerini JS içine gömdük ki dosya import edildiğinde otomatik çalışsın.
const STYLES = `
<style>
    /* --- MODAL & LAYOUT --- */
    .studio-modal-container {
        width: 98vw; height: 96vh; max-width: 1900px; padding: 0;
        overflow: hidden; border: none; display: flex; flex-direction: column;
        background: #fff; border-radius: 8px;
    }
    .studio-header {
        height: 60px; background: #fff; border-bottom: 1px solid #e2e8f0;
        display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;
    }
    .studio-layout { display: flex; flex: 1; overflow: hidden; height: 100%; }
    
    /* --- SIDEBAR --- */
    .studio-sidebar {
        width: 320px; background: #f8fafc; border-right: 1px solid #e2e8f0;
        display: flex; flex-direction: column; flex-shrink: 0;
    }
    .sidebar-header-modern { padding: 12px; background: #fff; border-bottom: 1px solid #e2e8f0; }
    .nav-list-scroll { flex: 1; overflow-y: auto; padding: 10px; }
    .sidebar-footer { padding: 12px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; gap: 8px; }
    
    /* Segmented Control */
    .segmented-control { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; }
    .segment-btn {
        flex: 1; text-align: center; padding: 6px; font-size: 0.85rem; font-weight: 600;
        color: #64748b; border-radius: 6px; cursor: pointer; border: none; background: transparent; transition: all 0.2s;
    }
    .segment-btn.active { background: #fff; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }

    /* --- EDITOR AREA --- */
    .studio-editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fff; position: relative; }
    
    /* Toolbar */
    .editor-toolbar {
        height: 60px; background: #fff; border-bottom: 1px solid #e2e8f0;
        display: flex; align-items: center; justify-content: space-between; padding: 0 24px;
        flex-shrink: 0; z-index: 10;
    }
    .editor-title-input {
        border: none; font-size: 1.2rem; font-weight: 600; color: #1e293b; width: 100%; outline: none;
        border-bottom: 2px solid transparent; transition: border 0.2s;
    }
    .editor-title-input:focus { border-bottom-color: var(--color-primary, #d4af37); }
    
    /* Workspace */
    .editor-workspace { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }
    .form-scroll-area { flex: 1; overflow-y: auto; padding: 30px; }
    
    /* --- TEST EDITOR (SPLIT VIEW) --- */
    .test-filter-bar {
        padding: 10px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
        display: flex; gap: 15px; align-items: end; flex-wrap: wrap;
    }
    .split-view-container { display: flex; flex: 1; overflow: hidden; }
    .split-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .split-col:first-child { border-right: 1px solid #e2e8f0; background: #fff; } /* Pool */
    .split-col:last-child { background: #fdfdfd; } /* Paper */
    .split-header {
        padding: 10px 15px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
        color: #64748b; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;
    }
    .pool-list-area { flex: 1; overflow-y: auto; padding: 15px; }

    /* --- MATERIALS --- */
    .add-mat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .add-mat-btn {
        padding: 15px; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; cursor: pointer;
        transition: all 0.2s; color: #64748b; background: #f8fafc;
    }
    .add-mat-btn:hover { border-color: #d4af37; color: #d4af37; background: #fff; }
    
    .material-item {
        display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e2e8f0;
        border-radius: 8px; background: #fff; margin-bottom: 8px;
    }
    .mat-icon { width: 36px; height: 36px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center; }

    /* --- NAV ITEM --- */
    .nav-item { padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s; }
    .nav-item:hover { background: #f8fafc; }
    .nav-item.active { background: #eff6ff; border-left: 3px solid #3b82f6; }
</style>
`;

export const UI_SHELL = `
    ${STYLES}
    <div class="section-header">
        <div>
            <h2>📚 İçerik Stüdyosu</h2>
            <p class="text-muted">Müfredat, ders notları ve test yönetimi.</p>
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-secondary" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
            <button class="btn btn-primary" onclick="window.Studio.open()">➕ Yeni Konu Ekle</button>
        </div>
    </div>

    <div class="card mb-4 p-3 border-0 shadow-sm">
        <div class="row g-2 align-items-center">
            <div class="col-md-5">
                <div class="input-group">
                    <span class="input-group-text bg-white border-end-0">🔍</span>
                    <input type="text" id="searchTopic" class="form-control border-start-0 ps-0" placeholder="Konu başlığı ara..." oninput="window.filterTopics()">
                </div>
            </div>
            <div class="col-md-3">
                <select id="filterCategory" class="form-select" onchange="window.filterTopics()">
                    <option value="all">Tüm Kategoriler</option>
                    <option value="ortak">Ortak Konular</option>
                    <option value="alan">Alan Konuları</option>
                </select>
            </div>
            <div class="col-md-4 text-end">
                <span class="badge bg-light text-dark border" id="topicCountBadge">Yükleniyor...</span>
            </div>
        </div>
    </div>

    <div class="card p-0 shadow-sm border-0 overflow-hidden">
        <div class="table-responsive">
            <table class="admin-table table-hover">
                <thead class="bg-light">
                    <tr>
                        <th style="width:60px" class="text-center">Sıra</th>
                        <th>Konu Başlığı</th>
                        <th>Kategori</th>
                        <th class="text-center">İçerik Sayısı</th>
                        <th>Durum</th>
                        <th style="width:120px" class="text-end">İşlem</th>
                    </tr>
                </thead>
                <tbody id="topicsTableBody"></tbody>
            </table>
        </div>
    </div>

    <div id="topicModal" class="modal-overlay" style="display:none;">
        <div class="admin-modal-content studio-modal-container">
            
            <div class="studio-header">
                <div class="d-flex align-items-center gap-3">
                    <div class="studio-title fw-bold text-primary"><span class="icon">⚡</span> Studio Pro</div>
                    <div class="vr"></div>
                    <div id="activeTopicTitleDisplay" class="text-muted fw-medium">Konu Seçilmedi</div>
                </div>
                <button class="btn btn-icon text-muted" onclick="window.Studio.close()"><span style="font-size:1.5rem">&times;</span></button>
            </div>

            <div class="studio-layout">
                
                <div class="studio-sidebar">
                    <div class="sidebar-header-modern">
                        <div class="segmented-control">
                            <button class="segment-btn active" id="tabLesson" onclick="window.Studio.switchTab('lesson')">📄 Ders Notları</button>
                            <button class="segment-btn" id="tabTest" onclick="window.Studio.switchTab('test')">📝 Testler</button>
                        </div>
                    </div>
                    <div id="contentListNav" class="nav-list-scroll"></div>
                    <div class="sidebar-footer">
                        <button class="btn btn-dark w-100 btn-sm" onclick="window.Studio.newContent()">➕ Yeni İçerik</button>
                        <button class="btn btn-light border btn-sm" onclick="window.Studio.settings()" title="Konu Ayarları">⚙️</button>
                    </div>
                </div>

                <div class="studio-editor">
                    
                    <div id="emptyState" class="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                        <div style="font-size:3rem; opacity:0.3">👈</div>
                        <h3>İçerik Seçin</h3>
                        <p>İşlem yapmak için soldan bir içerik seçin.</p>
                    </div>

                    <div id="metaEditor" class="editor-workspace align-items-center justify-content-center" style="display:none;">
                        <div class="card border-0 shadow-sm p-4" style="width:100%; max-width:500px;">
                            <h4 class="mb-4 border-bottom pb-2">Konu Ayarları</h4>
                            <form onsubmit="event.preventDefault(); window.Studio.saveMeta();">
                                <input type="hidden" id="editTopicId">
                                <div class="mb-3">
                                    <label class="form-label small text-muted fw-bold">BAŞLIK</label>
                                    <input type="text" id="inpTopicTitle" class="form-control" required>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label class="form-label small text-muted fw-bold">SIRA NO</label>
                                        <input type="number" id="inpTopicOrder" class="form-control">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small text-muted fw-bold">KATEGORİ</label>
                                        <select id="inpTopicCategory" class="form-select">
                                            <option value="ortak">Ortak Konular</option>
                                            <option value="alan">Alan Konuları</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small text-muted fw-bold">DURUM</label>
                                    <select id="inpTopicStatus" class="form-select">
                                        <option value="true">Yayında</option>
                                        <option value="false">Taslak</option>
                                    </select>
                                </div>
                                <div class="d-grid"><button class="btn btn-primary">Kaydet</button></div>
                            </form>
                        </div>
                    </div>

                    <div id="contentEditor" class="editor-workspace" style="display:none;">
                        
                        <div class="editor-toolbar">
                            <div class="d-flex align-items-center gap-2 flex-grow-1">
                                <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="Başlık giriniz...">
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <div class="input-group input-group-sm" style="width:100px;">
                                    <span class="input-group-text">Sıra</span>
                                    <input type="number" id="inpContentOrder" class="form-control">
                                </div>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                <button class="btn btn-success btn-sm px-3 fw-bold" onclick="window.Studio.saveContent()">Kaydet</button>
                            </div>
                        </div>

                        <div id="wsLessonMode" class="form-scroll-area">
                            <div class="container" style="max-width:800px;">
                                <label class="form-label fw-bold text-muted small mb-2">YENİ MATERYAL EKLE</label>
                                <div class="add-mat-grid">
                                    <div class="add-mat-btn" onclick="window.Studio.addMat('html')">📝 Metin</div>
                                    <div class="add-mat-btn" onclick="window.Studio.addMat('pdf')">📄 PDF</div>
                                    <div class="add-mat-btn" onclick="window.Studio.addMat('video')">🎥 Video</div>
                                    <div class="add-mat-btn" onclick="window.Studio.addMat('podcast')">🎙️ Podcast</div>
                                </div>
                                <div id="materialsContainer"></div>
                            </div>
                        </div>

                        <div id="wsTestMode" class="d-flex flex-column h-100" style="display:none !important;">
                            
                            <div class="test-filter-bar">
                                <div style="flex:1; min-width:150px;">
                                    <label class="small text-muted fw-bold d-block">Kanun Kodu</label>
                                    <input type="text" id="wizLegislation" class="form-control form-control-sm" placeholder="Örn: 5271">
                                </div>
                                <div style="width:140px;">
                                    <label class="small text-muted fw-bold d-block">Md. Aralığı</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" id="wizStart" class="form-control" placeholder="Baş">
                                        <input type="number" id="wizEnd" class="form-control" placeholder="Son">
                                    </div>
                                </div>
                                <div style="width:120px;">
                                    <label class="small text-muted fw-bold d-block">Zorluk</label>
                                    <select id="wizDifficulty" class="form-select form-select-sm">
                                        <option value="">Tümü</option>
                                        <option value="1">Kolay</option>
                                        <option value="3">Orta</option>
                                        <option value="5">Zor</option>
                                    </select>
                                </div>
                                <div style="flex:1.5; min-width:200px;">
                                    <label class="small text-muted fw-bold d-block">İçerik Arama</label>
                                    <div class="input-group input-group-sm">
                                        <input type="text" id="wizSearchText" class="form-control" placeholder="Kelime ara...">
                                        <button class="btn btn-dark" onclick="window.Studio.wizard.search()">🔍 Bul</button>
                                    </div>
                                </div>
                                <div style="width:160px;">
                                    <label class="small text-muted fw-bold d-block">&nbsp;</label>
                                    <button class="btn btn-warning btn-sm w-100 fw-bold shadow-sm" onclick="window.Studio.wizard.auto()">⚡ Otomatik (15)</button>
                                </div>
                            </div>

                            <div class="split-view-container">
                                <div class="split-col">
                                    <div class="split-header bg-light">
                                        <span>🔎 Soru Havuzu</span>
                                        <span id="poolCount" class="badge bg-secondary">0</span>
                                    </div>
                                    <div id="poolList" class="pool-list-area custom-scrollbar">
                                        <div class="text-center text-muted mt-5 small">Filtreleyip "Bul" butonuna basın.</div>
                                    </div>
                                </div>
                                <div class="split-col">
                                    <div class="split-header bg-warning bg-opacity-10">
                                        <span class="text-dark">📝 Test Kağıdı</span>
                                        <span id="testQuestionCount" class="badge bg-dark">0 Soru</span>
                                    </div>
                                    <div id="testQuestionsList" class="pool-list-area custom-scrollbar">
                                        <div class="text-center text-muted mt-5 small">Henüz soru eklenmedi.</div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
    
    <div id="trashModal" class="modal-overlay" style="display:none;">
        <div class="admin-modal-content" style="max-width:600px;">
            <div class="modal-header">
                <h5 class="m-0">🗑️ Çöp Kutusu</h5>
                <button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button>
            </div>
            <div class="modal-body-scroll p-0">
                <table class="admin-table">
                    <tbody id="trashTableBody"></tbody>
                </table>
            </div>
        </div>
    </div>
`;

export const renderNavItem = (l, isTestTab, activeId) => `
    <div class="nav-item ${activeId === l.id ? 'active' : ''}" onclick="window.Studio.selectContent('${l.id}')">
        <div class="d-flex justify-content-between align-items-center mb-1">
            <strong class="text-truncate" style="max-width: 160px;" title="${l.title}">${l.title}</strong>
            ${isTestTab ? `<span class="badge bg-warning text-dark" style="font-size:0.65rem">${l.qCount || 0} Soru</span>` : ''}
        </div>
        <div class="d-flex justify-content-between small text-muted">
            <span>Sıra: ${l.order}</span>
            <span>${isTestTab ? '📝 Test' : '📄 Ders'}</span>
        </div>
    </div>
`;