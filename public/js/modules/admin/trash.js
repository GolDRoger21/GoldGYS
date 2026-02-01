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
    isInitialized: false,
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

    if (!state.isInitialized) {
        if (searchInput) searchInput.addEventListener('input', renderTrashTable);
        if (typeFilter) typeFilter.addEventListener('change', renderTrashTable);
        if (refreshBtn) refreshBtn.addEventListener('click', loadTrashItems);
        if (restoreSelectedBtn) restoreSelectedBtn.addEventListener('click', restoreSelectedItems);
        if (purgeSelectedBtn) purgeSelectedBtn.addEventListener('click', purgeSelectedItems);
        if (selectAll) selectAll.addEventListener('change', (e) => toggleAll(e.target.checked));
        state.isInitialized = true;
    }

    loadTrashItems();
}

async function loadTrashItems() {
    const tbody = document.getElementById('trashCenterTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center">Yükleniyor...</td></tr>';

    try {
        const topicsSnap = await getDocs(collection(db, "topics"));
        state.topicMap = new Map();
        topicsSnap.forEach(docSnap => {
            // Sadece aktif ve silinmemiş (veya silinmiş ama henüz purge edilmemiş) konuları haritaya ekle
            // Ancak topicsSnap tüm topics koleksiyonunu çekiyor.
            // Biz sadece "var olan" (database'den silinmemiş) konuları bilmek istiyoruz.
            state.topicMap.set(docSnap.id, docSnap.data().title || '(başlıksız)');
        });

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
            const parentTitle = state.topicMap.get(topicId);

            return {
                id: docSnap.id,
                title: data.title || '(başlıksız)',
                type: data.type || 'lesson',
                topicId,
                topicTitle: parentTitle || '(Silinmiş Konu)',
                isOrphan: !parentTitle // Ebeveyn konu yoksa yetimdir
            };
        });

        const deletedQuestionsSnap = await getDocs(query(collection(db, "questions"), where("isDeleted", "==", true)));
        const deletedQuestions = deletedQuestionsSnap.docs.map(docSnap => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                title: data.text || '(başlıksız)',
                type: 'question',
                topicId: '',
                topicTitle: data.category || 'Soru Bankası',
                isOrphan: false
            };
        });

        state.items = [...deletedTopics, ...deletedLessons, ...deletedQuestions];
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

    tbody.innerHTML = filtered.map(item => {
        const isOrphan = item.type !== 'topic' && item.type !== 'question' && item.isOrphan;
        const rowClass = isOrphan ? 'table-warning' : '';
        const restoreBtnState = isOrphan ? 'disabled title="Konusu silindiği için geri alınamaz"' : '';

        // Badge ve Etiket Seçimi
        let typeBadgeClass = 'badge-secondary';
        let typeLabel = 'İçerik';

        switch (item.type) {
            case 'topic':
                typeBadgeClass = 'badge-admin'; // Gold
                typeLabel = 'Konu';
                break;
            case 'lesson':
                typeBadgeClass = 'badge-student'; // Gray/Blue
                typeLabel = 'Ders';
                break;
            case 'test':
                typeBadgeClass = 'badge-warning'; // Orange
                typeLabel = 'Test';
                break;
            case 'question':
                typeBadgeClass = 'badge-editor'; // Blue
                typeLabel = 'Soru';
                break;
        }

        return `
        <tr class="${rowClass}">
            <td><input type="checkbox" class="trash-checkbox" data-id="${item.id}" data-type="${item.type}" data-topic="${item.topicId}"></td>
            <td>
                <strong>${item.title}</strong>
                ${isOrphan ? '<br><small class="text-danger">⚠️ Konusu Bulunamadı</small>' : ''}
            </td>
            <td>${item.topicTitle || '—'}</td>
            <td class="text-center"><span class="badge ${typeBadgeClass}">${typeLabel}</span></td>
            <td class="text-end">
                <div class="d-flex align-items-center justify-content-end gap-2">
                    <button class="btn btn-success btn-sm" onclick="window.AdminTrash.restoreOne('${item.id}','${item.type}','${item.topicId}')" ${restoreBtnState}>
                        <i class="fs-6">↺</i> Geri Al
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.AdminTrash.purgeOne('${item.id}','${item.type}','${item.topicId}')">
                        <i class="fs-6">🗑️</i> Kalıcı Sil
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
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
    if (type !== 'topic' && type !== 'question') {
        // Kontrol: Konu var mı?
        if (!state.topicMap.has(topicId)) {
            showToast("Bu içeriğin bağlı olduğu konu kalıcı olarak silinmiş. Geri alınamaz.", "error");
            return;
        }
    }

    if (type === 'topic') {
        await updateDoc(doc(db, "topics", id), { status: 'active', isActive: true, deletedAt: null });
    } else if (type === 'question') {
        await updateDoc(doc(db, "questions", id), { isDeleted: false, isActive: true, deletedAt: null });
    } else {
        await updateDoc(doc(db, `topics/${topicId}/lessons`, id), { status: 'active', isActive: true, deletedAt: null });
    }
    showToast("İçerik geri alındı.", "success");
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
        // Önce alt içerikleri sil
        try {
            const lessonsSnap = await getDocs(collection(db, `topics/${id}/lessons`));
            const deletePromises = lessonsSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletePromises);
            await deleteDoc(doc(db, "topics", id));
        } catch (e) {
            console.error("Konu silinirken hata:", e);
            showToast("Silme işlemi sırasında hata oluştu.", "error");
            return;
        }
    } else if (type === 'question') {
        await deleteDoc(doc(db, "questions", id));
    } else {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, id));
    }
    showToast("Kayıt kalıcı olarak silindi.", "success");
    loadTrashItems();
}

async function restoreSelectedItems() {
    const items = getSelectedItems();
    if (items.length === 0) return;

    let successCount = 0;
    let failCount = 0;

    await Promise.all(items.map(async (item) => {
        if (item.type !== 'topic' && item.type !== 'question' && !state.topicMap.has(item.topicId)) {
            failCount++;
            return; // Atla
        }

        if (item.type === 'topic') {
            await updateDoc(doc(db, "topics", item.id), { status: 'active', isActive: true, deletedAt: null });
        } else if (item.type === 'question') {
            await updateDoc(doc(db, "questions", item.id), { isDeleted: false, isActive: true, deletedAt: null });
        } else {
            await updateDoc(doc(db, `topics/${item.topicId}/lessons`, item.id), { status: 'active', isActive: true, deletedAt: null });
        }
        successCount++;
    }));

    if (failCount > 0) {
        showToast(`${successCount} kayıt geri alındı. ${failCount} kayıt yapısal sorun nedeniyle kurtarılamadı.`, "warning");
    } else {
        showToast("Seçilen içerikler geri alındı.", "success");
    }
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

    await Promise.all(items.map(async (item) => {
        if (item.type === 'topic') {
            // Konu silinirken alt dersleri de sil
            const lessonsSnap = await getDocs(collection(db, `topics/${item.id}/lessons`));
            const deletePromises = lessonsSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletePromises);
            return deleteDoc(doc(db, "topics", item.id));
        }
        if (item.type === 'question') {
            return deleteDoc(doc(db, "questions", item.id));
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
