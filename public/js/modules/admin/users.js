import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let usersTableBody = null; // Global seçim yerine init içinde seçeceğiz

export async function initUsersPage() {
    console.log("Üye yönetimi yükleniyor...");
    
    // 1. Önce Arayüzü Oluştur (Butonlar HTML'de yoksa ekle)
    renderUsersInterface();

    // 2. Tablo Elementini Seç (Artık sayfada var)
    usersTableBody = document.getElementById('usersTableBody');
    
    // 3. Veriyi Yükle
    await loadPendingUsers(); 
}

function renderUsersInterface() {
    // Admin panelindeki ilgili section'ı bul
    const container = document.querySelector('#section-users .card');
    if(!container) return;

    // Arayüzü (Butonlar ve Tablo) güvenli bir şekilde oluştur
    container.innerHTML = `
        <div class="toolbar mb-3 p-2" style="background: rgba(255,255,255,0.05); border-radius: 8px; display:flex; gap:10px;">
            <button id="btnShowPending" class="btn btn-sm btn-warning">⏳ Onay Bekleyenler</button>
            <button id="btnShowAll" class="btn btn-sm btn-secondary">📋 Tüm Üyeler</button>
        </div>
        <div class="table-responsive">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Kullanıcı</th>
                        <th>Rol</th>
                        <th>Durum</th>
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
    usersTableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    // Sadece 'pending' olanları getir
    const q = query(
        collection(db, "users"), 
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
    );
    renderUsersList(q);
}

async function loadAllUsers() {
    if(!usersTableBody) return;
    usersTableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    // Tüm kullanıcıları getir
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    renderUsersList(q);
}

async function renderUsersList(queryRef) {
    try {
        const snapshot = await getDocs(queryRef);
        usersTableBody.innerHTML = '';

        if (snapshot.empty) {
            usersTableBody.innerHTML = '<tr><td colspan="5">Kayıt bulunamadı.</td></tr>';
            return;
        }

        snapshot.forEach(docSnap => {
            const user = docSnap.data();
            const tr = document.createElement('tr');
            
            // Tarih formatlama
            const dateStr = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : '-';
            
            tr.innerHTML = `
                <td>
                    <div class="user-info">
                        <span class="name" style="font-weight:bold; color:var(--text-primary);">${user.displayName || 'İsimsiz'}</span><br>
                        <small style="color:var(--text-secondary);">${user.email}</small>
                    </div>
                </td>
                <td><span class="badge badge-${user.role}">${user.role}</span></td>
                <td><span class="badge status-${user.status}">${getStatusLabel(user.status)}</span></td>
                <td>${dateStr}</td>
                <td>
                    ${getActionButtons(user.uid, user.status)}
                </td>
            `;
            usersTableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Üye listesi hatası:", error);
        usersTableBody.innerHTML = `<tr><td colspan="5" class="error">Hata: ${error.message}</td></tr>`;
    }
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

function getActionButtons(uid, status) {
    if (status === 'pending') {
        return `
            <button class="btn-sm btn-success" onclick="window.AdminUsers.approveUser('${uid}')">✅ Onayla</button>
            <button class="btn-sm btn-danger" onclick="window.AdminUsers.rejectUser('${uid}')">❌ Reddet</button>
        `;
    } else if (status === 'active') {
        return `
            <button class="btn-sm btn-warning" onclick="window.AdminUsers.suspendUser('${uid}')">🚫 Askıya Al</button>
        `;
    }
    return '';
}

// Global scope'a fonksiyonları atayalım (HTML içindeki onclick için)
window.AdminUsers = {
    approveUser: async (uid) => {
        if(!confirm('Bu üyeliği onaylamak istiyor musunuz?')) return;
        await updateUserStatus(uid, 'active');
    },
    rejectUser: async (uid) => {
        if(!confirm('Bu üyeliği REDDETMEK istiyor musunuz?')) return;
        await updateUserStatus(uid, 'rejected');
    },
    suspendUser: async (uid) => {
        if(!confirm('Üyeyi askıya almak istiyor musunuz?')) return;
        await updateUserStatus(uid, 'suspended');
    }
};

async function updateUserStatus(uid, status) {
    try {
        await updateDoc(doc(db, "users", uid), { status: status });
        alert(`Kullanıcı durumu güncellendi: ${status}`);
        // Listeyi yenile (Hangi sekmedeysek ona göre yenilemek daha iyi olur ama şimdilik pending'i çağıralım)
        loadPendingUsers(); 
    } catch (error) {
        console.error("Güncelleme hatası:", error);
        alert("İşlem başarısız!");
    }
}