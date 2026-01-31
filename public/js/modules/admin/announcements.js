import { db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function initAnnouncementsPage() {
    renderInterface();
    loadExamAnnouncements();
    loadAnnouncements();
}

function renderInterface() {
    const container = document.getElementById('section-announcements');
    if (!container) return;

    container.innerHTML = `
        <div class="announcement-grid">
            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>🗓️ Sınav İlanı</h3>
                        <p class="text-muted">Aktif sınav ilanını buradan yönetin.</p>
                    </div>
                </div>
                <form id="examAnnouncementForm" class="form-stack">
                    <div class="form-row">
                        <label class="form-label">Sınav Başlığı</label>
                        <input type="text" id="examTitle" class="form-control" placeholder="Örn: 2026 Yazı İşleri Müdürü Sınavı" required>
                    </div>
                    <div class="form-row">
                        <label class="form-label">Açıklama</label>
                        <textarea id="examDescription" class="form-control" rows="3" placeholder="Sınav ilanına dair kısa açıklama..."></textarea>
                    </div>
                    <div class="form-row two-col">
                        <div>
                            <label class="form-label">Sınav Tarihi</label>
                            <input type="datetime-local" id="examDate" class="form-control" required>
                        </div>
                        <div>
                            <label class="form-label">Konum</label>
                            <input type="text" id="examLocation" class="form-control" placeholder="Örn: Ankara">
                        </div>
                    </div>
                    <div class="form-row two-col">
                        <div>
                            <label class="form-label">Başvuru Başlangıcı</label>
                            <input type="date" id="examApplyStart" class="form-control">
                        </div>
                        <div>
                            <label class="form-label">Başvuru Bitişi</label>
                            <input type="date" id="examApplyEnd" class="form-control">
                        </div>
                    </div>
                    <div class="form-row">
                        <label class="form-label">Başvuru Linki</label>
                        <input type="url" id="examApplicationLink" class="form-control" placeholder="https://...">
                    </div>
                    <label class="form-check">
                        <input type="checkbox" id="examIsActive" checked>
                        <span>Aktif sınav ilanı olarak yayınla</span>
                    </label>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">💾 Sınav İlanını Kaydet</button>
                    </div>
                </form>
            </div>

            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>📢 Duyuru Oluştur</h3>
                        <p class="text-muted">Duyuruları kullanıcıların ana sayfasında yayınlayın.</p>
                    </div>
                </div>
                <form id="announcementForm" class="form-stack">
                    <div class="form-row">
                        <label class="form-label">Başlık</label>
                        <input type="text" id="announcementTitle" class="form-control" placeholder="Örn: Haftalık program yayınlandı" required>
                    </div>
                    <div class="form-row">
                        <label class="form-label">Duyuru Metni</label>
                        <textarea id="announcementBody" class="form-control" rows="4" placeholder="Duyuru detayları..."></textarea>
                    </div>
                    <div class="form-row two-col">
                        <div>
                            <label class="form-label">Seviye</label>
                            <select id="announcementLevel" class="form-control">
                                <option value="Bilgi">Bilgi</option>
                                <option value="Önemli">Önemli</option>
                                <option value="Kritik">Kritik</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label">Durum</label>
                            <label class="form-check">
                                <input type="checkbox" id="announcementIsActive" checked>
                                <span>Yayınla</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">📌 Duyuru Yayınla</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="announcement-grid mt-4">
            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>Aktif ve Geçmiş Sınav İlanları</h3>
                        <p class="text-muted">İlanları düzenleyin veya pasife alın.</p>
                    </div>
                </div>
                <div id="examAnnouncementList" class="list-stack">Yükleniyor...</div>
            </div>
            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>Yayınlanan Duyurular</h3>
                        <p class="text-muted">Aktif duyuruları buradan yönetebilirsiniz.</p>
                    </div>
                </div>
                <div id="announcementList" class="list-stack">Yükleniyor...</div>
            </div>
        </div>
    `;

    const examForm = document.getElementById('examAnnouncementForm');
    const announcementForm = document.getElementById('announcementForm');
    if (examForm) examForm.addEventListener('submit', handleExamSubmit);
    if (announcementForm) announcementForm.addEventListener('submit', handleAnnouncementSubmit);
}

async function handleExamSubmit(event) {
    event.preventDefault();
    const title = document.getElementById('examTitle').value.trim();
    const description = document.getElementById('examDescription').value.trim();
    const examDateRaw = document.getElementById('examDate').value;
    const location = document.getElementById('examLocation').value.trim();
    const applicationStartRaw = document.getElementById('examApplyStart').value;
    const applicationEndRaw = document.getElementById('examApplyEnd').value;
    const applicationLink = document.getElementById('examApplicationLink').value.trim();
    const isActive = document.getElementById('examIsActive').checked;

    if (!title || !examDateRaw) {
        showToast("Lütfen sınav başlığı ve tarihini girin.", "info");
        return;
    }

    const examDate = new Date(examDateRaw);
    const applicationStart = applicationStartRaw ? new Date(applicationStartRaw) : null;
    const applicationEnd = applicationEndRaw ? new Date(applicationEndRaw) : null;

    try {
        const collectionRef = collection(db, "examAnnouncements");
        const batch = writeBatch(db);

        if (isActive) {
            const activeSnapshot = await getDocs(query(collectionRef, where("isActive", "==", true)));
            activeSnapshot.forEach(docSnap => {
                batch.update(docSnap.ref, { isActive: false, updatedAt: serverTimestamp() });
            });
        }

        const newDocRef = doc(collectionRef);
        batch.set(newDocRef, {
            title,
            description,
            examDate,
            applicationStart,
            applicationEnd,
            location,
            applicationLink,
            isActive,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        await batch.commit();
        showToast("Sınav ilanı kaydedildi.", "success");
        event.target.reset();
        document.getElementById('examIsActive').checked = true;
        loadExamAnnouncements();
    } catch (error) {
        console.error("Sınav ilanı kaydedilemedi:", error);
        showToast("Sınav ilanı kaydedilemedi.", "error");
    }
}

async function loadExamAnnouncements() {
    const list = document.getElementById('examAnnouncementList');
    if (!list) return;

    try {
        const snapshot = await getDocs(query(collection(db, "examAnnouncements"), orderBy("createdAt", "desc")));
        if (snapshot.empty) {
            list.innerHTML = `<p class="text-muted">Henüz sınav ilanı yok.</p>`;
            return;
        }

        list.innerHTML = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const examDate = formatDate(data.examDate);
            return `
                <div class="list-item">
                    <div>
                        <strong>${data.title || 'Sınav İlanı'}</strong>
                        <div class="text-muted">${examDate || 'Tarih açıklanacak'}</div>
                    </div>
                    <div class="list-actions">
                        <span class="badge badge-${data.isActive ? 'success' : 'secondary'}">${data.isActive ? 'Aktif' : 'Pasif'}</span>
                        ${data.isActive
                            ? `<button class="btn btn-sm btn-outline-warning" data-action="deactivate" data-id="${docSnap.id}">Pasif Yap</button>`
                            : `<button class="btn btn-sm btn-outline-success" data-action="activate" data-id="${docSnap.id}">Aktif Yap</button>`
                        }
                        <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${docSnap.id}">Sil</button>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => handleExamAction(btn.dataset.action, btn.dataset.id));
        });
    } catch (error) {
        console.error("Sınav ilanları yüklenemedi:", error);
        list.innerHTML = `<p class="text-muted">Sınav ilanları yüklenemedi.</p>`;
    }
}

async function handleExamAction(action, id) {
    const docRef = doc(db, "examAnnouncements", id);
    if (action === 'delete') {
        const confirmDelete = await showConfirm("Bu ilanı silmek istediğinize emin misiniz?", {
            title: "Silme Onayı",
            confirmText: "Sil",
            cancelText: "Vazgeç"
        });
        if (!confirmDelete) return;
        await deleteDoc(docRef);
        showToast("Sınav ilanı silindi.", "success");
        loadExamAnnouncements();
        return;
    }

    if (action === 'activate') {
        await setActiveExamAnnouncement(id);
        return;
    }

    if (action === 'deactivate') {
        await updateDoc(docRef, { isActive: false, updatedAt: serverTimestamp() });
        showToast("Sınav ilanı pasife alındı.", "success");
        loadExamAnnouncements();
    }
}

async function setActiveExamAnnouncement(id) {
    try {
        const collectionRef = collection(db, "examAnnouncements");
        const batch = writeBatch(db);
        const activeSnapshot = await getDocs(query(collectionRef, where("isActive", "==", true)));
        activeSnapshot.forEach(docSnap => {
            batch.update(docSnap.ref, { isActive: false, updatedAt: serverTimestamp() });
        });
        batch.update(doc(collectionRef, id), { isActive: true, updatedAt: serverTimestamp() });
        await batch.commit();
        showToast("Sınav ilanı aktif edildi.", "success");
        loadExamAnnouncements();
    } catch (error) {
        console.error("Sınav ilanı güncellenemedi:", error);
        showToast("Sınav ilanı güncellenemedi.", "error");
    }
}

async function handleAnnouncementSubmit(event) {
    event.preventDefault();
    const title = document.getElementById('announcementTitle').value.trim();
    const body = document.getElementById('announcementBody').value.trim();
    const level = document.getElementById('announcementLevel').value;
    const isActive = document.getElementById('announcementIsActive').checked;

    if (!title) {
        showToast("Duyuru başlığını girin.", "info");
        return;
    }

    try {
        await addDoc(collection(db, "announcements"), {
            title,
            body,
            level,
            isActive,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        showToast("Duyuru yayınlandı.", "success");
        event.target.reset();
        document.getElementById('announcementIsActive').checked = true;
        loadAnnouncements();
    } catch (error) {
        console.error("Duyuru kaydedilemedi:", error);
        showToast("Duyuru kaydedilemedi.", "error");
    }
}

async function loadAnnouncements() {
    const list = document.getElementById('announcementList');
    if (!list) return;

    try {
        const snapshot = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc")));
        if (snapshot.empty) {
            list.innerHTML = `<p class="text-muted">Henüz duyuru yok.</p>`;
            return;
        }

        list.innerHTML = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const createdAt = formatDate(data.createdAt);
            return `
                <div class="list-item">
                    <div>
                        <strong>${data.title || 'Duyuru'}</strong>
                        <div class="text-muted">${data.body || ''}</div>
                        <div class="text-muted">${createdAt || ''}</div>
                    </div>
                    <div class="list-actions">
                        <span class="badge badge-${data.isActive ? 'success' : 'secondary'}">${data.isActive ? 'Yayında' : 'Pasif'}</span>
                        ${data.isActive
                            ? `<button class="btn btn-sm btn-outline-warning" data-action="deactivate" data-id="${docSnap.id}">Pasif Yap</button>`
                            : `<button class="btn btn-sm btn-outline-success" data-action="activate" data-id="${docSnap.id}">Yayınla</button>`
                        }
                        <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${docSnap.id}">Sil</button>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => handleAnnouncementAction(btn.dataset.action, btn.dataset.id));
        });
    } catch (error) {
        console.error("Duyurular yüklenemedi:", error);
        list.innerHTML = `<p class="text-muted">Duyurular yüklenemedi.</p>`;
    }
}

async function handleAnnouncementAction(action, id) {
    const docRef = doc(db, "announcements", id);
    if (action === 'delete') {
        const confirmDelete = await showConfirm("Bu duyuruyu silmek istediğinize emin misiniz?", {
            title: "Silme Onayı",
            confirmText: "Sil",
            cancelText: "Vazgeç"
        });
        if (!confirmDelete) return;
        await deleteDoc(docRef);
        showToast("Duyuru silindi.", "success");
        loadAnnouncements();
        return;
    }

    if (action === 'activate') {
        await updateDoc(docRef, { isActive: true, updatedAt: serverTimestamp() });
        showToast("Duyuru yayınlandı.", "success");
        loadAnnouncements();
        return;
    }

    if (action === 'deactivate') {
        await updateDoc(docRef, { isActive: false, updatedAt: serverTimestamp() });
        showToast("Duyuru pasife alındı.", "success");
        loadAnnouncements();
    }
}

function formatDate(value) {
    if (!value) return '';
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
