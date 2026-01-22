import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import {
    collection,
    query,
    orderBy,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let listContainer = null;
let reportsState = {
    reports: [],
    groups: [],
    usersMap: {},
    questionsMap: {},
    selectedGroups: new Set(),
    sort: 'latest'
};

export async function initReportsPage() {
    console.log("Raporlar yükleniyor...");
    listContainer = document.getElementById('reportsList');
    if (!listContainer) return;

    listContainer.innerHTML = '<p>Yükleniyor...</p>';

    try {
        const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = '<div class="alert alert-info">Henüz bekleyen bildirim yok.</div>';
            return;
        }

        reportsState.reports = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        reportsState.selectedGroups = new Set();
        await renderReports();
    } catch (error) {
        console.error("Rapor hatası:", error);
        listContainer.innerHTML = `<p class="error">Hata: ${error.message}</p>`;
    }
}

async function renderReports() {
    const groupsMap = new Map();
    const questionIds = new Set();
    const userIds = new Set();

    reportsState.reports.forEach((report) => {
        if (report.questionId) {
            questionIds.add(report.questionId);
        }
        if (report.userId) {
            userIds.add(report.userId);
        }

        const groupKey = report.questionId ? `question:${report.questionId}` : `report:${report.id}`;
        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
                key: groupKey,
                questionId: report.questionId || null,
                reports: [],
                latestAt: 0,
                statusCounts: { pending: 0, resolved: 0, archived: 0 }
            });
        }
        const group = groupsMap.get(groupKey);
        group.reports.push(report);
        const createdAtSec = report.createdAt?.seconds || 0;
        if (createdAtSec > group.latestAt) group.latestAt = createdAtSec;
        const status = report.status || 'pending';
        group.statusCounts[status] = (group.statusCounts[status] || 0) + 1;
    });

    reportsState.usersMap = await fetchUsersMap([...userIds]);
    reportsState.questionsMap = await fetchQuestionsMap([...questionIds]);

    reportsState.groups = [...groupsMap.values()].map(group => {
        const uniqueUsers = new Map();
        group.reports.forEach(report => {
            const userInfo = resolveUserInfo(report, reportsState.usersMap);
            if (userInfo) {
                uniqueUsers.set(userInfo.uid, userInfo);
            }
        });
        return {
            ...group,
            uniqueUsers: [...uniqueUsers.values()]
        };
    });

    listContainer.innerHTML = `
        <div class="reports-toolbar">
            <div class="reports-toolbar-left">
                <label class="reports-checkbox">
                    <input type="checkbox" id="reportsSelectAll">
                    <span>Tümünü Seç</span>
                </label>
                <div class="reports-bulk-actions">
                    <button id="bulkResolve" class="btn btn-sm btn-success" disabled>✅ Hata Yok</button>
                    <button id="bulkArchive" class="btn btn-sm btn-secondary" disabled>📦 Arşivle</button>
                    <button id="bulkDelete" class="btn btn-sm btn-danger" disabled>🗑️ Sil</button>
                </div>
            </div>
            <div class="reports-toolbar-right">
                <span id="reportsSelectionCount" class="text-muted">Seçili: 0</span>
                <select id="reportsSort" class="form-select reports-sort">
                    <option value="latest">Son Bildirim Tarihi</option>
                    <option value="most">En Çok Bildirilen</option>
                    <option value="oldest">En Eski Bildirim</option>
                </select>
            </div>
        </div>
        <div id="reportsGroups" class="reports-grid"></div>
    `;

    const sortSelect = document.getElementById('reportsSort');
    if (sortSelect) {
        sortSelect.value = reportsState.sort;
        sortSelect.addEventListener('change', () => {
            reportsState.sort = sortSelect.value;
            renderReportGroups();
        });
    }

    const selectAll = document.getElementById('reportsSelectAll');
    if (selectAll) {
        selectAll.addEventListener('change', () => {
            const groupChecks = document.querySelectorAll('.report-group-select');
            reportsState.selectedGroups.clear();
            groupChecks.forEach((checkbox) => {
                checkbox.checked = selectAll.checked;
                if (selectAll.checked) {
                    reportsState.selectedGroups.add(checkbox.dataset.groupKey);
                }
            });
            updateBulkUI();
        });
    }

    const bulkResolve = document.getElementById('bulkResolve');
    const bulkArchive = document.getElementById('bulkArchive');
    const bulkDelete = document.getElementById('bulkDelete');

    if (bulkResolve) bulkResolve.addEventListener('click', () => applyBulkAction('resolved'));
    if (bulkArchive) bulkArchive.addEventListener('click', () => applyBulkAction('archived'));
    if (bulkDelete) bulkDelete.addEventListener('click', () => applyBulkAction('delete'));

    renderReportGroups();
}

