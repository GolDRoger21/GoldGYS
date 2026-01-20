/* DOSYA: public/js/modules/admin/topics.ui.js */

export const UI_SHELL = `
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

    <!-- STUDIO MODAL (FULL SCREEN) -->
    <div id="topicModal" class="modal-overlay" style="display:none;">
        <div class="admin-modal-content studio-modal-container">
            
            <!-- Header -->
            <div class="studio-header">
                <div class="d-flex align-items-center gap-3">
                    <div class="studio-title fw-bold text-primary"><span class="icon">⚡</span> Studio Pro</div>
                    <div class="vr"></div>
                    <div id="activeTopicTitleDisplay" class="text-muted fw-medium">Konu Seçilmedi</div>
                </div>
                <button class="btn btn-icon text-muted" onclick="window.Studio.close()"><span style="font-size:1.5rem">&times;</span></button>
            </div>

            <div class="studio-layout">
                
                <!-- SOL SIDEBAR (NAVIGASYON) -->
                <div class="studio-sidebar">
                    <div class="sidebar-controls">
                        <div class="d-flex gap-2 mb-3">
                            <button class="btn btn-outline-primary btn-sm flex-fill active" id="tabLesson" onclick="window.Studio.switchTab('lesson')">📄 Dersler</button>
                            <button class="btn btn-outline-warning btn-sm flex-fill" id="tabTest" onclick="window.Studio.switchTab('test')">📝 Testler</button>
                        </div>
                        <div class="d-flex gap-2">
                             <button class="btn btn-dark btn-sm flex-fill" onclick="window.Studio.newContent()">
                                ➕ Yeni İçerik
                            </button>
                            <button class="btn btn-light border btn-sm" onclick="window.Studio.settings()" title="Konu Ayarları">⚙️</button>
                        </div>
                    </div>
                    <div id="contentListNav" class="nav-list-scroll">
                        <!-- Liste Elemanları Buraya -->
                    </div>
                </div>

                <!-- SAĞ EDİTÖR ALANI -->
                <div class="studio-editor">
                    
                    <!-- 1. BOŞ DURUM (Initial State) -->
                    <div id="emptyState" class="empty-selection">
                        <div class="empty-icon">👈</div>
                        <h3>İçerik Seçin veya Oluşturun</h3>
                        <p>Düzenlemek için soldaki listeden bir öğe seçin.</p>
                    </div>

                    <!-- 2. KONU METADATA EDİTÖRÜ -->
                    <div id="metaEditor" class="editor-workspace" style="display:none; align-items:center; justify-content:center;">
                        <div class="card border-0 shadow-sm p-4" style="width:100%; max-width:500px;">
                            <h4 class="mb-4 border-bottom pb-2">Konu Ayarları</h4>
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
                                <div class="d-grid">
                                    <button class="btn btn-primary">Değişiklikleri Kaydet</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- 3. İÇERİK EDİTÖRÜ (DÜZELTİLEN KISIM) -->
                    <!-- DİKKAT: Burada .content-editor-layout sınıfını kullanıyoruz -->
                    <div id="contentEditor" class="content-editor-layout" style="display:none;">
                        
                        <!-- Toolbar (Üstte Sabit) -->
                        <div class="editor-toolbar">
                            <!-- Sol: Başlık Alanı -->
                            <div class="editor-title-group">
                                <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı Giriniz...">
                            </div>
                            
                            <!-- Sağ: Butonlar (editor-actions sınıfı ile) -->
                            <div class="editor-actions">
                                <div class="input-group input-group-sm" style="width: 100px;">
                                    <span class="input-group-text">Sıra</span>
                                    <input type="number" id="inpContentOrder" class="form-control">
                                </div>
                                <div class="vr mx-2"></div>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.Studio.deleteContent()">Sil</button>
                                <button class="btn btn-success btn-sm px-3 fw-bold" onclick="window.Studio.saveContent()">Kaydet</button>
                            </div>
                        </div>

                        <!-- Workspace (Altta, Kaydırılabilir) -->
                        <div class="editor-workspace">
                            
                            <!-- A) DERS MODU -->
                            <div id="wsLessonMode" class="form-container">
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
                                <div id="materialsContainer" class="material-list">
                                    <!-- Materyaller JS ile buraya -->
                                </div>
                            </div>

                            <!-- B) TEST MODU (SPLIT VIEW) -->
                            <div id="wsTestMode" class="test-studio-layout" style="display:none;">
                                
                                <!-- SOL: HAVUZ & FİLTRE -->
                                <div class="ts-sidebar">
                                    <div class="ts-filter-header">
                                        <h6 class="fw-bold mb-3">Soru Havuzu</h6>
                                        <div class="d-flex flex-column gap-2">
                                            <input type="text" id="wizLegislation" class="form-control form-control-sm" placeholder="Mevzuat Kodu (Örn: 5271)">
                                            <div class="input-group input-group-sm">
                                                <input type="text" id="wizSearchText" class="form-control" placeholder="Metin Ara...">
                                                <button class="btn btn-primary" onclick="window.Studio.wizard.search()">🔍</button>
                                            </div>
                                            <div class="d-flex justify-content-between align-items-center mt-1">
                                                <small class="text-muted"><span id="poolCount">0</span> soru bulundu</small>
                                                <button class="btn btn-link btn-sm p-0 text-decoration-none" onclick="window.Studio.wizard.auto()">⚡ Rastgele 10 Ekle</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div id="poolList" class="ts-list-body bg-light">
                                        <div class="text-center text-muted mt-5 small">
                                            Mevzuat kodu girip<br>aramaya başlayın.
                                        </div>
                                    </div>
                                </div>

                                <!-- SAĞ: SEÇİLENLER -->
                                <div class="ts-main">
                                    <div class="ts-filter-header d-flex justify-content-between align-items-center bg-white">
                                        <h6 class="fw-bold m-0 text-primary">Test Kağıdı</h6>
                                        <span class="badge bg-primary rounded-pill" id="paperCount">0 Soru</span>
                                    </div>
                                    <div id="paperList" class="ts-list-body">
                                        <!-- Seçilenler Buraya -->
                                    </div>
                                </div>

                            </div>

                        </div>
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

// Liste Öğesi HTML Oluşturucu (Aynı Kalabilir)
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
