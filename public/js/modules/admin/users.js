import { db } from "../../firebase-config.js";
import { collection, query, where, getDocs, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let usersTableBody = null; // Global değil, init içinde seçilecek

export async function initUsersPage() {
    console.log("Üye yönetimi yükleniyor...");
    
    // 1. Önce Arayüzü Oluştur (Butonlar HTML'de yoksa ekle)
    renderUsersInterface();

    // 2. Elementi Seç
    usersTableBody = document.getElementById('usersTableBody');
    
    // 3. Veriyi Yükle
    await loadPendingUsers(); 
}

function renderUsersInterface() {
    const container = document.querySelector('#section-users .card');
    if(!container) return;

    // Arayüzü güncelle
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

    // Listenerları şimdi ekle (Elementler artık var)
    document.getElementById('btnShowPending').addEventListener('click', loadPendingUsers);
    document.getElementById('btnShowAll').addEventListener('click', loadAllUsers);
}

// ... (loadPendingUsers, loadAllUsers ve diğer fonksiyonlar aynı kalabilir) ...
// Mevcut dosyadaki diğer fonksiyonları buraya yapıştırın veya koruyun.

// AŞAĞIDAKİLERİ MEVCUT DOSYADAN KOPYALAYIP EKLEYİN:
async function loadPendingUsers() {
    if(!usersTableBody) return;
    usersTableBody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    const q = query(collection(db, "users"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
    renderUsersList(q);
}

async function loadAllUsers() {
    if(!usersTableBody) return;
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
                <td><div><span class="name">${user.displayName || 'İsimsiz'}</span><br><small>${user.email}</small></div></td>
                <td><span class="badge badge-${user.role}">${user.role}</span></td>
                <td><span class="badge status-${user.status}">${user.status}</span></td>
                <td>${user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : '-'}</td>
                <td>${getActionButtons(user.uid, user.status)}</td>
            `;
            usersTableBody.appendChild(tr);
        });
    } catch (error) {
        console.error(error);
        usersTableBody.innerHTML = `<tr><td colspan="5" class="error">Hata: ${error.message}</td></tr>`;
    }
}

function getActionButtons(uid, status) {
    if (status === 'pending') return `<button class="btn-sm btn-success" onclick="window.AdminUsers.approveUser('${uid}')">Onayla</button> <button class="btn-sm btn-danger" onclick="window.AdminUsers.rejectUser('${uid}')">Reddet</button>`;
    if (status === 'active') return `<button class="btn-sm btn-warning" onclick="window.AdminUsers.suspendUser('${uid}')">Askıya Al</button>`;
    return '';
}

window.AdminUsers = {
    approveUser: async (uid) => { if(confirm('Onaylansın mı?')) await updateUserStatus(uid, 'active'); },
    rejectUser: async (uid) => { if(confirm('Reddedilsin mi?')) await updateUserStatus(uid, 'rejected'); },
    suspendUser: async (uid) => { await updateUserStatus(uid, 'suspended'); }
};

async function updateUserStatus(uid, status) {
    try { await updateDoc(doc(db, "users", uid), { status }); alert(`Durum güncellendi: ${status}`); loadPendingUsers(); } 
    catch (e) { alert("Hata!"); }
}