import { db } from "../../firebase-config.js";
import {
    collection,
    collectionGroup,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showConfirm, showToast } from "../../notifications.js";

const state = {
    items: [],
    topicMap: new Map()
};

export function initTrashPage() {
    const searchInput = document.getElementById('trashCenterSearch');
    const typeFilter = document.getElementById('trashCenterTypeFilter');
    const refreshBtn = document.getElementById('trashCenterRefreshBtn');
    const restoreSelectedBtn = document.getElementById('trashCenterRestoreSelected');
    const purgeSelectedBtn = document.getElementById('trashCenterPurgeSelected');
    const selectAll = document.getElementById('trashCenterSelectAll');

    if (searchInput) searchInput.addEventListener('input', renderTrashTable);
    if (typeFilter) typeFilter.addEventListener('change', renderTrashTable);
    if (refreshBtn) refreshBtn.addEventListener('click', loadTrashItems);
    if (restoreSelectedBtn) restoreSelectedBtn.addEventListener('click', restoreSelectedItems);
    if (purgeSelectedBtn) purgeSelectedBtn.addEventListener('click', purgeSelectedItems);
    if (selectAll) selectAll.addEventListener('change', (e) => toggleAll(e.target.checked));

    loadTrashItems();
}

async function loadTrashItems() {
    const tbody = document.getElementById('trashCenterTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center">Yükleniyor...</td></tr>';

    try {
        const topicsSnap = await getDocs(collection(db, "topics"));
        state.topicMap = new Map(
            topicsSnap.docs.map(docSnap => [docSnap.id, docSnap.data().title || '(başlıksız)'])
        );

        const deletedTopicsSnap = await getDocs(query(collection(db, "topics"), where("status", "==", "deleted")));
        const deletedTopics = deletedTopicsSnap.docs.map(docSnap => ({
            id: docSnap.id,
            title: docSnap.data().title || '(başlıksız)',
            type: 'topic',
            topicId: docSnap.id,
            topicTitle: docSnap.data().title || '(başlıksız)'
        }));

        const deletedLessonsSnap = await getDocs(query(collectionGroup(db, "lessons"), where("status", "==", "deleted")));
        const deletedLessons = deletedLessonsSnap.docs.map(docSnap => {
            const data = docSnap.data();
            const topicId = docSnap.ref.parent.parent?.id || '';
            return {
                id: docSnap.id,
                title: data.title || '(başlıksız)',
                type: data.type || 'lesson',
                topicId,
                topicTitle: state.topicMap.get(topicId) || '—'
            };
        });

        state.items = [...deletedTopics, ...deletedLessons];
        renderTrashTable();
    } catch (error) {
        console.error("Çöp kutusu yüklenirken hata:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-danger">Hata: ${error.message}</td></tr>`;
    }
}

function renderTrashTable() {
    const tbody = document.getElementById('trashCenterTableBody');
    const search = document.getElementById('trashCenterSearch')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('trashCenterTypeFilter')?.value || 'all';
    const selectAll = document.getElementById('trashCenterSelectAll');
    if (selectAll) selectAll.checked = false;

    if (!tbody) return;

    const filtered = state.items.filter(item => {
        const matchesType = typeFilter === 'all' || item.type === typeFilter;
        const combinedText = `${item.title} ${item.topicTitle}`.toLowerCase();
        return matchesType && combinedText.includes(search);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-muted">Çöp kutusu boş.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td><input type="checkbox" class="trash-checkbox" data-id="${item.id}" data-type="${item.type}" data-topic="${item.topicId}"></td>
            <td><strong>${item.title}</strong></td>
            <td>${item.topicTitle || '—'}</td>
            <td><span class="badge bg-light text-dark border">${item.type === 'topic' ? 'Konu' : (item.type === 'test' ? 'Test' : 'Ders')}</span></td>
            <td class="text-end">
                <button class="btn btn-success btn-sm" onclick="window.AdminTrash.restoreOne('${item.id}','${item.type}','${item.topicId}')">Geri Al</button>
                <button class="btn btn-danger btn-sm" onclick="window.AdminTrash.purgeOne('${item.id}','${item.type}','${item.topicId}')">Kalıcı Sil</button>
            </td>
        </tr>
    `).join('');
}

function getSelectedItems() {
    return Array.from(document.querySelectorAll('.trash-checkbox:checked')).map(input => ({
        id: input.dataset.id,
        type: input.dataset.type,
        topicId: input.dataset.topic
    }));
}

function toggleAll(checked) {
    document.querySelectorAll('.trash-checkbox').forEach(input => {
        input.checked = checked;
    });
}

async function restoreOne(id, type, topicId) {
    if (type === 'topic') {
        await updateDoc(doc(db, "topics", id), { status: 'active', isActive: true, deletedAt: null });
    } else {
        await updateDoc(doc(db, `topics/${topicId}/lessons`, id), { status: 'active', isActive: true, deletedAt: null });
    }
    loadTrashItems();
}

async function purgeOne(id, type, topicId) {
    const shouldDelete = await showConfirm("Bu kayıt kalıcı olarak silinecek. Devam etmek istiyor musunuz?", {
        title: "Kalıcı Silme",
        confirmText: "Sil",
        cancelText: "Vazgeç",
        tone: "error"
    });
    if (!shouldDelete) return;
    if (type === 'topic') {
        await deleteDoc(doc(db, "topics", id));
    } else {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, id));
    }
    loadTrashItems();
}

async function restoreSelectedItems() {
    const items = getSelectedItems();
    if (items.length === 0) return;
    await Promise.all(items.map(item => {
        if (item.type === 'topic') {
            return updateDoc(doc(db, "topics", item.id), { status: 'active', isActive: true, deletedAt: null });
        }
        return updateDoc(doc(db, `topics/${item.topicId}/lessons`, item.id), { status: 'active', isActive: true, deletedAt: null });
    }));
    showToast("Seçilen içerikler geri alındı.", "success");
    loadTrashItems();
}

async function purgeSelectedItems() {
    const items = getSelectedItems();
    if (items.length === 0) return;
    const shouldDelete = await showConfirm("Seçilen kayıtlar kalıcı olarak silinecek. Devam etmek istiyor musunuz?", {
        title: "Kalıcı Silme",
        confirmText: "Sil",
        cancelText: "Vazgeç",
        tone: "error"
    });
    if (!shouldDelete) return;
    await Promise.all(items.map(item => {
        if (item.type === 'topic') {
            return deleteDoc(doc(db, "topics", item.id));
        }
        return deleteDoc(doc(db, `topics/${item.topicId}/lessons`, item.id));
    }));
    showToast("Seçilen kayıtlar silindi.", "success");
    loadTrashItems();
}

window.AdminTrash = {
    restoreOne,
    purgeOne
};
