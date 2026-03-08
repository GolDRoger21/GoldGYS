import { db } from "../../firebase-config.js";
import { collection, query, where, onSnapshot, limit } from "../../firestore-metrics.js";

const NOTIFICATION_LIVE_LIMIT = 50;
let notificationsInitialized = false;
let unsubscribeUsers = null;
let unsubscribeReports = null;

export function initNotifications() {
    if (notificationsInitialized) return;
    notificationsInitialized = true;

    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');
    const btn = document.getElementById('notificationBtn');
    const dropdown = document.getElementById('notificationDropdown');

    if (!btn || !dropdown || !badge || !list) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
        document.getElementById('profileDropdown')?.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    const qUsers = query(
        collection(db, "users"),
        where("status", "==", "pending"),
        limit(NOTIFICATION_LIVE_LIMIT)
    );

    const qReports = query(
        collection(db, "reports"),
        where("status", "==", "pending"),
        limit(NOTIFICATION_LIVE_LIMIT)
    );

    let pendingUsers = [];
    let pendingReports = [];

    unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        pendingUsers = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            type: 'user',
            title: 'Yeni Uyelik Talebi',
            desc: `${docSnap.data().displayName || docSnap.data().email} onay bekliyor.`,
            time: docSnap.data().createdAt,
            link: { tab: 'users' }
        }));
        updateUI();
    });

    unsubscribeReports = onSnapshot(qReports, (snapshot) => {
        const reports = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
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

        pendingReports = [...grouped.values()].map((group) => ({
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

    window.addEventListener('beforeunload', () => {
        if (typeof unsubscribeUsers === 'function') unsubscribeUsers();
        if (typeof unsubscribeReports === 'function') unsubscribeReports();
    }, { once: true });

    function updateUI() {
        const allNotifs = [...pendingUsers, ...pendingReports];

        allNotifs.sort((a, b) => {
            const t1 = a.time?.seconds || 0;
            const t2 = b.time?.seconds || 0;
            return t2 - t1;
        });

        const count = allNotifs.length;
        if (count > 0) {
            badge.style.display = 'flex';
            badge.innerText = count > 9 ? '9+' : String(count);
        } else {
            badge.style.display = 'none';
        }

        if (count === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Yeni bildirim yok.</div>';
            return;
        }

        list.innerHTML = '';
        allNotifs.slice(0, 5).forEach((item) => {
            const icon = item.type === 'user' ? 'U' : item.type === 'support' ? 'D' : 'R';
            const timeStr = item.time
                ? new Date(item.time.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : '';

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