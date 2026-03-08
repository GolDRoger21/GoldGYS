import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import { collection, query, where, getDocs, doc, updateDoc, orderBy, writeBatch, limit, startAfter } from "../../firestore-metrics.js";

let usersTableBody = null; // Global seçim yerine init içinde seçeceğiz
let currentUsers = [];
let currentView = "pending";
let filteredUsers = [];
const selectedUserIds = new Set();
const ADMIN_USERS_FETCH_LIMIT = 500;
const userPaging = {
    lastVisible: null,
    hasMore: false,
    loadingMore: false
};

const filters = {
    search: "",
    status: "",
    role: ""
};

export async function initUsersPage() {
    console.log("Üye yönetimi yükleniyor...");
    
    // 1. Önce Arayüzü Oluştur (Butonlar HTML'de yoksa ekle)
    renderUsersInterface();

    // 2. Tablo Elementini Seç (Artık sayfada var)
    usersTableBody = document.getElementById('usersTableBody');
    usersTableBody.addEventListener('click', handleTableClick);
    usersTableBody.addEventListener('change', handleRowSelection);
    wireInterfaceControls();
    
    // 3. Veriyi Yükle
    await loadPendingUsers(); 
}

function renderUsersInterface() {
    // Admin panelindeki ilgili section'ı bul
    const container = document.querySelector('#section-users .card');
    if(!container) return;

    // Arayüzü (Butonlar ve Tablo) güvenli bir şekilde oluştur
    container.innerHTML = `
        <div class="users-toolbar">
            <div class="users-toolbar-row">
                <div class="users-view-buttons">
                    <button id="btnShowPending" class="btn btn-sm btn-warning">⏳ Onay Bekleyenler</button>
                    <button id="btnShowAll" class="btn btn-sm btn-secondary">📋 Tüm Üyeler</button>
                    <button id="btnRefreshUsers" class="btn btn-sm btn-secondary">🔄 Yenile</button>
                </div>
                <div class="users-search">
                    <input id="usersSearchInput" class="form-control" type="search" placeholder="İsim, e-posta veya UID ile ara">
                </div>
                <div class="users-filters">
                    <select id="usersRoleFilter" class="form-select">
                        <option value="">Tüm Roller</option>
                        <option value="student">Öğrenci</option>
                        <option value="editor">Editör</option>
                        <option value="admin">Admin</option>
                    </select>
                    <select id="usersStatusFilter" class="form-select">
                        <option value="">Tüm Durumlar</option>
                        <option value="pending">Onay Bekliyor</option>
                        <option value="active">Aktif</option>
                        <option value="suspended">Askıda</option>
                        <option value="rejected">Reddedildi</option>
                    </select>
                </div>
            </div>
            <div class="users-bulk-bar">
                <label class="users-select-all">
                    <input type="checkbox" id="selectAllUsers">
                    Listelenenleri seç
                </label>
                <span id="selectedCount">0 seçili</span>
                <div class="users-bulk-actions">
                    <button id="btnBulkApprove" class="btn btn-sm btn-success">✅ Toplu Onayla</button>
                    <button id="btnBulkReject" class="btn btn-sm btn-danger">❌ Toplu Reddet</button>
                    <button id="btnBulkSuspend" class="btn btn-sm btn-warning">🚫 Toplu Askıya Al</button>
                    <button id="btnClearSelection" class="btn btn-sm btn-secondary">Temizle</button>
                </div>
            </div>
        </div>
        <div class="table-responsive">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Seç</th>
                        <th>Kullanıcı</th>
                        <th>Rol</th>
                        <th>Durum</th>
                        <th>Son Giriş</th>
                        <th>Kayıt Tarihi</th>
                        <th>İşlemler</th>
                    </tr>
                </thead>
                <tbody id="usersTableBody"></tbody>
            </table>
        </div>
    `;

    // Event Listener'ları elementler oluştuktan SONRA ekle
    const btnPending = document.getElementById('btnShowPending');
    const btnAll = document.getElementById('btnShowAll');

    if(btnPending) btnPending.addEventListener('click', loadPendingUsers);
    if(btnAll) btnAll.addEventListener('click', loadAllUsers);
}

// --- VERİ YÜKLEME FONKSİYONLARI ---

async function loadPendingUsers() {
    if(!usersTableBody) return;
    currentView = "pending";
    usersTableBody.innerHTML = '<tr><td colspan="7">Yükleniyor...</td></tr>';
    userPaging.lastVisible = null;
    userPaging.hasMore = false;
    userPaging.loadingMore = false;
    await renderUsersList({ append: false });
}

