// public/js/admin-page.js - YENİ VERSİYON

class AdminSystem {
    constructor() {
        this.currentUser = null;
        this.currentTheme = localStorage.getItem('adminTheme') || 'light';
        this.currentPage = 'dashboard';
        this.init();
    }

    init() {
        this.initFirebase();
        this.initTheme();
        this.initNavigation();
        this.initEventListeners();
        this.checkAuth();
    }

    initFirebase() {
        // Firebase zaten firebase-config.js'den yüklendi
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.functions = firebase.functions();
    }

    initTheme() {
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.updateThemeUI();
    }

    updateThemeUI() {
        const icon = document.getElementById('themeIcon');
        const text = document.getElementById('themeText');
        
        if (this.currentTheme === 'dark') {
            icon.className = 'fas fa-sun';
            text.textContent = 'Aydınlık Mod';
        } else {
            icon.className = 'fas fa-moon';
            text.textContent = 'Karanlık Mod';
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        localStorage.setItem('adminTheme', this.currentTheme);
        this.updateThemeUI();
    }

    initNavigation() {
        // Sidebar linklerine tıklama event'ları
        document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.getAttribute('data-page');
                this.loadPage(page);
            });
        });

        // Mobile menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }

    initEventListeners() {
        // Tema değiştirici
        document.getElementById('themeSwitcher').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Quick action buttons
        document.getElementById('btnAddQuestion')?.addEventListener('click', () => {
            this.showAddQuestionModal();
        });

        // Select all checkbox
        document.getElementById('selectAllPending')?.addEventListener('change', (e) => {
            this.toggleSelectAllPending(e.target.checked);
        });
        
        // Approve all button
        document.getElementById('approveAll')?.addEventListener('click', () => {
            this.approveAllSelected();
        });
        
        // Reject all button
        document.getElementById('rejectAll')?.addEventListener('click', () => {
            this.rejectAllSelected();
        });
    }

    async checkAuth() {
        try {
            // Önce Firebase auth kontrolü
            await new Promise((resolve, reject) => {
                const unsubscribe = this.auth.onAuthStateChanged(user => {
                    unsubscribe();
                    if (user) {
                        resolve(user);
                    } else {
                        reject(new Error('Kullanıcı girişi yapılmamış'));
                    }
                });
            });

            // Role guard kontrolü (eğer varsa)
            if (typeof checkAdminAccess === 'function') {
                const hasAccess = await checkAdminAccess();
                if (!hasAccess) {
                    this.showToast('Admin erişiminiz yok', 'error');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    return;
                }
            }

            // Kullanıcı bilgilerini yükle
            this.loadUserInfo();
            
            // Dashboard verilerini yükle
            this.loadDashboardData();
            
            // Recent activity yükle
            this.loadRecentActivity();
            
            // Pending approvals yükle
            this.loadPendingApprovals();

        } catch (error) {
            console.error('Auth error:', error);
            this.showToast('Oturum doğrulama hatası. Giriş sayfasına yönlendiriliyorsunuz...', 'error');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        }
    }

    async loadUserInfo() {
        const user = this.auth.currentUser;
        if (user) {
            this.currentUser = user;
            
            try {
                // Firestore'dan ek bilgileri al
                const userDoc = await this.db.collection('users').doc(user.uid).get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    
                    document.getElementById('adminName').textContent = 
                        userData?.displayName || user.email || 'Admin Kullanıcı';
                    
                    // Rolü belirle
                    let roleText = 'Kullanıcı';
                    if (userData?.role === 'superadmin') roleText = 'Süper Admin';
                    else if (userData?.role === 'admin') roleText = 'Admin';
                    else if (userData?.role === 'moderator') roleText = 'Moderatör';
                    
                    document.getElementById('adminRole').textContent = roleText;
                } else {
                    // Kullanıcı verisi yoksa
                    document.getElementById('adminName').textContent = user.email || 'Admin';
                    document.getElementById('adminRole').textContent = 'Admin';
                }
            } catch (error) {
                console.error('Kullanıcı bilgisi yükleme hatası:', error);
                document.getElementById('adminName').textContent = user.email || 'Admin';
                document.getElementById('adminRole').textContent = 'Admin';
            }
        }
    }

    async loadDashboardData() {
        try {
            // Toplam soru sayısı
            const questionsSnapshot = await this.db.collection('questions').count().get();
            document.getElementById('totalQuestions').textContent = 
                questionsSnapshot.data().count || 0;

            // Aktif kullanıcı sayısı (son 30 gün içinde giriş yapan)
            const monthAgo = new Date();
            monthAgo.setDate(monthAgo.getDate() - 30);
            
            const activeUsersSnapshot = await this.db.collection('users')
                .where('lastLogin', '>=', monthAgo)
                .count()
                .get();
            
            document.getElementById('activeUsers').textContent = 
                activeUsersSnapshot.data().count || 0;

            // Toplam sınav sayısı
            const examsSnapshot = await this.db.collection('exams').count().get();
            document.getElementById('totalExams').textContent = 
                examsSnapshot.data().count || 0;

        } catch (error) {
            console.error('Dashboard data error:', error);
            // Hata durumunda 0 göster
            document.getElementById('totalQuestions').textContent = '0';
            document.getElementById('activeUsers').textContent = '0';
            document.getElementById('totalExams').textContent = '0';
        }
    }

    async loadRecentActivity() {
        try {
            // Önce activities koleksiyonunu dene
            let snapshot;
            try {
                const activitiesRef = this.db.collection('activities')
                    .orderBy('timestamp', 'desc')
                    .limit(10);
                
                snapshot = await activitiesRef.get();
            } catch (error) {
                // Activities koleksiyonu yoksa questions'dan al
                console.log('Activities koleksiyonu bulunamadı, questions kullanılıyor...');
                const questionsRef = this.db.collection('questions')
                    .orderBy('createdAt', 'desc')
                    .limit(5);
                
                snapshot = await questionsRef.get();
            }
            
            const tbody = document.querySelector('#recentActivity tbody');
            if (!tbody) return;
            
            tbody.innerHTML = '';

            if (snapshot.empty) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-muted">
                            <i class="fas fa-info-circle"></i>
                            Henüz aktivite kaydı bulunmuyor
                        </td>
                    </tr>
                `;
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                const row = this.createActivityRow(data);
                tbody.appendChild(row);
            });

        } catch (error) {
            console.error('Recent activity error:', error);
            const tbody = document.querySelector('#recentActivity tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            Aktivite yüklenirken hata oluştu
                        </td>
                    </tr>
                `;
            }
        }
    }

    createActivityRow(activity) {
        const row = document.createElement('tr');
        
        // Zaman formatı
        const time = activity.timestamp?.toDate?.() || activity.createdAt?.toDate?.();
        const timeStr = time ? this.formatTimeAgo(time) : 'Bilinmiyor';
        
        // Aktivite tipini belirle
        let actionText = activity.action || 'Bilinmeyen aktivite';
        let userName = activity.userName || activity.createdBy || 'Sistem';
        
        // Eğer soru ise
        if (activity.questionText) {
            actionText = `Yeni soru eklendi: ${activity.questionText.substring(0, 50)}...`;
        }
        
        // Durum badge
        let statusBadge = '';
        if (activity.status === 'success') {
            statusBadge = '<span class="badge badge-success">Başarılı</span>';
        } else if (activity.status === 'error') {
            statusBadge = '<span class="badge badge-danger">Hata</span>';
        } else {
            statusBadge = '<span class="badge badge-info">Bilgi</span>';
        }
        
        row.innerHTML = `
            <td>
                <div class="user-cell">
                    <i class="fas fa-user-circle"></i>
                    <span>${userName}</span>
                </div>
            </td>
            <td>${actionText}</td>
            <td>${timeStr}</td>
            <td>${statusBadge}</td>
        `;
        
        return row;
    }

    async loadPendingApprovals() {
        try {
            const pendingRef = this.db.collection('questions')
                .where('status', '==', 'pending')
                .orderBy('createdAt', 'desc');
            
            const snapshot = await pendingRef.get();
            const tbody = document.querySelector('#pendingTable tbody');
            if (!tbody) return;
            
            tbody.innerHTML = '';

            if (snapshot.empty) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-muted">
                            <i class="fas fa-check-circle fa-2x mb-2"></i>
                            <p>Onay bekleyen içerik bulunmuyor</p>
                        </td>
                    </tr>
                `;
                return;
            }

            snapshot.forEach(doc => {
                const row = this.createPendingRow(doc.id, doc.data());
                tbody.appendChild(row);
            });

        } catch (error) {
            console.error('Pending approvals error:', error);
            const tbody = document.querySelector('#pendingTable tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            Onay bekleyen içerikler yüklenirken hata oluştu
                        </td>
                    </tr>
                `;
            }
        }
    }

    createPendingRow(id, data) {
        const row = document.createElement('tr');
        const date = data.createdAt?.toDate();
        const dateStr = date ? this.formatDate(date) : 'Bilinmiyor';
        
        // Soru metnini kısalt
        let questionText = 'Soru metni yok';
        if (data.questionText) {
            questionText = data.questionText.length > 100 
                ? data.questionText.substring(0, 100) + '...' 
                : data.questionText;
        }
        
        row.innerHTML = `
            <td>
                <input type="checkbox" class="pending-checkbox" data-id="${id}">
            </td>
            <td>
                <strong>${questionText}</strong>
                <br>
                <small class="text-muted">ID: ${id.substring(0, 8)}...</small>
            </td>
            <td>
                <div class="user-cell">
                    <i class="fas fa-user"></i>
                    ${data.createdBy || 'Bilinmiyor'}
                </div>
            </td>
            <td>
                <span class="badge badge-info">Soru</span>
            </td>
            <td>${dateStr}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-success approve-btn" data-id="${id}" title="Onayla">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-sm btn-danger reject-btn" data-id="${id}" title="Reddet">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="btn btn-sm btn-info preview-btn" data-id="${id}" title="Önizleme">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        `;

        // Event listeners for buttons
        row.querySelector('.approve-btn').addEventListener('click', () => this.approveContent(id));
        row.querySelector('.reject-btn').addEventListener('click', () => this.rejectContent(id));
        row.querySelector('.preview-btn').addEventListener('click', () => this.previewContent(id));

        return row;
    }

    async approveContent(id) {
        if (!confirm('Bu içeriği onaylamak istediğinize emin misiniz?')) return;

        try {
            await this.db.collection('questions').doc(id).update({
                status: 'approved',
                approvedBy: this.currentUser.email,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showToast('İçerik başarıyla onaylandı', 'success');
            this.loadPendingApprovals();
            this.loadDashboardData();
            this.loadRecentActivity();

        } catch (error) {
            console.error('Approval error:', error);
            this.showToast('Onaylama sırasında hata oluştu', 'error');
        }
    }

    async rejectContent(id) {
        const reason = prompt('Reddetme sebebini girin:');
        if (!reason) return;

        try {
            await this.db.collection('questions').doc(id).update({
                status: 'rejected',
                rejectionReason: reason,
                rejectedBy: this.currentUser.email,
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showToast('İçerik reddedildi', 'warning');
            this.loadPendingApprovals();

        } catch (error) {
            console.error('Rejection error:', error);
            this.showToast('Reddetme sırasında hata oluştu', 'error');
        }
    }

    previewContent(id) {
        // Modal ile önizleme göster
        this.showQuestionPreview(id);
    }
    
    async approveAllSelected() {
        const checkboxes = document.querySelectorAll('.pending-checkbox:checked');
        if (checkboxes.length === 0) {
            this.showToast('Lütfen onaylamak istediğiniz içerikleri seçin', 'warning');
            return;
        }
        
        if (!confirm(`${checkboxes.length} içeriği onaylamak istediğinize emin misiniz?`)) return;
        
        const ids = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
        
        try {
            const batch = this.db.batch();
            
            ids.forEach(id => {
                const docRef = this.db.collection('questions').doc(id);
                batch.update(docRef, {
                    status: 'approved',
                    approvedBy: this.currentUser.email,
                    approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            await batch.commit();
            
            this.showToast(`${ids.length} içerik başarıyla onaylandı`, 'success');
            this.loadPendingApprovals();
            this.loadDashboardData();
            this.loadRecentActivity();
            
        } catch (error) {
            console.error('Batch approval error:', error);
            this.showToast('Toplu onaylama sırasında hata oluştu', 'error');
        }
    }
    
    async rejectAllSelected() {
        const checkboxes = document.querySelectorAll('.pending-checkbox:checked');
        if (checkboxes.length === 0) {
            this.showToast('Lütfen reddetmek istediğiniz içerikleri seçin', 'warning');
            return;
        }
        
        const reason = prompt(`Reddetme sebebini girin (${checkboxes.length} içerik için):`);
        if (!reason) return;
        
        const ids = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
        
        try {
            const batch = this.db.batch();
            
            ids.forEach(id => {
                const docRef = this.db.collection('questions').doc(id);
                batch.update(docRef, {
                    status: 'rejected',
                    rejectionReason: reason,
                    rejectedBy: this.currentUser.email,
                    rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            await batch.commit();
            
            this.showToast(`${ids.length} içerik reddedildi`, 'warning');
            this.loadPendingApprovals();
            
        } catch (error) {
            console.error('Batch rejection error:', error);
            this.showToast('Toplu reddetme sırasında hata oluştu', 'error');
        }
    }

    toggleSelectAllPending(checked) {
        document.querySelectorAll('.pending-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
        });
    }

    async logout() {
        try {
            await this.auth.signOut();
            this.showToast('Başarıyla çıkış yapıldı', 'success');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Çıkış sırasında hata oluştu', 'error');
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';
        
        toast.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Az önce';
        if (diffMins < 60) return `${diffMins} dakika önce`;
        if (diffHours < 24) return `${diffHours} saat önce`;
        if (diffDays < 7) return `${diffDays} gün önce`;
        
        return date.toLocaleDateString('tr-TR');
    }

    formatDate(date) {
        return date.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    loadPage(page) {
        this.currentPage = page;
        
        // Update active nav item
        document.querySelectorAll('.sidebar-nav a').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
        
        // Update page title
        const titles = {
            'dashboard': 'Dashboard',
            'questions': 'Soru Yönetimi',
            'topics': 'Konu/Kategori Yönetimi',
            'exams': 'Sınav Yönetimi',
            'users': 'Kullanıcı Yönetimi',
            'reports': 'Raporlar',
            'content': 'İçerik Yönetimi',
            'settings': 'Sistem Ayarları'
        };
        
        document.getElementById('pageTitle').textContent = titles[page] || page;
        document.getElementById('pageSubtitle').textContent = 
            this.getPageSubtitle(page);
        
        // Hide dashboard, show dynamic content
        document.getElementById('dashboardContent').style.display = 'none';
        document.getElementById('dynamicContent').style.display = 'block';
        
        // Load page content
        this.loadPageContent(page);
    }

    getPageSubtitle(page) {
        const subtitles = {
            'dashboard': 'Sistem istatistikleri ve hızlı erişim',
            'questions': 'Soru ekleme, düzenleme ve silme işlemleri',
            'topics': 'Konu ve kategori yönetimi',
            'exams': 'Sınav oluşturma ve yönetimi',
            'users': 'Kullanıcı hesapları ve yetkilendirme',
            'reports': 'Detaylı analiz ve raporlar',
            'content': 'İçerik onayı ve yönetimi',
            'settings': 'Sistem ayarları ve konfigürasyon'
        };
        
        return subtitles[page] || '';
    }

    async loadPageContent(page) {
        const contentArea = document.getElementById('dynamicContent');
        if (!contentArea) return;
        
        // Show loading
        contentArea.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p>${page} yükleniyor...</p>
            </div>
        `;
        
        try {
            // Her sayfa için farklı içerik yükle
            switch(page) {
                case 'questions':
                    await this.loadQuestionsPage();
                    break;
                case 'users':
                    await this.loadUsersPage();
                    break;
                case 'topics':
                    await this.loadTopicsPage();
                    break;
                case 'exams':
                    await this.loadExamsPage();
                    break;
                case 'reports':
                    await this.loadReportsPage();
                    break;
                case 'settings':
                    await this.loadSettingsPage();
                    break;
                default:
                    contentArea.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-cogs fa-3x mb-3"></i>
                            <h3>Sayfa hazırlanıyor</h3>
                            <p>Bu sayfa yakında aktif olacaktır.</p>
                            <button class="btn btn-primary mt-3" onclick="adminSystem.loadPage('dashboard')">
                                <i class="fas fa-arrow-left"></i> Dashboard'a Dön
                            </button>
                        </div>
                    `;
            }
        } catch (error) {
            console.error(`Error loading ${page}:`, error);
            contentArea.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3 text-danger"></i>
                    <h3>Yükleme hatası</h3>
                    <p>Sayfa yüklenirken bir hata oluştu: ${error.message}</p>
                    <button class="btn btn-primary mt-2" onclick="adminSystem.loadPage('${page}')">
                        <i class="fas fa-redo"></i> Tekrar Dene
                    </button>
                </div>
            `;
        }
    }

    async loadQuestionsPage() {
        const contentArea = document.getElementById('dynamicContent');
        
        // Basic questions page structure
        contentArea.innerHTML = `
            <div class="table-container">
                <div class="table-header">
                    <h3><i class="fas fa-question-circle"></i> Soru Yönetimi</h3>
                    <div class="table-actions">
                        <button class="btn btn-primary" id="btnNewQuestion">
                            <i class="fas fa-plus"></i> Yeni Soru
                        </button>
                        <button class="btn btn-secondary" id="btnImportQuestions">
                            <i class="fas fa-file-import"></i> Toplu İçe Aktar
                        </button>
                        <button class="btn btn-info" id="btnExportQuestions">
                            <i class="fas fa-file-export"></i> Dışa Aktar
                        </button>
                    </div>
                </div>
                
                <!-- Filters -->
                <div class="filters-row">
                    <div class="row">
                        <div class="col-3">
                            <input type="text" class="form-control" placeholder="Soru metninde ara..." id="searchQuestions">
                        </div>
                        <div class="col-3">
                            <select class="form-control" id="filterStatus">
                                <option value="">Tüm Durumlar</option>
                                <option value="approved">Onaylanmış</option>
                                <option value="pending">Onay Bekleyen</option>
                                <option value="rejected">Reddedilmiş</option>
                                <option value="draft">Taslak</option>
                            </select>
                        </div>
                        <div class="col-3">
                            <select class="form-control" id="filterSubject">
                                <option value="">Tüm Konular</option>
                                <!-- Konular dynamic olarak yüklenecek -->
                            </select>
                        </div>
                        <div class="col-3">
                            <button class="btn btn-secondary btn-block" id="btnApplyFilters">
                                <i class="fas fa-filter"></i> Filtrele
                            </button>
                        </div>
                    </div>
                </div>
                
                <table class="admin-table" id="questionsTable">
                    <thead>
                        <tr>
                            <th width="50">ID</th>
                            <th>Soru Metni</th>
                            <th>Konu</th>
                            <th>Zorluk</th>
                            <th>Durum</th>
                            <th>Eklenme Tarihi</th>
                            <th>İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="7" class="text-center text-muted">
                                <div class="loading-container">
                                    <div class="spinner"></div>
                                    <p>Sorular yükleniyor...</p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
                
                <!-- Pagination -->
                <div class="pagination" id="questionsPagination">
                    <!-- Pagination dynamic olarak eklenecek -->
                </div>
            </div>
        `;
        
        // Load questions data
        await this.loadQuestionsData();
        
        // Add event listeners for buttons
        document.getElementById('btnNewQuestion')?.addEventListener('click', () => {
            this.showAddQuestionModal();
        });
    }

    async loadQuestionsData() {
        try {
            const questionsRef = this.db.collection('questions')
                .orderBy('createdAt', 'desc')
                .limit(20);
            
            const snapshot = await questionsRef.get();
            const tbody = document.querySelector('#questionsTable tbody');
            
            if (!tbody) return;
            
            if (snapshot.empty) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center text-muted">
                            <i class="fas fa-inbox fa-2x mb-2"></i>
                            <p>Henüz soru eklenmemiş</p>
                            <button class="btn btn-primary mt-2" id="btnAddFirstQuestion">
                                <i class="fas fa-plus"></i> İlk Soruyu Ekle
                            </button>
                        </td>
                    </tr>
                `;
                
                document.getElementById('btnAddFirstQuestion')?.addEventListener('click', () => {
                    this.showAddQuestionModal();
                });
                
                return;
            }
            
            tbody.innerHTML = '';
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const row = this.createQuestionTableRow(doc.id, data);
                tbody.appendChild(row);
            });
            
        } catch (error) {
            console.error('Questions data error:', error);
            const tbody = document.querySelector('#questionsTable tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center text-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Sorular yüklenirken hata oluştu: ${error.message}</p>
                        </td>
                    </tr>
                `;
            }
        }
    }

    createQuestionTableRow(id, data) {
        const row = document.createElement('tr');
        const date = data.createdAt?.toDate();
        const dateStr = date ? this.formatDate(date) : 'Bilinmiyor';
        
        // Durum badge
        let statusBadge = '';
        let statusClass = '';
        if (data.status === 'approved') {
            statusBadge = 'Onaylanmış';
            statusClass = 'badge-success';
        } else if (data.status === 'pending') {
            statusBadge = 'Onay Bekliyor';
            statusClass = 'badge-warning';
        } else if (data.status === 'rejected') {
            statusBadge = 'Reddedilmiş';
            statusClass = 'badge-danger';
        } else if (data.status === 'draft') {
            statusBadge = 'Taslak';
            statusClass = 'badge-info';
        } else {
            statusBadge = data.status || 'Bilinmiyor';
            statusClass = 'badge-secondary';
        }
        
        // Zorluk seviyesi
        let difficultyBadge = '';
        let difficultyClass = '';
        if (data.difficulty === 'easy') {
            difficultyBadge = 'Kolay';
            difficultyClass = 'badge-success';
        } else if (data.difficulty === 'medium') {
            difficultyBadge = 'Orta';
            difficultyClass = 'badge-warning';
        } else if (data.difficulty === 'hard') {
            difficultyBadge = 'Zor';
            difficultyClass = 'badge-danger';
        } else {
            difficultyBadge = data.difficulty || 'Belirtilmemiş';
            difficultyClass = 'badge-secondary';
        }
        
        // Soru metnini kısalt
        let questionText = data.questionText || 'Soru metni yok';
        if (questionText.length > 100) {
            questionText = questionText.substring(0, 100) + '...';
        }
        
        row.innerHTML = `
            <td>
                <small class="text-muted">${id.substring(0, 8)}...</small>
            </td>
            <td>
                <strong>${questionText}</strong>
                ${data.questionImage ? '<br><small><i class="fas fa-image"></i> Resimli</small>' : ''}
            </td>
            <td>${data.subject || 'Belirtilmemiş'}</td>
            <td>
                <span class="badge ${difficultyClass}">${difficultyBadge}</span>
            </td>
            <td>
                <span class="badge ${statusClass}">${statusBadge}</span>
            </td>
            <td>${dateStr}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-info" data-id="${id}" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" data-id="${id}" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-sm btn-success" data-id="${id}" title="Önizleme">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        `;
        
        // Add event listeners
        const buttons = row.querySelectorAll('button');
        buttons[0].addEventListener('click', () => this.editQuestion(id));
        buttons[1].addEventListener('click', () => this.deleteQuestion(id));
        buttons[2].addEventListener('click', () => this.previewQuestion(id));
        
        return row;
    }

    showAddQuestionModal() {
        const modalHTML = `
            <div class="modal active" id="addQuestionModal">
                <div class="modal-content" style="max-width: 800px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-plus-circle"></i> Yeni Soru Ekle</h3>
                        <button class="btn btn-sm btn-secondary" id="closeModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="questionForm">
                            <div class="row">
                                <div class="col-12">
                                    <div class="form-group">
                                        <label class="form-label">Soru Metni *</label>
                                        <textarea class="form-control" id="questionText" rows="4" 
                                                  placeholder="Soruyu buraya yazın..." required></textarea>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-6">
                                    <div class="form-group">
                                        <label class="form-label">Konu</label>
                                        <select class="form-control" id="questionSubject">
                                            <option value="">Konu Seçin</option>
                                            <option value="matematik">Matematik</option>
                                            <option value="fizik">Fizik</option>
                                            <option value="kimya">Kimya</option>
                                            <option value="denizcilik">Denizcilik</option>
                                            <option value="gys">GYS Genel</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="form-group">
                                        <label class="form-label">Zorluk Seviyesi</label>
                                        <select class="form-control" id="questionDifficulty">
                                            <option value="easy">Kolay</option>
                                            <option value="medium" selected>Orta</option>
                                            <option value="hard">Zor</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-12">
                                    <div class="form-group">
                                        <label class="form-label">Seçenekler</label>
                                        <div class="options-container" id="optionsContainer">
                                            <!-- Options will be added here -->
                                        </div>
                                        <button type="button" class="btn btn-sm btn-secondary mt-2" id="addOptionBtn">
                                            <i class="fas fa-plus"></i> Seçenek Ekle
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-12">
                                    <div class="form-group">
                                        <label class="form-label">Doğru Cevap *</label>
                                        <select class="form-control" id="correctAnswer" required>
                                            <option value="">Doğru cevabı seçin</option>
                                            <!-- Options will be populated dynamically -->
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-12">
                                    <div class="form-group">
                                        <label class="form-label">Açıklama (Opsiyonel)</label>
                                        <textarea class="form-control" id="questionExplanation" rows="3" 
                                                  placeholder="Soru açıklamasını buraya yazın..."></textarea>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-12">
                                    <div class="form-group">
                                        <label class="form-label">Durum</label>
                                        <select class="form-control" id="questionStatus">
                                            <option value="draft">Taslak</option>
                                            <option value="pending" selected>Onay Bekleyen</option>
                                            <option value="approved">Hemen Onayla</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelBtn">İptal</button>
                        <button class="btn btn-primary" id="saveQuestionBtn">
                            <i class="fas fa-save"></i> Soruyu Kaydet
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modalContainer');
        modalContainer.innerHTML = modalHTML;
        
        // Initialize options
        this.initQuestionOptions();
        
        // Add event listeners
        document.getElementById('closeModal')?.addEventListener('click', () => {
            this.closeModal();
        });
        
        document.getElementById('cancelBtn')?.addEventListener('click', () => {
            this.closeModal();
        });
        
        document.getElementById('addOptionBtn')?.addEventListener('click', () => {
            this.addQuestionOption();
        });
        
        document.getElementById('saveQuestionBtn')?.addEventListener('click', () => {
            this.saveQuestion();
        });
        
        // Close modal on background click
        document.getElementById('addQuestionModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'addQuestionModal') {
                this.closeModal();
            }
        });
    }

    initQuestionOptions() {
        const optionsContainer = document.getElementById('optionsContainer');
        const correctAnswerSelect = document.getElementById('correctAnswer');
        
        if (!optionsContainer || !correctAnswerSelect) return;
        
        // Clear existing options
        optionsContainer.innerHTML = '';
        correctAnswerSelect.innerHTML = '<option value="">Doğru cevabı seçin</option>';
        
        // Add 4 default options (A, B, C, D)
        const options = ['A', 'B', 'C', 'D'];
        
        options.forEach((letter, index) => {
            // Add option input
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option-row mb-2';
            optionDiv.innerHTML = `
                <div class="d-flex align-center gap-2">
                    <span class="option-letter" style="width: 30px;">${letter}</span>
                    <input type="text" class="form-control option-input" 
                           data-letter="${letter}" 
                           placeholder="${letter} seçeneğini yazın...">
                    <button type="button" class="btn btn-sm btn-danger remove-option-btn" data-letter="${letter}"
                            ${options.length <= 2 ? 'disabled' : ''}>
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            optionsContainer.appendChild(optionDiv);
            
            // Add to correct answer select
            const optionElement = document.createElement('option');
            optionElement.value = letter;
            optionElement.textContent = `${letter} Seçeneği`;
            correctAnswerSelect.appendChild(optionElement);
            
            // Add remove event listener
            optionDiv.querySelector('.remove-option-btn')?.addEventListener('click', () => {
                this.removeQuestionOption(letter);
            });
        });
    }

    addQuestionOption() {
        const optionsContainer = document.getElementById('optionsContainer');
        const correctAnswerSelect = document.getElementById('correctAnswer');
        
        if (!optionsContainer || !correctAnswerSelect) return;
        
        // Get existing letters
        const existingLetters = Array.from(optionsContainer.querySelectorAll('.option-letter'))
            .map(el => el.textContent);
        
        // Find next available letter (A, B, C, D, E, F, ...)
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        let nextLetter = 'A';
        for (const letter of alphabet) {
            if (!existingLetters.includes(letter)) {
                nextLetter = letter;
                break;
            }
        }
        
        // Add new option
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-row mb-2';
        optionDiv.innerHTML = `
            <div class="d-flex align-center gap-2">
                <span class="option-letter" style="width: 30px;">${nextLetter}</span>
                <input type="text" class="form-control option-input" 
                       data-letter="${nextLetter}" 
                       placeholder="${nextLetter} seçeneğini yazın...">
                <button type="button" class="btn btn-sm btn-danger remove-option-btn" data-letter="${nextLetter}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        optionsContainer.appendChild(optionDiv);
        
        // Add to correct answer select
        const optionElement = document.createElement('option');
        optionElement.value = nextLetter;
        optionElement.textContent = `${nextLetter} Seçeneği`;
        correctAnswerSelect.appendChild(optionElement);
        
        // Enable remove buttons if we have more than 2 options
        if (existingLetters.length + 1 > 2) {
            document.querySelectorAll('.remove-option-btn').forEach(btn => {
                btn.disabled = false;
            });
        }
        
        // Add remove event listener
        optionDiv.querySelector('.remove-option-btn')?.addEventListener('click', () => {
            this.removeQuestionOption(nextLetter);
        });
    }

    removeQuestionOption(letter) {
        const optionsContainer = document.getElementById('optionsContainer');
        const correctAnswerSelect = document.getElementById('correctAnswer');
        
        if (!optionsContainer || !correctAnswerSelect) return;
        
        // Remove option row
        const optionRow = optionsContainer.querySelector(`[data-letter="${letter}"]`)?.closest('.option-row');
        if (optionRow) {
            optionRow.remove();
        }
        
        // Remove from correct answer select
        const optionToRemove = correctAnswerSelect.querySelector(`option[value="${letter}"]`);
        if (optionToRemove) {
            optionToRemove.remove();
        }
        
        // Disable remove buttons if we have 2 or fewer options
        const remainingOptions = optionsContainer.querySelectorAll('.option-row').length;
        if (remainingOptions <= 2) {
            document.querySelectorAll('.remove-option-btn').forEach(btn => {
                btn.disabled = true;
            });
        }
    }

    async saveQuestion() {
        // Validate form
        const questionText = document.getElementById('questionText')?.value;
        const correctAnswer = document.getElementById('correctAnswer')?.value;
        
        if (!questionText || !correctAnswer) {
            this.showToast('Lütfen soru metni ve doğru cevabı girin', 'error');
            return;
        }
        
        // Get option values
        const options = {};
        document.querySelectorAll('.option-input').forEach(input => {
            const letter = input.getAttribute('data-letter');
            const value = input.value.trim();
            if (letter && value) {
                options[letter] = value;
            }
        });
        
        // Validate that we have at least 2 options
        const optionCount = Object.keys(options).length;
        if (optionCount < 2) {
            this.showToast('En az 2 seçenek girmelisiniz', 'error');
            return;
        }
        
        // Validate that correct answer exists in options
        if (!options[correctAnswer]) {
            this.showToast('Doğru cevap seçeneklerden biri olmalıdır', 'error');
            return;
        }
        
        // Prepare question data
        const questionData = {
            questionText: questionText,
            subject: document.getElementById('questionSubject')?.value || 'genel',
            difficulty: document.getElementById('questionDifficulty')?.value || 'medium',
            options: options,
            correctAnswer: correctAnswer,
            explanation: document.getElementById('questionExplanation')?.value || '',
            status: document.getElementById('questionStatus')?.value || 'pending',
            createdBy: this.currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            // Save to Firestore
            await this.db.collection('questions').add(questionData);
            
            this.showToast('Soru başarıyla kaydedildi', 'success');
            this.closeModal();
            
            // Refresh data
            if (this.currentPage === 'questions') {
                this.loadQuestionsData();
            }
            this.loadDashboardData();
            this.loadRecentActivity();
            this.loadPendingApprovals();
            
        } catch (error) {
            console.error('Save question error:', error);
            this.showToast('Soru kaydedilirken hata oluştu: ' + error.message, 'error');
        }
    }

    closeModal() {
        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer) {
            modalContainer.innerHTML = '';
        }
    }

    editQuestion(id) {
        this.showToast('Düzenleme özelliği yakında eklenecek', 'info');
        // TODO: Implement edit question
    }

    async deleteQuestion(id) {
        if (!confirm('Bu soruyu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
            return;
        }
        
        try {
            await this.db.collection('questions').doc(id).delete();
            this.showToast('Soru başarıyla silindi', 'success');
            
            // Refresh data
            if (this.currentPage === 'questions') {
                this.loadQuestionsData();
            }
            this.loadDashboardData();
            
        } catch (error) {
            console.error('Delete question error:', error);
            this.showToast('Soru silinirken hata oluştu: ' + error.message, 'error');
        }
    }

    previewQuestion(id) {
        this.showToast('Önizleme özelliği yakında eklenecek', 'info');
        // TODO: Implement question preview
    }

    showQuestionPreview(id) {
        this.showToast('Soru önizleme özelliği yakında eklenecek', 'info');
        // TODO: Implement question preview modal
    }

    async loadUsersPage() {
        const contentArea = document.getElementById('dynamicContent');
        
        contentArea.innerHTML = `
            <div class="table-container">
                <div class="table-header">
                    <h3><i class="fas fa-users"></i> Kullanıcı Yönetimi</h3>
                    <div class="table-actions">
                        <button class="btn btn-primary" id="btnNewUser">
                            <i class="fas fa-user-plus"></i> Yeni Kullanıcı
                        </button>
                    </div>
                </div>
                
                <!-- Filters -->
                <div class="filters-row mb-3">
                    <div class="row">
                        <div class="col-4">
                            <input type="text" class="form-control" placeholder="E-posta veya isim ara..." id="searchUsers">
                        </div>
                        <div class="col-4">
                            <select class="form-control" id="filterRole">
                                <option value="">Tüm Roller</option>
                                <option value="user">Kullanıcı</option>
                                <option value="moderator">Moderatör</option>
                                <option value="admin">Admin</option>
                                <option value="superadmin">Süper Admin</option>
                            </select>
                        </div>
                        <div class="col-4">
                            <button class="btn btn-secondary btn-block" id="btnFilterUsers">
                                <i class="fas fa-filter"></i> Filtrele
                            </button>
                        </div>
                    </div>
                </div>
                
                <table class="admin-table" id="usersTable">
                    <thead>
                        <tr>
                            <th>Kullanıcı</th>
                            <th>E-posta</th>
                            <th>Rol</th>
                            <th>Son Giriş</th>
                            <th>Kayıt Tarihi</th>
                            <th>İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="6" class="text-center text-muted">
                                <div class="loading-container">
                                    <div class="spinner"></div>
                                    <p>Kullanıcılar yükleniyor...</p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        
        await this.loadUsersData();
    }

    async loadUsersData() {
        try {
            const usersRef = this.db.collection('users')
                .orderBy('createdAt', 'desc')
                .limit(50);
            
            const snapshot = await usersRef.get();
            const tbody = document.querySelector('#usersTable tbody');
            
            if (!tbody) return;
            
            if (snapshot.empty) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-muted">
                            <i class="fas fa-users fa-2x mb-2"></i>
                            <p>Henüz kullanıcı kaydı bulunmuyor</p>
                        </td>
                    </tr>
                `;
                return;
            }
            
            tbody.innerHTML = '';
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const row = this.createUserTableRow(doc.id, data);
                tbody.appendChild(row);
            });
            
        } catch (error) {
            console.error('Users data error:', error);
            const tbody = document.querySelector('#usersTable tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Kullanıcılar yüklenirken hata oluştu</p>
                        </td>
                    </tr>
                `;
            }
        }
    }

    createUserTableRow(id, data) {
        const row = document.createElement('tr');
        
        const lastLogin = data.lastLogin?.toDate();
        const createdAt = data.createdAt?.toDate();
        
        const lastLoginStr = lastLogin ? this.formatTimeAgo(lastLogin) : 'Hiç giriş yapmamış';
        const createdAtStr = createdAt ? this.formatDate(createdAt) : 'Bilinmiyor';
        
        // Rol badge
        let roleBadge = '';
        let roleClass = '';
        if (data.role === 'superadmin') {
            roleBadge = 'Süper Admin';
            roleClass = 'badge-danger';
        } else if (data.role === 'admin') {
            roleBadge = 'Admin';
            roleClass = 'badge-warning';
        } else if (data.role === 'moderator') {
            roleBadge = 'Moderatör';
            roleClass = 'badge-info';
        } else {
            roleBadge = 'Kullanıcı';
            roleClass = 'badge-success';
        }
        
        row.innerHTML = `
            <td>
                <div class="user-cell">
                    <div class="user-avatar-small">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div>
                        <strong>${data.displayName || 'İsimsiz Kullanıcı'}</strong>
                        <br>
                        <small class="text-muted">ID: ${id.substring(0, 8)}...</small>
                    </div>
                </div>
            </td>
            <td>${data.email || 'E-posta yok'}</td>
            <td>
                <span class="badge ${roleClass}">${roleBadge}</span>
            </td>
            <td>${lastLoginStr}</td>
            <td>${createdAtStr}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-info" data-id="${id}" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" data-id="${id}" title="Rol Değiştir">
                        <i class="fas fa-user-cog"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" data-id="${id}" title="Engelle">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </td>
        `;
        
        return row;
    }

    async loadTopicsPage() {
        const contentArea = document.getElementById('dynamicContent');
        
        contentArea.innerHTML = `
            <div class="row">
                <div class="col-8">
                    <div class="table-container">
                        <div class="table-header">
                            <h3><i class="fas fa-folder-tree"></i> Konular ve Kategoriler</h3>
                            <button class="btn btn-primary" id="btnNewTopic">
                                <i class="fas fa-folder-plus"></i> Yeni Konu
                            </button>
                        </div>
                        <div id="topicsTree">
                            <!-- Topics tree will be loaded here -->
                            <div class="loading-container">
                                <div class="spinner"></div>
                                <p>Konular yükleniyor...</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-4">
                    <div class="card">
                        <div class="card-header">
                            <h4><i class="fas fa-info-circle"></i> Konu Yönetimi</h4>
                        </div>
                        <div class="card-body">
                            <p>Konu ve kategorileri buradan yönetebilirsiniz:</p>
                            <ul class="list-unstyled">
                                <li><i class="fas fa-check text-success"></i> Hiyerarşik yapı</li>
                                <li><i class="fas fa-check text-success"></i> Soru sayıları</li>
                                <li><i class="fas fa-check text-success"></i> Durum yönetimi</li>
                                <li><i class="fas fa-check text-success"></i> Sıralama</li>
                            </ul>
                            <div class="alert alert-info mt-3">
                                <small>
                                    <i class="fas fa-lightbulb"></i>
                                    <strong>İpucu:</strong> Konuları sürükleyip bırakarak sıralayabilirsiniz.
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        await this.loadTopicsData();
    }

    async loadTopicsData() {
        // TODO: Implement topics data loading
        const topicsTree = document.getElementById('topicsTree');
        if (topicsTree) {
            topicsTree.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open fa-3x mb-3"></i>
                    <h4>Konu Yönetimi</h4>
                    <p>Bu özellik yakında eklenecek</p>
                    <button class="btn btn-primary mt-3" onclick="adminSystem.loadPage('dashboard')">
                        Dashboard'a Dön
                    </button>
                </div>
            `;
        }
    }

    async loadExamsPage() {
        this.showDynamicPage('exams', 'Sınav Yönetimi', 'Sınav oluşturma ve yönetimi');
    }

    async loadReportsPage() {
        this.showDynamicPage('reports', 'Raporlar', 'Detaylı analiz ve raporlar');
    }

    async loadSettingsPage() {
        this.showDynamicPage('settings', 'Sistem Ayarları', 'Sistem ayarları ve konfigürasyon');
    }

    showDynamicPage(page, title, subtitle) {
        const contentArea = document.getElementById('dynamicContent');
        
        contentArea.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cogs fa-3x mb-3"></i>
                <h3>${title}</h3>
                <p>${subtitle}</p>
                <p class="text-muted mt-3">Bu sayfa şu anda geliştirme aşamasındadır.</p>
                <button class="btn btn-primary mt-3" onclick="adminSystem.loadPage('dashboard')">
                    <i class="fas fa-arrow-left"></i> Dashboard'a Dön
                </button>
            </div>
        `;
    }
}

// Global instance
let adminSystem;

function initializeAdminSystem() {
    adminSystem = new AdminSystem();
}

// Helper functions accessible globally
function showToast(message, type) {
    if (adminSystem) {
        adminSystem.showToast(message, type);
    }
}

function formatDate(date) {
    if (adminSystem) {
        return adminSystem.formatDate(date);
    }
    return date.toLocaleDateString('tr-TR');
}