function renderReportGroups() {
    const groupsContainer = document.getElementById('reportsGroups');
    if (!groupsContainer) return;

    const groups = sortGroups([...reportsState.groups], reportsState.sort);
    const focusParams = getReportFocusParams();

    groupsContainer.innerHTML = groups.map((group) => {
        const questionInfo = group.questionId ? reportsState.questionsMap[group.questionId] : null;
        const title = group.questionId ? 'Soru Bildirimi' : formatSupportTitle(group.reports[0]);
        const dateLabel = group.latestAt
            ? new Date(group.latestAt * 1000).toLocaleDateString('tr-TR')
            : '-';
        const pendingCount = group.statusCounts.pending || 0;
        const resolvedCount = group.statusCounts.resolved || 0;
        const archivedCount = group.statusCounts.archived || 0;
        const statusBadges = [
            pendingCount ? `<span class="badge badge-warning">Bekliyor: ${pendingCount}</span>` : '',
            resolvedCount ? `<span class="badge badge-success">Çözüldü: ${resolvedCount}</span>` : '',
            archivedCount ? `<span class="badge badge-secondary">Arşiv: ${archivedCount}</span>` : ''
        ].filter(Boolean).join('');

        const uniqueUserCount = group.uniqueUsers.length;
        const userChips = buildUserChips(group.uniqueUsers);
        const questionMeta = group.questionId
            ? `<span class="report-meta-item">Soru ID: <strong>${group.questionId}</strong></span>`
            : '';

        const questionPreview = group.questionId ? buildQuestionPreview(questionInfo) : '';
        const reportItems = group.reports.map((report) => buildReportItem(report, reportsState.usersMap)).join('');
        const detailsLabel = group.reports.length > 1
            ? `Bildirim Detayları (${group.reports.length})`
            : 'Bildirim Detayı';

        const groupId = group.questionId ? `report-group-${group.questionId}` : `report-group-${group.reports[0].id}`;
        const isFocused = focusParams.questionId && group.questionId === focusParams.questionId;

        return `
            <div class="report-group card ${isFocused ? 'highlight' : ''}" id="${groupId}">
                <div class="report-group-header">
                    <div class="report-group-check">
                        <input type="checkbox" class="report-group-select" data-group-key="${group.key}">
                    </div>
                    <div class="report-group-main">
                        <div class="report-group-title">
                            <h4>${title}</h4>
                            <div class="report-badges">${statusBadges}</div>
                        </div>
                        <div class="report-meta">
                            <span class="report-meta-item">Son Bildirim: <strong>${dateLabel}</strong></span>
                            <span class="report-meta-item">Toplam Bildirim: <strong>${group.reports.length}</strong></span>
                            <span class="report-meta-item">Bildirimci: <strong>${uniqueUserCount}</strong></span>
                            ${questionMeta}
                        </div>
                        <div class="report-users">${userChips}</div>
                    </div>
                    <div class="report-group-actions">
                        ${group.questionId ? `<button class="btn btn-sm btn-primary" onclick="window.AdminReports.editQuestion('${group.questionId}')">Soruyu Düzenle</button>` : ''}
                    </div>
                </div>
                <div class="report-group-body">
                    ${questionPreview}
                    <details class="report-details">
                        <summary>${detailsLabel}</summary>
                        <div class="report-items">${reportItems}</div>
                    </details>
                </div>
            </div>
        `;
    }).join('');

    const groupChecks = document.querySelectorAll('.report-group-select');
    groupChecks.forEach((checkbox) => {
        checkbox.checked = reportsState.selectedGroups.has(checkbox.dataset.groupKey);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                reportsState.selectedGroups.add(checkbox.dataset.groupKey);
            } else {
                reportsState.selectedGroups.delete(checkbox.dataset.groupKey);
            }
            updateSelectAllState();
            updateBulkUI();
        });
    });

    updateSelectAllState();
    updateBulkUI();
    scrollToFocusedReport(focusParams);
}