async function loadAllUsers() {
    if(!usersTableBody) return;
    currentView = "all";
    usersTableBody.innerHTML = '<tr><td colspan="7">Yükleniyor...</td></tr>';
    userPaging.lastVisible = null;
    userPaging.hasMore = false;
    userPaging.loadingMore = false;
    await renderUsersList({ append: false });
}

function buildUsersQuery() {
    const constraints = [];
    if (currentView === "pending") {
        constraints.push(where("status", "==", "pending"));
    }
    constraints.push(orderBy("createdAt", "desc"));
    if (userPaging.lastVisible) {
        constraints.push(startAfter(userPaging.lastVisible));
    }
    constraints.push(limit(ADMIN_USERS_FETCH_LIMIT));
    return query(collection(db, "users"), ...constraints);
}

function updateLoadMoreButton() {
    const btn = document.getElementById('btnLoadMoreUsers');
    if (!btn) return;
    btn.style.display = userPaging.hasMore ? 'inline-flex' : 'none';
    btn.disabled = userPaging.loadingMore;
    btn.textContent = userPaging.loadingMore ? 'Yükleniyor...' : 'Daha Fazla Yükle';
}

async function renderUsersList({ append = false } = {}) {
    try {
        const queryRef = buildUsersQuery();
        const snapshot = await getDocs(queryRef);
        const incomingUsers = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                uid: data.uid || docSnap.id,
                ...data
            };
        });

        if (append) {
            const existing = new Map(currentUsers.map((user) => [user.uid, user]));
            incomingUsers.forEach((user) => existing.set(user.uid, user));
            currentUsers = Array.from(existing.values());
        } else {
            currentUsers = incomingUsers;
        }

        userPaging.lastVisible = snapshot.docs[snapshot.docs.length - 1] || userPaging.lastVisible;
        userPaging.hasMore = snapshot.size === ADMIN_USERS_FETCH_LIMIT;
        userPaging.loadingMore = false;
        updateLoadMoreButton();

        applyFilters();
        focusRequestedUser();
        updateFilterStateForView();
    } catch (error) {
        console.error("Üye listesi hatası:", error);
        usersTableBody.innerHTML = `<tr><td colspan="7" class="error">Hata: ${error.message}</td></tr>`;
        userPaging.loadingMore = false;
        updateLoadMoreButton();
    }
}

function applyFilters() {
    const searchValue = filters.search.trim().toLowerCase();
    filteredUsers = currentUsers.filter((user) => {
        const matchesSearch = !searchValue ||
            `${user.displayName || ""} ${user.email || ""} ${user.uid || ""}`.toLowerCase().includes(searchValue);
        const matchesStatus = !filters.status || user.status === filters.status;
        const matchesRole = !filters.role || user.role === filters.role;
        return matchesSearch && matchesStatus && matchesRole;
    });
    renderUsersRows(filteredUsers);
    updateSelectionSummary();
}

function renderUsersRows(list) {
    usersTableBody.innerHTML = '';

    if (!list.length) {
        usersTableBody.innerHTML = '<tr><td colspan="7">Kayıt bulunamadı.</td></tr>';
        return;
    }

    list.forEach(user => {
        const tr = document.createElement('tr');
        tr.dataset.userRow = user.uid;
        const dateStr = formatDate(user.createdAt);
        const lastLoginStr = formatDate(user.lastLoginAt);
        const isChecked = selectedUserIds.has(user.uid);

        tr.innerHTML = `
            <td>
                <input type="checkbox" data-select-user="${user.uid}" ${isChecked ? "checked" : ""}>
            </td>
            <td>
                <div class="user-info">
                    <span class="name">${user.displayName || 'İsimsiz'}</span><br>
                    <small>${user.email || '-'}</small>
                    <div class="user-meta">UID: ${user.uid || '-'} </div>
                </div>
            </td>
            <td><span class="badge badge-${user.role}">${getRoleLabel(user.role)}</span></td>
            <td><span class="badge status-${user.status}">${getStatusLabel(user.status)}</span></td>
            <td>${lastLoginStr}</td>
            <td>${dateStr}</td>
            <td>
                <div class="users-actions">
                    <button class="btn btn-sm btn-secondary" data-action="view" data-uid="${user.uid}">👁️ Profil</button>
                    ${getActionButtons(user.uid, user.status)}
                </div>
            </td>
        `;
        usersTableBody.appendChild(tr);
    });
}

