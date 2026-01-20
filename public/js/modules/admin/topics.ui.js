/* DOSYA: public/js/modules/admin/topics.ui.js */

export const UI_SHELL = `
    <div class="section-header">
        <h2>📑 Konu Yönetimi</h2>
        <div class="d-flex gap-2">
            <button class="btn btn-primary btn-sm" onclick="window.Studio.open()">➕ Yeni Konu</button>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.Studio.trash.open()">🗑️ Çöp Kutusu</button>
        </div>
    </div>

    <div class="card p-0">
        <div class="p-3 border-bottom d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <div class="d-flex flex-wrap gap-2 align-items-center">
                <input type="text" id="searchTopic" class="form-control form-control-sm" placeholder="Konu ara..." oninput="window.filterTopics()">
                <select id="filterCategory" class="form-select form-select-sm" onchange="window.filterTopics()">
                    <option value="all">Tüm Kategoriler</option>
                    <option value="ortak">Ortak Konular</option>
                    <option value="alan">Alan Konuları</option>
                </select>
            </div>
            <span id="topicCountBadge" class="badge bg-light text-dark border">0 Kayıt</span>
        </div>
        <div class="table-responsive">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Sıra</th>
                        <th>Konu</th>
                        <th>Kategori</th>
                        <th>İçerik</th>
                        <th>Durum</th>
                        <th class="text-end">İşlem</th>
                    </tr>
                </thead>
                <tbody id="topicsTableBody"></tbody>
            </table>
        </div>
    </div>

    <div id="topicModal" class="modal-overlay" style="display:none;">
        <div class="studio-modal-container">

            <div class="studio-header">
                <div class="d-flex align-items-center gap-3">
                    <div class="fw-bold text-primary" style="font-size:1.2rem;">⚡ Studio Pro</div>
                    <div class="vr"></div>
                    <div id="activeTopicTitleDisplay" class="text-muted fw-medium">Konu Seçilmedi</div>
                </div>
                <button class="btn btn-icon text-muted" onclick="window.Studio.close()" style="font-size:1.5rem;">&times;</button>
            </div>

            <div class="studio-layout">

                <div class="studio-sidebar">
                    <div class="sidebar-header-modern">
                        <div class="studio-tabs">
                            <div class="tab-item active" id="tabLesson" onclick="window.Studio.switchTab('lesson')">
                                📄 Ders Notları
                            </div>
                            <div class="tab-item" id="tabTest" onclick="window.Studio.switchTab('test')">
                                📝 Testler
                            </div>
                        </div>
                    </div>

                    <div id="contentListNav" class="nav-list-scroll"></div>

                    <div class="sidebar-footer">
                        <button id="sidebarNewContentBtn" class="btn btn-dark w-100 btn-sm" onclick="window.Studio.newContent()">
                            ➕ Yeni Ders
                        </button>
                        <button class="btn btn-light border btn-sm px-3" onclick="window.Studio.settings(true)" title="Konu Ayarları">⚙️</button>
                        <button class="btn btn-light border btn-sm px-3" onclick="window.Studio.contentTrash.open()" title="Silinen İçerikler">🗑️</button>
                    </div>
                </div>

                <div class="studio-editor">

                    <div id="emptyState" class="empty-selection">
                        <div class="empty-icon">👈</div>
                        <h3>İçerik Seçin veya Oluşturun</h3>
                        <p class="text-muted">Soldaki menüden ders/test seçin veya yeni içerik oluşturun.</p>
                        <div class="empty-actions">
                            <button class="btn btn-secondary btn-sm" onclick="window.Studio.newContent()">➕ Yeni İçerik</button>
                            <button class="btn btn-primary btn-sm" onclick="window.Studio.settings(true)">⚙️ Konu Ayarları</button>
                        </div>
                    </div>

                    <div id="contentEditor" style="display:none; flex-direction:column; height:100%; width:100%;">

                        <div class="editor-toolbar">
                            <div class="editor-title-group">
                                <span class="badge bg-primary me-2" id="editorBadge">DERS</span>
                                <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı Giriniz...">
                            </div>
                            <div class="editor-actions">
                                <span id="saveIndicator" class="save-indicator">—</span>
                                <div class="input-group input-group-sm" style="width: 100px;">
                                    <span class="input-group-text">Sıra</span>
                                    <input type="number" id="inpContentOrder" class="form-control text-center">
                                </div>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                <button class="btn btn-success btn-sm px-4 fw-bold" onclick="window.Studio.saveContent()">Kaydet</button>
                            </div>
                        </div>

                        <div class="editor-workspace">

                            <div id="wsLessonMode" class="form-container">
                                <div class="mb-5">
                                    <label class="form-label fw-bold text-muted small mb-3 d-block text-center">YENİ MATERYAL EKLE</label>
                                    <div class="add-mat-grid">
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('html')">
                                            <i>📝</i> 
                                            <span>Zengin Metin</span>
                                        </div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('pdf')">
                                            <i>📄</i> 
                                            <span>PDF Dosyası</span>
                                        </div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('video')">
                                            <i>🎥</i> 
                                            <span>Video Bağlantısı</span>
                                        </div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('podcast')">
                                            <i>🎙️</i> 
                                            <span>Ses / Podcast</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                                    <label class="form-label fw-bold text-dark m-0">EKLENEN İÇERİKLER</label>
                                    <small class="text-muted">Sıralamak için sürükleyip bırakın</small>
                                </div>
                                <div id="materialsContainer" class="material-list"></div>
                            </div>

                            <div id="wsTestMode" class="test-studio-layout" style="display:none;">
                                <div class="ts-sidebar">
                                     <div class="ts-filter-header">
                                        <h6 class="fw-bold mb-3 text-primary">Soru Havuzu</h6>
                                        <div class="mb-2"><input type="text" id="wizLegislation" class="form-control form-control-sm" placeholder="Mevzuat Kodu (Örn: 5271)"></div>
                                        <div class="filter-row">
                                            <input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Başlangıç Md.">
                                            <input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Bitiş Md.">
                                        </div>
                                        <div class="filter-row">
                                            <select id="wizDifficulty" class="form-select form-select-sm"><option value="">Tüm Zorluklar</option><option value="1">Kolay</option><option value="3">Orta</option><option value="5">Zor</option></select>
                                            <input type="number" id="wizTargetCount" class="form-control form-control-sm" value="15" placeholder="Adet">
                                        </div>
                                        <div class="input-group input-group-sm mb-2">
                                            <input type="text" id="wizSearchText" class="form-control" placeholder="Kelime ara...">
                                            <button class="btn btn-dark" onclick="window.Studio.wizard.search()">🔍</button>
                                        </div>
                                        <button class="btn btn-warning btn-sm w-100 fw-bold" onclick="window.Studio.wizard.auto()">⚡ Otomatik Test Oluştur</button>
                                     </div>
                                     <div id="poolList" class="ts-list-body bg-light"></div>
                                </div>
                                
                                <div class="ts-main">
                                    <div class="ts-filter-header d-flex justify-content-between align-items-center" style="height:60px;">
                                        <h6 class="fw-bold m-0">Test Kağıdı</h6>
                                        <span class="badge bg-primary rounded-pill" id="paperCount">0 Soru</span>
                                    </div>
                                    <div id="paperList" class="ts-list-body"></div>
                                </div>
                            </div>
                            </div>
                    </div>
                </div>
            </div>

            <div id="metaDrawerBackdrop" class="drawer-backdrop" onclick="window.Studio.settings(false)"></div>
            <aside id="metaDrawer" class="drawer" aria-hidden="true">
                <div class="drawer-header">
                    <div class="drawer-title">⚙️ Konu Ayarları</div>
                    <button class="btn btn-icon" onclick="window.Studio.settings(false)">&times;</button>
                </div>
                <div class="drawer-body">
                    <form onsubmit="event.preventDefault(); window.Studio.saveMeta();">
                        <input type="hidden" id="editTopicId">
                        <div class="mb-3">
                            <label class="form-label fw-bold small text-muted">KONU BAŞLIĞI</label>
                            <input type="text" id="inpTopicTitle" class="form-control form-control-lg" required>
                        </div>
                        <div class="row mb-3">
                            <div class="col-6">
                                <label class="form-label fw-bold small text-muted">SIRA NO</label>
                                <input type="number" id="inpTopicOrder" class="form-control">
                            </div>
                            <div class="col-6">
                                <label class="form-label fw-bold small text-muted">KATEGORİ</label>
                                <select id="inpTopicCategory" class="form-select">
                                    <option value="ortak">Ortak Konular</option>
                                    <option value="alan">Alan Konuları</option>
                                </select>
                            </div>
                        </div>
                        <div class="mb-4">
                            <label class="form-label fw-bold small text-muted">YAYIN DURUMU</label>
                            <select id="inpTopicStatus" class="form-select">
                                <option value="true">🟢 Yayında (Aktif)</option>
                                <option value="false">⚪ Taslak (Pasif)</option>
                            </select>
                        </div>
                        <button class="btn btn-primary w-100">Değişiklikleri Kaydet</button>
                    </form>
                </div>
                <div class="drawer-footer">
                    <button class="btn btn-secondary btn-sm" onclick="window.Studio.settings(false)">Kapat</button>
                </div>
            </aside>

            <div id="contentTrashModal" class="modal-overlay" style="display:none; z-index:100010;">
                <div class="admin-modal-content">
                    <div class="modal-header">
                        <h5 class="m-0">🗑️ Silinen İçerikler</h5>
                        <button onclick="document.getElementById('contentTrashModal').style.display='none'" class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body-scroll p-0">
                         <div class="p-3 border-bottom bg-white d-flex align-items-center justify-content-between">
                            <div class="small text-muted">
                                Aktif sekmeye göre listelenir: <strong id="contentTrashModeLabel">Ders</strong>
                            </div>
                            <button class="btn btn-danger btn-sm" onclick="window.Studio.contentTrash.purgeAll()">Tümünü Sil</button>
                        </div>
                        <table class="admin-table"><tbody id="contentTrashTableBody"></tbody></table>
                    </div>
                </div>
            </div>

            <div id="trashModal" class="modal-overlay" style="display:none;">
                <div class="admin-modal-content" style="max-width:600px;">
                    <div class="modal-header">
                        <h5 class="m-0">🗑️ Konu Çöp Kutusu</h5>
                        <button onclick="document.getElementById('trashModal').style.display='none'" class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body-scroll p-0">
                        <table class="admin-table">
                            <tbody id="trashTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    </div>
`;

// Liste Elemanı Render Fonksiyonu (Helper)
export const renderNavItem = (l, isTestTab, activeId) => `
    <div class="nav-item ${activeId === l.id ? 'active' : ''}" onclick="window.Studio.selectContent('${l.id}')">
        <div class="nav-item-row">
            <span style="font-size:1.2rem;">${isTestTab ? '📝' : '📄'}</span>
            <div style="flex:1; overflow:hidden;">
                <div class="nav-title" title="${l.title}">${l.title}</div>
                <div class="nav-meta">
                    <span>Sıra: ${l.order}</span>
                    ${isTestTab ? `<span class="badge-mini">${l.qCount || 0} Soru</span>` : ''}
                </div>
            </div>
        </div>
    </div>
`;
