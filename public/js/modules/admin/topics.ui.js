/* DOSYA: public/js/modules/admin/topics.ui.js */

export const UI_SHELL = `
    <div class="section-header">
        <h2>📑 Konu Yönetimi</h2>
        <div class="d-flex gap-2">
            <button class="btn btn-light border btn-sm text-muted fw-bold" onclick="window.Studio.trash.open()" title="Çöp Kutusu">🗑️ Çöp Kutusu</button>
            <button class="btn btn-primary btn-sm" onclick="window.Studio.open()">➕ Yeni Konu</button>
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
                        <th>Üst Konu</th>
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
                <div class="studio-title-row">
                    <div class="studio-branding d-flex align-items-center gap-3">
                        <div class="fw-bold text-primary" style="font-size:1.2rem;">⚡ Studio Pro</div>
                        <div class="vr"></div>
                    </div>
                    <div id="activeTopicTitleDisplay" class="text-muted fw-medium studio-topic-title">Konu Seçilmedi</div>
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

                    <div class="editor-toolbar studio-editor-toolbar">
                        <!-- SOL: Başlık Alanı -->
                        <div class="editor-title-group studio-editor-title-group">
                             <span class="badge bg-primary px-3 py-2" id="editorBadge">DERS</span>
                             <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı Giriniz...">
                        </div>

                        <!-- SAĞ: İşlemler ve Meta -->
                        <div class="editor-actions studio-editor-actions">
                            <!-- Kayıt Durumu -->
                            <div class="save-indicator studio-save-indicator d-flex align-items-center">
                                <span id="saveIndicator" class="text-muted small fw-medium d-flex align-items-center">
                                    <i class="fas fa-check-circle me-1"></i> Kaydedildi
                                </span>
                            </div>

                            <div class="studio-editor-meta-row">
                                <div class="input-group input-group-sm shadow-sm order-input studio-order-input d-flex align-items-center" title="Sıra Numarası" style="width: auto;">
                                    <span class="input-group-text bg-white border-end-0 text-muted px-2">#</span>
                                    <input type="number" id="inpContentOrder" class="form-control border-start-0 text-center ps-0 fw-bold" style="max-width: 60px;">
                                </div>

                                <select id="inpContentScope" class="form-select form-select-sm" title="İçerik kapsamı" style="min-width: 210px;">
                                    <option value="section">📂 Not Başlığı İçeriği</option>
                                    <option value="general">🌐 Genel Konu İçeriği</option>
                                </select>

                                <small id="contentScopeHint" class="text-muted" style="max-width:320px; line-height:1.25;">
                                    Not basligi: bolum bazli icerik. Genel konu: tum konuyu kapsayan kaynak.
                                </small>
                            </div>

                            <!-- Butonlar -->
                            <div class="editor-action-buttons studio-editor-action-buttons d-flex align-items-center gap-2">
                                <button class="btn btn-outline-danger btn-sm btn-icon shadow-sm" onclick="window.Studio.deleteContent()" title="İçeriği Sil" style="width: 32px; height: 32px;">
                                    🗑️
                                </button>
                                <button class="btn btn-success btn-sm px-3 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2" onclick="window.Studio.saveContent()" style="height: 32px;">
                                    💾 <span class="d-none d-sm-inline">Kaydet</span>
                                </button>
                            </div>
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
                                        <div class="d-flex align-items-center justify-content-between mb-2">
                                            <h6 class="fw-bold text-primary m-0">Soru Havuzu</h6>
                                            <span id="topicPoolBadge" class="badge bg-light text-dark border small">Konu: —</span>
                                        </div>
                                        <div class="mb-2"><input type="text" id="wizLegislation" class="form-control form-control-sm" placeholder="Mevzuat Kodu (Opsiyonel)"></div>
                                        <div class="filter-row">
                                            <input type="number" id="wizStart" class="form-control form-control-sm" placeholder="Başlangıç Md.">
                                            <input type="number" id="wizEnd" class="form-control form-control-sm" placeholder="Bitiş Md.">
                                        </div>
                                        <div class="filter-row">
                                            <select id="wizDifficulty" class="form-select form-select-sm"><option value="">Tüm Zorluklar</option><option value="1">Kolay</option><option value="3">Orta</option><option value="5">Zor</option></select>
                                            <input type="number" id="wizTargetCount" class="form-control form-control-sm" value="15" placeholder="Adet">
                                        </div>
                                        <input type="text" id="wizSearchText" class="form-control form-control-sm mb-2" placeholder="Kelime ara...">
                                        <div class="ts-action-row">
                                            <button class="btn btn-dark btn-sm w-100" onclick="window.Studio.wizard.search()">🔍 Filtrele</button>
                                            <button class="btn btn-warning btn-sm w-100 fw-bold" onclick="window.Studio.wizard.auto()">⚡ Otomatik Test Oluştur</button>
                                        </div>
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
                        <div class="mb-3">
                            <label class="form-label fw-bold small text-muted">KONU AÇIKLAMASI</label>
                            <textarea id="inpTopicDescription" class="form-control" rows="3" placeholder="Kısa konu açıklaması girin..."></textarea>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold small text-muted">ÜST KONU (OPSİYONEL)</label>
                            <select id="inpTopicParent" class="form-select">
                                <option value="">Üst konu yok</option>
                            </select>
                        </div>
                        <div class="row mb-3">
                            <div class="col-4">
                                <label class="form-label fw-bold small text-muted">SIRA NO</label>
                                <input type="number" id="inpTopicOrder" class="form-control">
                            </div>
                            <div class="col-4">
                                <label class="form-label fw-bold small text-muted">KATEGORİ</label>
                                <select id="inpTopicCategory" class="form-select">
                                    <option value="ortak">Ortak Konular</option>
                                    <option value="alan">Alan Konuları</option>
                                </select>
                            </div>
                            <div class="col-4">
                                <label class="form-label fw-bold small text-muted">HEDEF SORU</label>
                                <input type="number" id="inpTopicTarget" class="form-control" placeholder="Örn: 5">
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold small text-muted">ANAHTAR KELİMELER</label>
                            <textarea id="inpTopicKeywords" class="form-control" rows="2" placeholder="örn: anayasa, 2709, temel haklar (virgülle ayırın)"></textarea>
                            <div class="form-text small">Otomatik eşleştirme için kullanılır.</div>
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
                <div class="drawer-footer d-flex justify-content-between align-items-center w-100">
                    <button class="btn btn-secondary btn-sm" onclick="window.Studio.settings(false)">Kapat</button>
                    <button id="btnStudioDeleteTopic" class="btn btn-outline-danger btn-sm shadow-sm" style="display:none;" onclick="window.Studio.deleteTopic(null, event)" title="Konuyu sil">🗑️ Konuyu Sil</button>
                </div>
            </aside>

            <div id="contentTrashModal" class="modal-overlay" style="display:none; z-index:100010;">
                <div class="admin-modal-content content-trash-modal" style="max-width: 800px; border-radius: 16px; overflow: hidden; box-shadow: var(--shadow-lg);">
                    
                    <!-- Yeni Header Tasarımı -->
                    <div class="modal-header content-trash-header d-flex justify-content-between align-items-center bg-surface border-bottom px-4 py-3">
                        <div class="d-flex align-items-center gap-3 content-trash-title">
                             <div class="content-trash-icon bg-light rounded-circle d-flex align-items-center justify-content-center" style="width: 40px; height: 40px; font-size: 1.25rem;">
                                🗑️
                            </div>
                            <div>
                                <h5 class="m-0 fw-bold text-main" style="font-size:1.1rem;">Silinen İçerikler</h5>
                                <div class="small text-muted" style="font-size: 0.85rem;">Geri yükleyin veya kalıcı olarak silin</div>
                            </div>
                        </div>
                        <button onclick="document.getElementById('contentTrashModal').style.display='none'" class="btn-icon content-trash-close text-muted" style="font-size: 1.25rem;">&times;</button>
                    </div>

                    <!-- Yeni Toolbar Tasarımı -->
                    <div class="modal-toolbar content-trash-toolbar p-3 bg-hover border-bottom">
                        <div class="row g-3 align-items-center">
                            <!-- Sol: Filtreler -->
                            <div class="col-12 col-md-7">
                                <div class="d-flex flex-wrap gap-2 content-trash-filters align-items-center">
                                    <div class="input-group input-group-sm content-trash-search flex-grow-1" style="min-width: 200px;">
                                        <span class="input-group-text bg-white border-end-0 text-muted"><i class="fas fa-search"></i></span>
                                        <input type="text" id="contentTrashSearch" class="form-control border-start-0 ps-0" placeholder="Başlıkta ara..." oninput="window.Studio.contentTrash.refresh()">
                                    </div>
                                    <select id="contentTrashTypeFilter" class="form-select form-select-sm content-trash-type" style="width: auto;" onchange="window.Studio.contentTrash.refresh()">
                                        <option value="active">Aktif Sekme</option>
                                        <option value="lesson">Ders</option>
                                        <option value="test">Test</option>
                                        <option value="all">Tümü</option>
                                    </select>
                                    <span class="badge bg-secondary text-white align-self-center d-none d-md-inline-block" id="contentTrashModeLabelBadge">Ders</span>
                                </div>
                            </div>

                            <!-- Sağ: İşlemler -->
                            <div class="col-12 col-md-5">
                                <div class="d-flex justify-content-md-end gap-2 content-trash-actions flex-wrap">
                                    <button class="btn btn-sm btn-success text-white fw-bold shadow-sm d-flex align-items-center gap-2" onclick="window.Studio.contentTrash.restoreSelected()" title="Seçilenleri Geri Yükle">
                                        <i class="fas fa-undo"></i> Geri Al
                                    </button>
                                    <div class="vr mx-1 opacity-25 d-none d-md-block"></div>
                                    <button class="btn btn-sm btn-outline-danger d-flex align-items-center gap-2" onclick="window.Studio.contentTrash.purgeSelected()" title="Seçilenleri Kalıcı Sil">
                                        <i class="fas fa-trash"></i> Sil
                                    </button>
                                    <button class="btn btn-sm btn-danger text-white shadow-sm d-flex align-items-center gap-2" onclick="window.Studio.contentTrash.purgeAll()" title="Tüm Çöp Kutusunu Boşalt">
                                        <i class="fas fa-bomb"></i> Tümünü Sil
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-body-scroll p-0" style="background: var(--bg-surface); min-height: 400px; max-height: 60vh;">
                        <table class="admin-table table-hover">
                            <thead>
                                <tr style="background: var(--bg-hover);">
                                    <th style="width:40px; text-align:center; vertical-align:middle;">
                                        <div class="form-check d-flex justify-content-center m-0">
                                            <input class="form-check-input" type="checkbox" id="contentTrashSelectAll" onchange="window.Studio.contentTrash.toggleAll(this.checked)">
                                        </div>
                                    </th>
                                    <th style="color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">Başlık</th>
                                    <th class="text-center" style="color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">Sıra</th>
                                    <th class="text-center" style="color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">Tür</th>
                                    <th class="text-end" style="color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">İşlem</th>
                                </tr>
                            </thead>
                            <tbody id="contentTrashTableBody"></tbody>
                        </table>
                        
                        <!-- Empty State Placeholder (JavaScript ile gösterilecek/gizlenecek) -->
                        <div id="contentTrashEmptyState" class="d-none flex-column align-items-center justify-content-center py-5 text-muted">
                            <div style="font-size: 3rem; opacity: 0.3;">🗑️</div>
                            <p class="mt-2 text-center">Çöp kutusu boş</p>
                        </div>
                    </div>

                    <div class="modal-footer p-2 text-center border-top bg-light small text-muted">
                        <i class="fas fa-info-circle me-1"></i> Silinen içerikler 30 gün sonra otomatik olarak kalıcı silinir.
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
                        <div class="p-3 border-bottom bg-white d-flex flex-wrap gap-2 align-items-center justify-content-between">
                            <input type="text" id="topicTrashSearch" class="form-control form-control-sm" placeholder="Konu başlığı ara..." oninput="window.Studio.trash.refresh()">
                            <div class="d-flex flex-wrap gap-2">
                                <button class="btn btn-outline-success btn-sm" onclick="window.Studio.trash.restoreSelected()">Seçileni Geri Al</button>
                                <button class="btn btn-danger btn-sm" onclick="window.Studio.trash.purgeSelected()">Seçileni Sil</button>
                            </div>
                        </div>
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th style="width:36px;"><input type="checkbox" id="topicTrashSelectAll" onchange="window.Studio.trash.toggleAll(this.checked)"></th>
                                    <th>Konu</th>
                                    <th class="text-end">İşlem</th>
                                </tr>
                            </thead>
                            <tbody id="trashTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    </div>
`;