function getStatusLabel(status) {
    const labels = {
        'pending': 'Onay Bekliyor',
        'active': 'Aktif',
        'suspended': 'Askıda',
        'rejected': 'Reddedildi'
    };
    return labels[status] || status;
}

function getRoleLabel(role) {
    const labels = {
        'student': 'Öğrenci',
        'editor': 'Editör',
        'admin': 'Admin'
    };
    return labels[role] || role || '-';
}

function getActionButtons(uid, status) {
    if (status === 'pending') {
        return `
            <button class="btn btn-sm btn-success" data-action="approve" data-uid="${uid}">✅ Onayla</button>
            <button class="btn btn-sm btn-danger" data-action="reject" data-uid="${uid}">❌ Reddet</button>
        `;
    } else if (status === 'active') {
        return `
            <button class="btn btn-sm btn-warning" data-action="suspend" data-uid="${uid}">🚫 Askıya Al</button>
        `;
    } else if (status === 'suspended' || status === 'rejected') {
        return `
            <button class="btn btn-sm btn-success" data-action="activate" data-uid="${uid}">✅ Aktif Et</button>
        `;
    }
    return '';
}

function handleTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, uid } = button.dataset;
    const user = currentUsers.find((item) => item.uid === uid);
    if (!user) return;

    if (action === "view") {
        openUserModal(user);
        return;
    }
    if (action === "approve") {
        updateUserStatus(uid, 'active', 'Bu üyeliği onaylamak istiyor musunuz?');
        return;
    }
    if (action === "reject") {
        updateUserStatus(uid, 'rejected', 'Bu üyeliği REDDETMEK istiyor musunuz?');
        return;
    }
    if (action === "suspend") {
        updateUserStatus(uid, 'suspended', 'Üyeyi askıya almak istiyor musunuz?');
        return;
    }
    if (action === "activate") {
        updateUserStatus(uid, 'active', 'Üyeyi tekrar AKTİF etmek istiyor musunuz?');
    }
}

function handleRowSelection(event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-select-user]');
    if (!checkbox) return;
    const uid = checkbox.dataset.selectUser;
    if (checkbox.checked) {
        selectedUserIds.add(uid);
    } else {
        selectedUserIds.delete(uid);
    }
    updateSelectionSummary();
}

async function updateUserStatus(uid, status, confirmMessage) {
    try {
        if (confirmMessage) {
            const shouldProceed = await showConfirm(confirmMessage, {
                title: "Durum Güncelle",
                confirmText: "Onayla",
                cancelText: "Vazgeç"
            });
            if (!shouldProceed) return;
        }
        await updateDoc(doc(db, "users", uid), { status: status });
        updateUserInState(uid, { status });
        showToast(`Kullanıcı durumu güncellendi: ${getStatusLabel(status)}`, "success");
        refreshCurrentView(); 
    } catch (error) {
        console.error("Güncelleme hatası:", error);
        showToast("İşlem tamamlanamadı. Lütfen tekrar deneyin.", "error");
    }
}

