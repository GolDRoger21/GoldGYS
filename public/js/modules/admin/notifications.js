import { db } from "../../firebase-config.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function initNotifications() {
    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');
    const btn = document.getElementById('notificationBtn');
    const dropdown = document.getElementById('notificationDropdown');

    if (!btn || !dropdown || !badge || !list) return;

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
            link: { tab: 'users' }
        }));
        updateUI();
    });

    // Raporları Dinle
    onSnapshot(qReports, (snapshot) => {
        const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const grouped = new Map();

        reports.forEach((report) => {
            const key = report.questionId ? `question:${report.questionId}` : `report:${report.id}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    id: key,
                    questionId: report.questionId || null,
                    reportIds: [],
                    count: 0,
                    time: report.createdAt,
                    type: report.source === 'help_page' ? 'support' : 'report'
                });
            }
            const group = grouped.get(key);
            group.reportIds.push(report.id);
            group.count += 1;
            if ((report.createdAt?.seconds || 0) > (group.time?.seconds || 0)) {
                group.time = report.createdAt;
            }
        });

        pendingReports = [...grouped.values()].map(group => ({
            id: group.id,
            type: group.type,
            title: group.questionId ? 'Soru Bildirimi' : 'Yeni Destek Talebi',
            desc: group.questionId ? `${group.count} bildirim` : `${group.count} yeni mesaj`,
            time: group.time,
            link: group.questionId
                ? { tab: 'reports', questionId: group.questionId }
                : { tab: 'reports', reportId: group.reportIds[0] }
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
            const icon = item.type === 'user' ? '👤' : item.type === 'support' ? '📩' : '🚩';
            const timeStr = item.time ? new Date(item.time.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

            const div = document.createElement('div');
            div.className = 'notification-item';
            div.onclick = () => {
                if (item.link?.tab) {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('reportQuestionId');
                    url.searchParams.delete('reportId');
                    if (item.link.questionId) {
                        url.searchParams.set('reportQuestionId', item.link.questionId);
                    }
                    if (item.link.reportId) {
                        url.searchParams.set('reportId', item.link.reportId);
                    }
                    window.history.replaceState({}, '', url.toString());
                    window.location.hash = item.link.tab;
                }
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