async function fetchQuestionsMap(questionIds) {
    const entries = await Promise.all(questionIds.map(async (id) => ({
        id,
        info: await fetchQuestionInfo(id)
    })));
    return entries.reduce((acc, item) => {
        if (item.info) acc[item.id] = item.info;
        return acc;
    }, {});
}

async function fetchUsersMap(userIds) {
    const entries = await Promise.all(userIds.map(async (uid) => {
        try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                return { uid, ...snap.data() };
            }
        } catch (error) {
            console.warn("Kullanıcı bilgisi alınamadı:", error);
        }
        return null;
    }));
    return entries.filter(Boolean).reduce((acc, user) => {
        acc[user.uid] = user;
        return acc;
    }, {});
}

async function fetchQuestionInfo(questionId) {
    try {
        const questionSnap = await getDoc(doc(db, "questions", questionId));
        if (questionSnap.exists()) {
            return { id: questionSnap.id, ...questionSnap.data() };
        }
    } catch (error) {
        console.warn("Soru bilgisi alınamadı:", error);
    }
    return null;
}

function buildReportItem(report, usersMap) {
    const date = report.createdAt ? new Date(report.createdAt.seconds * 1000).toLocaleString('tr-TR') : '-';
    const statusLabel = formatStatusLabel(report.status || 'pending');
    const statusBadge = `<span class="badge badge-${report.status === 'archived' ? 'secondary' : report.status === 'resolved' ? 'success' : 'warning'}">${statusLabel}</span>`;
    const userInfo = resolveUserInfo(report, usersMap);
    const userName = userInfo?.displayName || userInfo?.name || report.userName || deriveNameFromEmail(report.userEmail) || 'Anonim';
    const userEmail = userInfo?.email || report.userEmail || '-';
    const userId = userInfo?.uid || report.userId || '';

    return `
        <div class="report-item" id="report-item-${report.id}">
            <div class="report-item-header">
                <div>
                    <div class="report-item-user">
                        <strong>${userName}</strong>
                        <span class="text-muted">${userEmail}</span>
                        ${userId ? `<span class="text-muted">(${userId})</span>` : ''}
                    </div>
                    <div class="report-item-meta">
                        <span>${date}</span>
                        ${statusBadge}
                    </div>
                </div>
                <div class="report-item-actions">
                    <button class="btn btn-sm btn-success" onclick="window.AdminReports.resolve('${report.id}')">✅ Hata Yok</button>
                    <button class="btn btn-sm btn-secondary" onclick="window.AdminReports.archive('${report.id}')">📦 Arşivle</button>
                    <button class="btn btn-sm btn-danger" onclick="window.AdminReports.delete('${report.id}')">🗑️ Sil</button>
                    ${userId ? `<button class="btn btn-sm btn-secondary" onclick="window.AdminReports.viewUser('${userId}')">Kullanıcıyı Gör</button>` : ''}
                </div>
            </div>
            <div class="report-item-desc">${report.description || 'Açıklama yok'}</div>
        </div>
    `;
}