function focusRequestedUser() {
    const uid = sessionStorage.getItem('adminUserFocus');
    if (!uid) return;
    const triedAll = sessionStorage.getItem('adminUserFocusAll') === '1';
    const row = document.querySelector(`[data-user-row="${uid}"]`);
    if (!row && !triedAll) {
        sessionStorage.setItem('adminUserFocusAll', '1');
        loadAllUsers();
        return;
    }
    sessionStorage.removeItem('adminUserFocus');
    sessionStorage.removeItem('adminUserFocusAll');
    if (!row) return;
    row.classList.add('highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => row.classList.remove('highlight'), 3500);
}

function wireInterfaceControls() {
    const container = document.querySelector('#section-users .card');
    if (container && !document.getElementById('btnLoadMoreUsers')) {
        const loadMoreWrap = document.createElement('div');
        loadMoreWrap.className = 'd-flex justify-content-center mt-3';
        loadMoreWrap.innerHTML = '<button id="btnLoadMoreUsers" class="btn btn-sm btn-outline-secondary" style="display:none;">Daha Fazla Yükle</button>';
        container.appendChild(loadMoreWrap);
    }

    const searchInput = document.getElementById('usersSearchInput');
    const roleFilter = document.getElementById('usersRoleFilter');
    const statusFilter = document.getElementById('usersStatusFilter');
    const selectAll = document.getElementById('selectAllUsers');
    const bulkApprove = document.getElementById('btnBulkApprove');
    const bulkReject = document.getElementById('btnBulkReject');
    const bulkSuspend = document.getElementById('btnBulkSuspend');
    const clearSelection = document.getElementById('btnClearSelection');
    const refreshBtn = document.getElementById('btnRefreshUsers');
    const loadMoreBtn = document.getElementById('btnLoadMoreUsers');

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            filters.search = event.target.value;
            applyFilters();
        });
    }
    if (roleFilter) {
        roleFilter.addEventListener('change', (event) => {
            filters.role = event.target.value;
            applyFilters();
        });
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', (event) => {
            filters.status = event.target.value;
            applyFilters();
        });
    }
    if (selectAll) {
        selectAll.addEventListener('change', (event) => {
            if (event.target.checked) {
                filteredUsers.forEach((user) => selectedUserIds.add(user.uid));
            } else {
                filteredUsers.forEach((user) => selectedUserIds.delete(user.uid));
            }
            applyFilters();
        });
    }

    if (bulkApprove) bulkApprove.addEventListener('click', () => runBulkStatusUpdate('active'));
    if (bulkReject) bulkReject.addEventListener('click', () => runBulkStatusUpdate('rejected'));
    if (bulkSuspend) bulkSuspend.addEventListener('click', () => runBulkStatusUpdate('suspended'));
    if (clearSelection) {
        clearSelection.addEventListener('click', () => {
            selectedUserIds.clear();
            applyFilters();
        });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', refreshCurrentView);
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', async () => {
            if (!userPaging.hasMore || userPaging.loadingMore) return;
            userPaging.loadingMore = true;
            updateLoadMoreButton();
            await renderUsersList({ append: true });
        });
    }
}

function updateFilterStateForView() {
    const statusFilter = document.getElementById('usersStatusFilter');
    if (!statusFilter) return;
    if (currentView === 'pending') {
        statusFilter.value = 'pending';
        statusFilter.disabled = true;
        filters.status = 'pending';
    } else {
        statusFilter.disabled = false;
        if (filters.status === 'pending') {
            statusFilter.value = '';
            filters.status = '';
        }
    }
    applyFilters();
}

function updateSelectionSummary() {
    const selectedCountEl = document.getElementById('selectedCount');
    const selectAll = document.getElementById('selectAllUsers');
    const selectedUsers = getSelectedUsers();

    if (selectedCountEl) {
        selectedCountEl.textContent = `${selectedUsers.length} seçili`;
    }
    if (selectAll) {
        selectAll.checked = filteredUsers.length > 0 && filteredUsers.every((user) => selectedUserIds.has(user.uid));
        selectAll.indeterminate = filteredUsers.some((user) => selectedUserIds.has(user.uid)) && !selectAll.checked;
    }

    const pendingSelected = selectedUsers.filter((user) => user.status === 'pending').length;
    const activeSelected = selectedUsers.filter((user) => user.status === 'active').length;

    const bulkApprove = document.getElementById('btnBulkApprove');
    const bulkReject = document.getElementById('btnBulkReject');
    const bulkSuspend = document.getElementById('btnBulkSuspend');
    if (bulkApprove) bulkApprove.disabled = pendingSelected === 0;
    if (bulkReject) bulkReject.disabled = pendingSelected === 0;
    if (bulkSuspend) bulkSuspend.disabled = activeSelected === 0;
}

function getSelectedUsers() {
    return currentUsers.filter((user) => selectedUserIds.has(user.uid));
}

async function runBulkStatusUpdate(status) {
    const selectedUsers = getSelectedUsers();
    if (!selectedUsers.length) {
        showToast("Lütfen işlem yapmak istediğiniz üyeleri seçin.", "info");
        return;
    }
    const filteredByStatus = selectedUsers.filter((user) => {
        if (status === 'active') return user.status === 'pending' || user.status === 'suspended' || user.status === 'rejected';
        if (status === 'rejected') return user.status === 'pending';
        if (status === 'suspended') return user.status === 'active';
        return false;
    });
    if (!filteredByStatus.length) {
        showToast("Seçili üyeler için uygun bir durum bulunamadı.", "info");
        return;
    }
    const shouldUpdate = await showConfirm(`${filteredByStatus.length} üyeyi "${getStatusLabel(status)}" olarak güncellemek istiyor musunuz?`, {
        title: "Toplu Durum Güncelleme",
        confirmText: "Güncelle",
        cancelText: "Vazgeç"
    });
    if (!shouldUpdate) return;

    try {
        const batch = writeBatch(db);
        filteredByStatus.forEach((user) => {
            batch.update(doc(db, "users", user.uid), { status });
        });
        await batch.commit();
        filteredByStatus.forEach((user) => updateUserInState(user.uid, { status }));
        showToast(`Toplu işlem tamamlandı: ${filteredByStatus.length} üye güncellendi.`, "success");
        refreshCurrentView();
    } catch (error) {
        console.error("Toplu güncelleme hatası:", error);
        showToast("Toplu işlem başarısız oldu. Lütfen tekrar deneyin.", "error");
    }
}

