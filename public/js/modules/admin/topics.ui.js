export const UI_SHELL = `
    <div class="section-header">
        <div>
            <h2>📚 İçerik Stüdyosu</h2>
            <p class="text-muted">Müfredat, ders notları ve test yönetimi.</p>
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-secondary" onclick="window.Studio.trash.open()">🗑️ Çöp Kutusu</button>
            <button class="btn btn-primary" onclick="window.Studio.open()">➕ Yeni Konu Ekle</button>
        </div>
    </div>

    <!-- Konu Listesi / Arama -->
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

    <!-- Tablo -->
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

    <!-- STUDIO MODAL -->
    <div id="topicModal" class="modal-overlay" style="display:none;">
        <div class="studio-modal-container">

            <!-- Header -->
            <div class="studio-header">
                <div class="d-flex align-items-center gap-3">
                    <div class="fw-bold text-primary" style="font-size:1.2rem;">⚡ Studio Pro</div>
                    <div class="vr"></div>
                    <div id="activeTopicTitleDisplay" class="text-muted fw-medium">Konu Seçilmedi</div>
                </div>
                <button class="btn btn-icon text-muted" onclick="window.Studio.close()" style="font-size:1.5rem;">&times;</button>
            </div>

            <div class="studio-layout">

                <!-- SOL SIDEBAR -->
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

                <!-- SAĞ EDİTÖR -->
                <div class="studio-editor">

                    <!-- BOŞ DURUM -->
                    <div id="emptyState" class="empty-selection">
                        <div class="empty-icon">👈</div>
                        <h3>İçerik Seçin veya Oluşturun</h3>
                        <p class="text-muted">Soldaki menüden ders/test seçin veya yeni içerik oluşturun.</p>
                        <div class="empty-actions">
                            <button class="btn btn-secondary btn-sm" onclick="window.Studio.newContent()">➕ Yeni İçerik</button>
                            <button class="btn btn-primary btn-sm" onclick="window.Studio.settings(true)">⚙️ Konu Ayarları</button>
                        </div>
                    </div>

                    <!-- İÇERİK EDİTÖRÜ -->
                    <div id="contentEditor" class="content-editor-layout" style="display:none;">

                        <!-- Toolbar -->
                        <div class="editor-toolbar">
                            <div class="editor-title-group">
                                <span class="badge bg-secondary me-2" id="editorBadge">DERS</span>
                                <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı Giriniz...">
                            </div>
                            <div class="editor-actions">
                                <div class="input-group input-group-sm me-2" style="width: 100px;">
                                    <span class="input-group-text">Sıra</span>
                                    <input type="number" id="inpContentOrder" class="form-control">
                                </div>
                                <button class="btn btn-outline-danger btn-sm me-2" onclick="window.Studio.deleteContent()">Sil</button>
                                <button class="btn btn-success btn-sm px-3 fw-bold" onclick="window.Studio.saveContent()">Kaydet</button>
                            </div>
                        </div>

                        <!-- Workspace -->
                        <div class="editor-workspace" style="padding:0;">

                            <!-- DERS MODU -->
                            <div id="wsLessonMode" class="form-container" style="padding:30px;">
                                <div class="mb-4">
                                    <label class="form-label fw-bold text-muted small mb-3">YENİ MATERYAL EKLE</label>
                                    <div class="add-mat-grid">
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('html')"><i>📝</i> Metin</div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('pdf')"><i>📄</i> PDF</div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('video')"><i>🎥</i> Video</div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('podcast')"><i>🎙️</i> Podcast</div>
                                    </div>
                                </div>
                                <label class="form-label fw-bold text-muted small mb-2">EKLENEN MATERYALLER</label>
                                <div id="materialsContainer" class="material-list"></div>
                            </div>

                            <!-- TEST MODU (SPLIT VIEW) -->
                            <div id="wsTestMode" class="test-studio-layout" style="display:none;">

                                <!-- SOL: FİLTRE PANELİ -->
                                <div class="ts-sidebar">
                                    <div class="ts-filter-header">
                                        <h6 class="fw-bold mb-2 text-primary">Soru Havuzu</h6>

                                        <div class="ts-stats">
                                            <span class="filter-label m-0" style="text-transform:none; letter-spacing:0;">Sonuç</span>
                                            <span id="poolCount" class="badge-mini">0</span>
                                        </div>

                                        <div class="mb-2">
                                            <span class="filter-label">Mevzuat Kodu</span>
                                            <input type="text" id="wizLegislation" class="form-control form-control-sm fw-bold" placeholder="Örn: 5271">
                                        </div>

                                        <div class="filter-row">
                                            <div class="flex-fill">
                                                <span class="filter-label">Başlangıç</span>
                                                <input type="number" id="wizStart" class="form-control form-control-sm" placeholder="1">
                                            </div>
                                            <div class="flex-fill">
                                                <span class="filter-label">Bitiş</span>
                                                <input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Max">
                                            </div>
                                        </div>

                                        <div class="filter-row">
                                            <div class="flex-fill">
                                                <span class="filter-label">Zorluk</span>
                                                <select id="wizDifficulty" class="form-select form-select-sm">
                                                    <option value="">Dengeli (Önerilen)</option>
                                                    <option value="1">Kolay</option>
                                                    <option value="3">Orta</option>
                                                    <option value="5">Zor</option>
                                                </select>
                                            </div>
                                            <div style="width:120px;">
                                                <span class="filter-label">Sayı</span>
                                                <input type="number" id="wizTargetCount" class="form-control form-control-sm fw-bold" value="15" min="1" max="100">
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <div class="input-group input-group-sm">
                                                <input type="text" id="wizSearchText" class="form-control" placeholder="Metin ara...">
                                                <button class="btn btn-dark" onclick="window.Studio.wizard.search()">🔍</button>
                                            </div>
                                        </div>

                                        <div class="d-grid gap-2">
                                            <button class="btn btn-warning btn-sm fw-bold" onclick="window.Studio.wizard.auto()">
                                                ⚡ Otomatik Test
                                            </button>
                                        </div>
                                    </div>

                                    <div id="poolList" class="ts-list-body bg-light">
                                        <div class="text-center text-muted mt-5 small">
                                            Filtreleri doldurup<br>aramaya başlayın.
                                        </div>
                                    </div>
                                </div>

                                <!-- SAĞ: TEST KAĞIDI -->
                                <div class="ts-main">
                                    <div class="ts-filter-header d-flex justify-content-between align-items-center bg-white" style="height:60px; padding:0 20px;">
                                        <h6 class="fw-bold m-0 text-primary">Test Kağıdı</h6>
                                        <span class="badge bg-primary rounded-pill" id="paperCount">0 Soru</span>
                                    </div>
                                    <div id="paperList" class="ts-list-body"></div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- META DRAWER (Konu Ayarları) -->
            <div id="metaDrawerBackdrop" class="drawer-backdrop" onclick="window.Studio.settings(false)"></div>
            <aside id="metaDrawer" class="drawer" aria-hidden="true">
                <div class="drawer-header">
                    <div class="drawer-title">⚙️ Konu Ayarları</div>
                    <button class="btn btn-icon" onclick="window.Studio.settings(false)" title="Kapat">&times;</button>
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


<!-- CONTENT TRASH MODAL (LESSON/TEST) -->
<div id="contentTrashModal" class="modal-overlay" style="display:none;">
    <div class="admin-modal-content" style="max-width:720px;">
        <div class="modal-header">
            <h5 class="m-0">🗑️ Silinen İçerikler</h5>
            <button onclick="document.getElementById('contentTrashModal').style.display='none'" class="close-btn">&times;</button>
        </div>
        <div class="modal-body-scroll p-0">
            <div class="p-3 border-bottom bg-white d-flex align-items-center justify-content-between">
                <div class="small text-muted">
                    Aktif sekmeye göre listelenir: <strong id="contentTrashModeLabel">Ders</strong>
                </div>
                <button class="btn btn-danger btn-sm" onclick="window.Studio.contentTrash.purgeAll()" title="Silinenleri kalıcı sil">
                    Kalıcı Sil (Hepsi)
                </button>
            </div>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Başlık</th>
                        <th style="width:90px" class="text-center">Sıra</th>
                        <th style="width:120px" class="text-center">Tür</th>
                        <th style="width:200px" class="text-end">İşlem</th>
                    </tr>
                </thead>
                <tbody id="contentTrashTableBody"></tbody>
            </table>
        </div>
    </div>
</div>
        </div>
    </div>

    <!-- TRASH MODAL -->
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
        <div class="nav-item-row">
            <span style="font-size:1.1rem;">${isTestTab ? '📝' : '📄'}</span>
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
