import { db } from "../../firebase-config.js";
import { collection, query, where, onSnapshot, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function initNotifications() {
    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');
    const btn = document.getElementById('notificationBtn');
    const dropdown = document.getElementById('notificationDropdown');

    if (!btn || !dropdown) return;

    // Dropdown Toggle
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
        // Diğer dropdownları kapat
        document.getElementById('profileDropdown')?.classList.remove('active');
    });

    // Dışarı tıklama
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // --- CANLI DİNLEME (REAL-TIME) ---

    // 1. Onay Bekleyen Üyeler
    const qUsers = query(collection(db, "users"), where("status", "==", "pending"));

    // 2. Okunmamış Raporlar/Mesajlar
    const qReports = query(collection(db, "reports"), where("status", "==", "pending"));

    let pendingUsers = [];
    let pendingReports = [];

    // Kullanıcıları Dinle
    onSnapshot(qUsers, (snapshot) => {
        pendingUsers = snapshot.docs.map(doc => ({
            id: doc.id,
            type: 'user',
            title: 'Yeni Üyelik Talebi',
            desc: `${doc.data().displayName || doc.data().email} onay bekliyor.`,
            time: doc.data().createdAt,
            link: '#users'
        }));
        updateUI();
    });

    // Raporları Dinle
    onSnapshot(qReports, (snapshot) => {
        pendingReports = snapshot.docs.map(doc => ({
            id: doc.id,
            type: 'report',
            title: `Yeni Destek Talebi: ${doc.data().type}`,
            desc: doc.data().description ? doc.data().description.substring(0, 40) + '...' : 'Detay yok',
            time: doc.data().createdAt,
            link: '#reports'
        }));
        updateUI();
    });

    function updateUI() {
        const allNotifs = [...pendingUsers, ...pendingReports];

        // Tarihe göre sırala (Yeniden eskiye)
        allNotifs.sort((a, b) => {
            const t1 = a.time?.seconds || 0;
            const t2 = b.time?.seconds || 0;
            return t2 - t1;
        });

        // Badge Güncelle
        const count = allNotifs.length;
        if (count > 0) {
            badge.style.display = 'flex';
            badge.innerText = count > 9 ? '9+' : count;
        } else {
            badge.style.display = 'none';
        }

        // Listeyi Güncelle
        if (count === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Yeni bildirim yok.</div>';
            return;
        }

        list.innerHTML = '';
        // Sadece ilk 5 bildirimi göster
        allNotifs.slice(0, 5).forEach(item => {
            const icon = item.type === 'user' ? '👤' : '📩';
            const timeStr = item.time ? new Date(item.time.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

            const div = document.createElement('div');
            div.className = 'notification-item';
            div.onclick = () => {
                window.location.hash = item.link.replace('#', '');
                // Sayfa yenilemeden tab değişimi için manuel tetikleme gerekebilir
                // Şimdilik basit hash değişimi yeterli
                dropdown.classList.remove('active');
            };

            div.innerHTML = `
                <div class="notif-icon">${icon}</div>
                <div class="notif-content">
                    <span class="notif-title">${item.title}</span>
                    <span class="notif-desc">${item.desc}</span>
                    <span class="notif-time">${timeStr}</span>
                </div>
            `;
            list.appendChild(div);
        });
    }
}