function refreshCurrentView() {
    if (currentView === 'pending') {
        loadPendingUsers();
    } else {
        loadAllUsers();
    }
}

function updateUserInState(uid, updates) {
    currentUsers = currentUsers.map((user) => user.uid === uid ? { ...user, ...updates } : user);
}

function openUserModal(user) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="admin-modal-content" style="max-width:720px;">
            <div class="modal-header">
                <h3>Üye Profili</h3>
                <button class="close-btn" aria-label="Kapat">✕</button>
            </div>
            <div class="modal-body-scroll">
                <div class="user-profile-grid">
                    <div class="user-profile-card">
                        <h4>Hızlı Bilgiler</h4>
                        <p><strong>Ad Soyad:</strong> ${user.displayName || '-'}</p>
                        <p><strong>E-posta:</strong> ${user.email || '-'}</p>
                        <p><strong>UID:</strong> ${user.uid || '-'}</p>
                        <p><strong>Rol:</strong> ${getRoleLabel(user.role)}</p>
                        <p><strong>Durum:</strong> ${getStatusLabel(user.status)}</p>
                        <p><strong>Son Giriş:</strong> ${formatDate(user.lastLoginAt)}</p>
                        <p><strong>Kayıt:</strong> ${formatDate(user.createdAt)}</p>
                        <div class="user-profile-actions">
                            <button class="btn btn-sm btn-secondary" data-copy="${user.email || ''}">📋 E-posta Kopyala</button>
                            <button class="btn btn-sm btn-secondary" data-copy="${user.uid || ''}">📋 UID Kopyala</button>
                        </div>
                    </div>
                    <div class="user-profile-card">
                        <h4>Düzenle</h4>
                        <form id="userEditForm">
                            <label class="form-label">Ad Soyad</label>
                            <input class="form-control" name="displayName" value="${user.displayName || ''}">
                            <label class="form-label">Rol</label>
                            <select class="form-select" name="role">
                                <option value="student" ${user.role === 'student' ? 'selected' : ''}>Öğrenci</option>
                                <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editör</option>
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                            <label class="form-label">Durum</label>
                            <select class="form-select" name="status">
                                <option value="pending" ${user.status === 'pending' ? 'selected' : ''}>Onay Bekliyor</option>
                                <option value="active" ${user.status === 'active' ? 'selected' : ''}>Aktif</option>
                                <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Askıda</option>
                                <option value="rejected" ${user.status === 'rejected' ? 'selected' : ''}>Reddedildi</option>
                            </select>
                            <div class="modal-actions">
                                <button type="submit" class="btn btn-primary">Kaydet</button>
                                <button type="button" class="btn btn-secondary" data-close>Vazgeç</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('.close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeModal();
    });
    overlay.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', closeModal));
    overlay.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const value = btn.getAttribute('data-copy');
            if (!value) return;
            try {
                await navigator.clipboard.writeText(value);
                showToast("Kopyalama tamamlandı.", "success");
            } catch (error) {
                console.error("Kopyalama hatası:", error);
                showToast("Kopyalama başarısız oldu.", "error");
            }
        });
    });

    const form = overlay.querySelector('#userEditForm');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const updates = {
            displayName: formData.get('displayName').trim(),
            role: formData.get('role'),
            status: formData.get('status')
        };
        try {
            await updateDoc(doc(db, "users", user.uid), updates);
            updateUserInState(user.uid, updates);
            showToast("Profil güncellendi.", "success");
            refreshCurrentView();
            closeModal();
        } catch (error) {
            console.error("Profil güncelleme hatası:", error);
            showToast("Profil güncellenemedi. Lütfen tekrar deneyin.", "error");
        }
    });
}

function formatDate(value) {
    if (!value) return '-';
    if (value.seconds) {
        return new Date(value.seconds * 1000).toLocaleDateString('tr-TR');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('tr-TR');
}
