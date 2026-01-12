import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const usersTableBody = document.getElementById('usersTableBody');

export async function initUsersPage() {
    console.log("Üye yönetimi yükleniyor...");
    await loadPendingUsers(); // Önce onay bekleyenleri getir
    
    // Filtreleme butonları için listener eklenebilir
    document.getElementById('btnShowPending').onclick = loadPendingUsers;
    document.getElementById('btnShowAll').onclick = loadAllUsers;
}

// Onay Bekleyenleri Getir
async function loadPendingUsers() {
    usersTableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    const q = query(
        collection(db, "users"), 
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
    );
    
    renderUsersList(q);
}

// Tüm Üyeleri Getir
async function loadAllUsers() {
    usersTableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
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
            
            tr.innerHTML = `
                <td>
                    <div class="user-info">
                        <span class="name">${user.displayName || 'İsimsiz'}</span>
                        <small>${user.email}</small>
                    </div>
                </td>
                <td><span class="badge badge-${user.role}">${user.role}</span></td>
                <td><span class="badge status-${user.status}">${getStatusLabel(user.status)}</span></td>
                <td>${user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : '-'}</td>
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

// Global scope'a fonksiyonları atayalım ki HTML string içinden çağrılabilsin
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
        await updateUserStatus(uid, 'suspended');
    }
};

async function updateUserStatus(uid, status) {
    try {
        await updateDoc(doc(db, "users", uid), { status: status });
        alert(`Kullanıcı durumu güncellendi: ${status}`);
        loadPendingUsers(); // Listeyi yenile
    } catch (error) {
        console.error("Güncelleme hatası:", error);
        alert("İşlem başarısız!");
    }
}