function buildUserChips(users) {
    if (!users || users.length === 0) {
        return '<span class="text-muted">Bildirim yapan kullanıcı bulunamadı.</span>';
    }

    const max = 6;
    const visible = users.slice(0, max);
    const remaining = users.length - max;

    const chips = visible.map(user => {
        const name = user.displayName || user.name || deriveNameFromEmail(user.email) || 'Kullanıcı';
        const initials = name
            .split(' ')
            .map(part => part[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase();
        return `
            <div class="user-chip" title="${name}">
                <span class="user-initials">${initials}</span>
                <span class="user-name">${name}</span>
            </div>
        `;
    }).join('');

    const overflow = remaining > 0
        ? `<span class="user-overflow">+${remaining} kişi</span>`
        : '';

    return `${chips}${overflow}`;
}

function resolveUserInfo(report, usersMap) {
    if (report.userId && usersMap[report.userId]) {
        return { uid: report.userId, ...usersMap[report.userId] };
    }
    if (report.userEmail) {
        return { uid: report.userId || '', email: report.userEmail, displayName: report.userName };
    }
    return null;
}

function deriveNameFromEmail(email) {
    if (!email) return '';
    return email.split('@')[0].replace(/[._-]/g, ' ').trim();
}

function formatSupportTitle(report) {
    if (report?.source === 'help_page') {
        return report?.type ? `Destek Talebi: ${report.type}` : 'Destek Talebi';
    }
    return 'Genel Bildirim';
}

function formatStatusLabel(status) {
    const labels = {
        pending: 'Bekliyor',
        resolved: 'Çözüldü',
        archived: 'Arşivlendi'
    };
    return labels[status] || status;
}

function buildQuestionPreview(questionInfo) {
    if (!questionInfo) {
        return `
        <div class="question-preview missing">
            <strong>⚠️ Soru bulunamadı.</strong> Bu sorunun silinmiş veya taşınmış olması mümkün.
        </div>`;
    }

    const options = (questionInfo.options || [])
        .map((opt) => `
            <li class="question-option">
                <span class="option-key">${opt.id}</span>
                <span class="option-text">${opt.text}</span>
            </li>
        `)
        .join('');

    const correctLabel = questionInfo.correctOption
        ? `<span class="badge badge-success">Doğru: ${questionInfo.correctOption}</span>`
        : '';

    const category = questionInfo.category
        ? `<span class="question-chip">${questionInfo.category}</span>`
        : '';

    return `
        <div class="question-preview">
            <div class="question-preview-header">
                <div>
                    <strong>🧩 Soru Önizleme</strong>
                    <div class="question-preview-meta">${category}</div>
                </div>
                ${correctLabel}
            </div>
            <div class="question-preview-body">
                <p>${questionInfo.text || 'Soru metni bulunamadı.'}</p>
                ${options ? `<ul class="question-options">${options}</ul>` : '<div class="text-sm text-muted">Şık bilgisi yok.</div>'}
            </div>
        </div>`;
}

function sortGroups(groups, sort) {
    if (sort === 'most') {
        return groups.sort((a, b) => b.reports.length - a.reports.length);
    }
    if (sort === 'oldest') {
        return groups.sort((a, b) => a.latestAt - b.latestAt);
    }
    return groups.sort((a, b) => b.latestAt - a.latestAt);
}

function updateSelectAllState() {
    const selectAll = document.getElementById('reportsSelectAll');
    const groupChecks = document.querySelectorAll('.report-group-select');
    if (!selectAll || groupChecks.length === 0) return;

    const allChecked = [...groupChecks].every((checkbox) => checkbox.checked);
    const anyChecked = [...groupChecks].some((checkbox) => checkbox.checked);

    selectAll.checked = allChecked;
    selectAll.indeterminate = !allChecked && anyChecked;
}

function updateBulkUI() {
    const selectedCount = reportsState.selectedGroups.size;
    const totalGroups = reportsState.groups.length;
    const selectionLabel = document.getElementById('reportsSelectionCount');
    if (selectionLabel) {
        selectionLabel.textContent = `Seçili: ${selectedCount} / ${totalGroups}`;
    }

    ['bulkResolve', 'bulkArchive', 'bulkDelete'].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = selectedCount === 0;
    });
}

