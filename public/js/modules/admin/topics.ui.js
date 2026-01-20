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
                            <button class="segment-btn active" id="tabLesson" onclick="window.Studio.switchTab('lesson')">
                                📄 Ders Notları
                            </button>
                            <button class="segment-btn" id="tabTest" onclick="window.Studio.switchTab('test')">
                                📝 Testler
                            </button>
                        </div>
                    </div>

                    <div id="contentListNav" class="nav-list-scroll">
                        </div>

                    <div class="sidebar-footer">
                        <button class="btn btn-dark w-100 btn-sm" onclick="window.Studio.newContent()">
                            ➕ Yeni İçerik
                        </button>
                        <button class="btn btn-light border btn-sm" onclick="window.Studio.settings()" title="Konu Ayarları">
                            ⚙️
                        </button>
                    </div>
                </div>

                <div class="studio-editor">
                    
                    <div id="emptyState" class="empty-selection">
                        <div class="empty-icon">👈</div>
                        <h3>İçerik Seçin veya Oluşturun</h3>
                        <p>Soldaki menüden işlem yapmak istediğiniz içeriği seçin.</p>
                    </div>

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

                    <div id="contentEditor" class="content-editor-layout" style="display:none;">
                        
                        <div class="editor-toolbar">
                            <div class="editor-title-group">
                                <span class="badge bg-secondary" id="editorBadge">DERS</span>
                                <input type="text" id="inpContentTitle" class="editor-title-input" placeholder="İçerik Başlığı Giriniz...">
                            </div>
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

                        <div class="editor-workspace p-0" style="overflow:hidden;">
                            
                            <div id="wsLessonMode" class="form-container h-100 overflow-auto p-4">
                                <div>
                                    <label class="form-label fw-bold text-muted small mb-3">YENİ MATERYAL EKLE</label>
                                    <div class="add-mat-grid">
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('html')"><i>📝</i> Metin</div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('pdf')"><i>📄</i> PDF</div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('video')"><i>🎥</i> Video</div>
                                        <div class="add-mat-btn" onclick="window.Studio.addMat('podcast')"><i>🎙️</i> Podcast</div>
                                    </div>
                                </div>
                                <label class="form-label fw-bold text-muted small mb-2 mt-4">EKLENEN MATERYALLER</label>
                                <div id="materialsContainer" class="material-list"></div>
                            </div>

                            <div id="wsTestMode" class="d-flex flex-column h-100" style="display:none !important;">
                                
                                <div class="bg-light border-bottom p-3">
                                    <div class="row g-2 align-items-end">
                                        <div class="col-md-2">
                                            <label class="form-label small fw-bold text-muted mb-1">Mevzuat Kodu</label>
                                            <input type="text" id="wizLegislation" class="form-control form-control-sm border-primary" placeholder="Örn: 5271">
                                        </div>

                                        <div class="col-md-2">
                                            <label class="form-label small fw-bold text-muted mb-1">Md. Aralığı</label>
                                            <div class="input-group input-group-sm">
                                                <input type="number" id="wizStart" class="form-control" placeholder="Baş">
                                                <input type="number" id="wizEnd" class="form-control" placeholder="Son">
                                            </div>
                                        </div>

                                        <div class="col-md-2">
                                            <label class="form-label small fw-bold text-muted mb-1">Zorluk</label>
                                            <select id="wizDifficulty" class="form-select form-select-sm">
                                                <option value="">Tümü</option>
                                                <option value="1">Kolay</option>
                                                <option value="3">Orta</option>
                                                <option value="5">Zor</option>
                                            </select>
                                        </div>

                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold text-muted mb-1">Soru İçeriği</label>
                                            <div class="input-group input-group-sm">
                                                <input type="text" id="wizSearchText" class="form-control" placeholder="Kelime ara...">
                                                <button class="btn btn-dark" onclick="window.Studio.wizard.search()">🔍 Bul</button>
                                            </div>
                                        </div>

                                        <div class="col-md-3 text-end">
                                            <button class="btn btn-warning btn-sm fw-bold shadow-sm w-100" onclick="window.Studio.wizard.auto()">
                                                ⚡ Otomatik Seç (15)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div class="row g-0 flex-fill overflow-hidden">
                                    
                                    <div class="col-md-6 h-100 border-end d-flex flex-column bg-white">
                                        <div class="p-2 bg-secondary bg-opacity-10 text-center fw-bold small text-secondary border-bottom">
                                            🔎 SORU HAVUZU
                                        </div>
                                        <div id="poolList" class="overflow-auto p-2 flex-fill custom-scrollbar">
                                            <div class="text-center text-muted mt-5 small">
                                                <div style="font-size:2rem; margin-bottom:10px;">👇</div>
                                                Yukarıdaki filtreleri kullanıp<br><strong>"Bul"</strong> butonuna basın.
                                            </div>
                                        </div>
                                    </div>

                                    <div class="col-md-6 h-100 d-flex flex-column bg-white">
                                        <div class="p-2 bg-warning bg-opacity-10 text-center fw-bold small text-dark border-bottom d-flex justify-content-between px-4">
                                            <span>📝 TEST KAĞIDI</span>
                                            <span id="testQuestionCount" class="badge bg-white text-dark border">0 Soru</span>
                                        </div>
                                        <div id="testQuestionsList" class="overflow-auto p-2 flex-fill custom-scrollbar">
                                            <div class="text-center text-muted mt-5 small">
                                                Henüz soru eklenmedi.
                                            </div>
                                        </div>
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

// Liste Öğesi Render Fonksiyonu
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