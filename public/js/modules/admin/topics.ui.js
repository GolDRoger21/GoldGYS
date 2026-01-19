/* DOSYA: public/js/modules/admin/topics.ui.js
   AÇIKLAMA: İçerik Stüdyosu modülünün HTML şablonlarını ve UI yardımcılarını içerir.
*/

// Ana İskelet (Main Shell)
export const UI_SHELL = `
    <div class="section-header">
        <div>
            <h2>📚 İçerik Stüdyosu</h2>
            <p class="text-muted">Müfredat, ders notları ve test yönetimi.</p>
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-secondary" onclick="window.openTrashModal()">🗑️ Çöp Kutusu</button>
            <button class="btn btn-primary" onclick="window.Studio.open()">➕ Yeni Konu</button>
        </div>
    </div>

    <div class="card mb-4 p-3 border-0 shadow-sm">
        <div class="row g-2 align-items-center">
            <div class="col-md-5">
                <input type="text" id="searchTopic" class="form-control" placeholder="Konu ara..." oninput="window.filterTopics()">
            </div>
            <div class="col-md-3">
                <select id="filterCategory" class="form-select" onchange="window.filterTopics()">
                    <option value="all">Tüm Kategoriler</option>
                    <option value="ortak">Ortak Konular</option>
                    <option value="alan">Alan Konuları</option>
                </select>
            </div>
            <div class="col-md-4 text-end">
                <span class="badge bg-secondary" id="topicCountBadge">...</span>
            </div>
        </div>
    </div>

    <div class="card p-0">
        <div class="table-responsive">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th style="width:50px">Sıra</th>
                        <th>Konu Başlığı</th>
                        <th>Kategori</th>
                        <th>İçerik</th>
                        <th>Durum</th>
                        <th style="width:100px">İşlem</th>
                    </tr>
                </thead>
                <tbody id="topicsTableBody"></tbody>
            </table>
        </div>
    </div>

    <div id="topicModal" class="modal-overlay" style="display:none;">
        <div class="admin-modal-content studio-modal-container">
            
            <div class="studio-header">
                <div class="studio-title"><span class="icon">⚡</span> İçerik Yöneticisi</div>
                <button class="close-btn" onclick="window.Studio.close()">&times;</button>
            </div>

            <div class="studio-layout">
                
                <div class="studio-sidebar">
                    <div class="sidebar-controls">
                        <div class="studio-tabs">
                            <div class="tab-item active" onclick="window.Studio.switchTab('lesson')">📄 Dersler</div>
                            <div class="tab-item" onclick="window.Studio.switchTab('test')">📝 Testler</div>
                        </div>
                        <div class="sidebar-actions">
                            <button class="btn btn-primary btn-sm w-100" onclick="window.Studio.newContent()">
                                ➕ Yeni Ekle
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="window.Studio.settings()" title="Ayarlar">⚙️</button>
                        </div>
                    </div>
                    <div id="contentListNav" class="nav-list-scroll"></div>
                </div>

                <div class="studio-editor">
                    
                    <div id="metaEditor" class="editor-workspace centered-form" style="display:none;">
                        <div class="studio-card">
                            <h3 class="mb-4 text-center">Konu Ayarları</h3>
                            <form onsubmit="event.preventDefault(); window.Studio.saveMeta();">
                                <input type="hidden" id="editTopicId">
                                <div class="mb-3">
                                    <label class="form-label">Başlık</label>
                                    <input type="text" id="inpTopicTitle" class="form-control" required>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label class="form-label">Sıra</label>
                                        <input type="number" id="inpTopicOrder" class="form-control">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label">Kategori</label>
                                        <select id="inpTopicCategory" class="form-control">
                                            <option value="ortak">Ortak Konular</option>
                                            <option value="alan">Alan Konuları</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Durum</label>
                                    <select id="inpTopicStatus" class="form-control">
                                        <option value="true">Yayında</option>
                                        <option value="false">Taslak</option>
                                    </select>
                                </div>
                                <button class="btn btn-success w-100">Kaydet</button>
                            </form>
                        </div>
                    </div>

                    <div id="contentEditor" class="content-editor-layout" style="display:none;">
                        
                        <div class="editor-toolbar">
                            <div class="editor-title-group">
                                <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı...">
                            </div>
                            <div class="editor-actions">
                                <input type="number" id="inpContentOrder" placeholder="Sıra" style="width:60px;">
                                <div class="vr-separator"></div>
                                <button class="btn btn-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                <button class="btn btn-success btn-sm" onclick="window.Studio.saveContent()">Kaydet</button>
                            </div>
                        </div>

                        <div class="editor-workspace p-0">
                            
                            <div id="wsLessonMode" class="workspace-scroll p-4">
                                <div class="material-buttons-grid">
                                    <div class="btn-mat" onclick="window.Studio.addMat('html')"><i>📝</i> Metin</div>
                                    <div class="btn-mat" onclick="window.Studio.addMat('pdf')"><i>📄</i> PDF</div>
                                    <div class="btn-mat" onclick="window.Studio.addMat('video')"><i>🎥</i> Video</div>
                                    <div class="btn-mat" onclick="window.Studio.addMat('podcast')"><i>🎙️</i> Podcast</div>
                                </div>
                                <div id="materialsContainer"></div>
                            </div>

                            <div id="wsTestMode" class="wizard-container" style="display:none;">
                                
                                <div class="wizard-filter-bar">
                                    <div class="filter-group fg-grow">
                                        <label>Mevzuat / Kaynak</label>
                                        <input type="text" id="wizLegislation" class="form-control form-control-sm font-weight-bold">
                                    </div>
                                    <div class="filter-group">
                                        <label>Aralık</label>
                                        <div class="d-flex gap-2">
                                            <input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Baş">
                                            <input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Son">
                                        </div>
                                    </div>
                                    <div class="filter-group">
                                        <label>Zorluk</label>
                                        <select id="wizDifficulty" class="form-control form-control-sm">
                                            <option value="">Tümü</option>
                                            <option value="1">Kolay</option>
                                            <option value="3">Orta</option>
                                            <option value="5">Zor</option>
                                        </select>
                                    </div>
                                    <div class="filter-group fg-grow">
                                        <label>Ara</label>
                                        <input type="text" id="wizSearchText" class="form-control form-control-sm">
                                    </div>
                                    <button class="btn btn-primary btn-sm" style="height:34px;" onclick="window.Studio.wizard.search()">🔍 Getir</button>
                                    <button class="btn btn-warning btn-sm" style="height:34px;" onclick="window.Studio.wizard.auto()">⚡ Rastgele</button>
                                </div>

                                <div class="wizard-split-view">
                                    <div class="wizard-col">
                                        <div class="panel-header"><span>SORU HAVUZU</span><span class="badge bg-secondary" id="poolCount">0</span></div>
                                        <div id="poolList" class="panel-body"><div class="empty-state-box">Filtreleyin...</div></div>
                                    </div>
                                    <div class="wizard-col">
                                        <div class="panel-header"><span>TEST KAĞIDI</span><span class="badge bg-primary" id="paperCount">0</span></div>
                                        <div id="paperList" class="panel-body bg-light"></div>
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
        <div class="admin-modal-content" style="max-width:600px; height:auto;">
            <div class="modal-header"><h3>🗑️ Çöp Kutusu</h3><button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button></div>
            <div class="modal-body-scroll"><table class="admin-table"><tbody id="trashTableBody"></tbody></table></div>
        </div>
    </div>
`;

// Liste Öğesi HTML Oluşturucu (JS içinde döngüyle kullanılıyor)
export const renderNavItem = (l, isTestTab, activeId) => `
    <div class="nav-item ${activeId === l.id ? 'active' : ''}" onclick="window.Studio.selectContent('${l.id}')">
        <div class="nav-item-row">
            <span class="nav-icon">${isTestTab ? '📝' : '📄'}</span>
            <span class="nav-title" title="${l.title}">${l.title}</span>
        </div>
        <div class="nav-meta">
            <span>Sıra: ${l.order}</span>
            ${isTestTab ? `<span class="badge-mini">${l.qCount || 0} Soru</span>` : ''}
        </div>
    </div>
`;