async function applyBulkAction(action) {
    const selectedKeys = [...reportsState.selectedGroups];
    if (selectedKeys.length === 0) return;

    const actionLabel = action === 'delete' ? 'sil' : action === 'archived' ? 'arşivle' : 'çözüldü olarak işaretle';
    const shouldApply = await showConfirm(`Seçili bildirimleri ${actionLabel}mek istiyor musunuz?`, {
        title: "Toplu İşlem",
        confirmText: "Uygula",
        cancelText: "Vazgeç"
    });
    if (!shouldApply) return;

    const batch = writeBatch(db);
    selectedKeys.forEach((key) => {
        const group = reportsState.groups.find(item => item.key === key);
        if (!group) return;
        group.reports.forEach((report) => {
            const ref = doc(db, "reports", report.id);
            if (action === 'delete') {
                batch.delete(ref);
            } else {
                batch.update(ref, { status: action });
            }
        });
    });

    try {
        await batch.commit();
        reportsState.selectedGroups.clear();
        await initReportsPage();
    } catch (error) {
        showToast("Toplu işlem başarısız oldu. Lütfen tekrar deneyin.", "error");
        console.error("Toplu işlem hatası:", error);
    }
}

function getReportFocusParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        questionId: params.get('reportQuestionId'),
        reportId: params.get('reportId')
    };
}

function highlightReportItem(reportId) {
    if (!reportId) return;
    const target = document.getElementById(`report-item-${reportId}`);
    if (target) {
        const details = target.closest('details');
        if (details) details.open = true;
        target.classList.add('highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => target.classList.remove('highlight'), 3500);
    }
}

function highlightReportGroup(questionId) {
    if (!questionId) return;
    const target = document.getElementById(`report-group-${questionId}`);
    if (target) {
        target.classList.add('highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => target.classList.remove('highlight'), 3500);
    }
}

function scrollToFocusedReport(focusParams) {
    if (focusParams.questionId) {
        highlightReportGroup(focusParams.questionId);
    }
    if (focusParams.reportId) {
        highlightReportItem(focusParams.reportId);
    }
    if (focusParams.questionId || focusParams.reportId) {
        clearReportFocusParams();
    }
}

function clearReportFocusParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete('reportQuestionId');
    url.searchParams.delete('reportId');
    window.history.replaceState({}, '', url);
}

// Global Actions
export const AdminReports = {
    archive: async (id) => {
        const shouldArchive = await showConfirm("Bu bildirimi arşivlemek istiyor musunuz?", {
            title: "Bildirimi Arşivle",
            confirmText: "Arşivle",
            cancelText: "Vazgeç"
        });
        if (!shouldArchive) return;
        await updateReportStatus(id, 'archived');
    },
    resolve: async (id) => {
        const shouldResolve = await showConfirm("Bu bildirimi çözüldü olarak işaretlemek istiyor musunuz?", {
            title: "Bildirimi Güncelle",
            confirmText: "İşaretle",
            cancelText: "Vazgeç"
        });
        if (!shouldResolve) return;
        await updateReportStatus(id, 'resolved');
    },
    editQuestion: async (questionId) => {
        if (!questionId) {
            showToast("Bu bildirime bağlı soru bulunamadı.", "info");
            return;
        }
        if (typeof window.openQuestionEditor !== 'function') {
            showToast("Soru düzenleyici yüklenemedi.", "error");
            return;
        }
        window.openQuestionEditor(questionId);
    },
    delete: async (id) => {
        const shouldDelete = await showConfirm("Bu bildirimi kalıcı olarak silmek istiyor musunuz?", {
            title: "Kalıcı Sil",
            confirmText: "Sil",
            cancelText: "Vazgeç",
            tone: "error"
        });
        if (!shouldDelete) return;
        try {
            await deleteDoc(doc(db, "reports", id));
            await initReportsPage();
            showToast("Bildirim silindi.", "success");
        } catch (e) {
            showToast("Silme işlemi başarısız oldu.", "error");
        }
    },
    viewUser: async (uid) => {
        if (!uid) return;
        sessionStorage.setItem('adminUserFocus', uid);
        window.location.hash = 'users';
    }
};

async function updateReportStatus(id, status) {
    try {
        await updateDoc(doc(db, "reports", id), { status: status });
        await initReportsPage();
    } catch (e) {
        showToast("İşlem başarısız oldu. Lütfen tekrar deneyin.", "error");
    }
}