// Liste Elemanı Render Fonksiyonu (Helper)
export const renderNavItem = (l, isTestTab, activeId, isSubtopic) => `
    <div class="nav-item ${activeId === l.id ? 'active' : ''}" onclick="window.Studio.selectContent('${l.id}')"
        draggable="true"
        ondragstart="window.Studio.navDnD.start('${l.id}', event)"
        ondragover="window.Studio.navDnD.over('${l.id}', event)"
        ondragleave="window.Studio.navDnD.leave(event)"
        ondrop="window.Studio.navDnD.drop('${l.id}', event)"
        ondragend="window.Studio.navDnD.end(event)">
        <div class="nav-item-row">
            <span class="nav-item-icon">${isTestTab ? '📝' : '📄'}</span>
            <div style="flex:1; overflow:hidden;">
                <div class="nav-title" title="${l.title}">${l.title}</div>
                <div class="nav-meta">
                    <span>Sıra: ${l.order}</span>
                    ${l.scope === 'general' ? '<span class="badge-mini badge-mini-general">Genel Konu</span>' : '<span class="badge-mini">Not Başlığı</span>'}
                    ${isTestTab ? `<span class="badge-mini">${l.qCount || 0} Soru</span>` : ''}
                    ${!isSubtopic ? `<button class="nav-action-btn" onclick="window.Studio.promoteToSubtopic('${l.id}', event)" title="Alt konu yap">↳</button>` : ''}
                    ${isSubtopic ? `<button class="nav-action-btn text-warning" onclick="window.Studio.demoteToLesson(null, event)" title="Ders notuna geri dönüştür">↰</button>` : ''}
                </div>
            </div>
            <span class="drag-handle" title="Sıralamak için sürükleyin">⋮⋮</span>
        </div>
    </div>
`;
