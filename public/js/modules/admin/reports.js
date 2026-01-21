import { db } from "../../firebase-config.js";
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let listContainer = null;

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

        await renderReports(snapshot);
    } catch (error) {
        console.error("Rapor hatası:", error);
        listContainer.innerHTML = `<p class="error">Hata: ${error.message}</p>`;
    }
}

async function renderReports(snapshot) {
    const cards = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : '-';
        const questionInfo = data.questionId ? await fetchQuestionInfo(data.questionId) : null;

        // Kaynak belirteci (Yardım sayfasından mı geldi?)
        const sourceBadge = data.source === 'help_page'
            ? '<span class="badge badge-info ml-2">📧 İletişim Formu</span>'
            : '<span class="badge badge-warning ml-2">🚩 Soru Bildirimi</span>';

        const statusLabel = data.status === 'archived' ? 'Arşivlendi' : data.status === 'resolved' ? 'Çözüldü' : 'Bekliyor';
        const statusBadge = `<span class="badge badge-${data.status === 'pending' ? 'warning' : 'success'} ml-2">${statusLabel}</span>`;

        const questionMeta = data.questionId
            ? `• Soru ID: <strong>${data.questionId}</strong>`
            : '';

        const questionPreview = data.questionId
            ? buildQuestionPreview(questionInfo)
            : '';

        return `
        <div class="col-span-12 card" id="report-${docSnap.id}">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <h4 class="text-main">${data.type || 'Bildirim'} ${sourceBadge} ${statusBadge}</h4>
                    <p class="text-sm text-muted">
                        Gönderen: ${data.userEmail || data.userId || 'Anonim'} • ${date}
                        ${questionMeta}
                    </p>
                </div>
                <div>
                    ${data.questionId ? `<button class="btn btn-sm btn-primary" onclick="window.AdminReports.editQuestion('${docSnap.id}', '${data.questionId}')">Soruyu Düzenle</button>` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="window.AdminReports.archive('${docSnap.id}')">Arşivle</button>
                    <button class="btn btn-sm btn-danger" onclick="window.AdminReports.delete('${docSnap.id}')">Sil</button>
                </div>
            </div>
            <div class="mt-2 p-3 bg-hover rounded text-main">
                ${data.description || 'Açıklama yok'}
            </div>
            ${questionPreview}
        </div>`;
    }));

    listContainer.innerHTML = `<div class="grid-12 stack-md">${cards.join('')}</div>`;
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

function buildQuestionPreview(questionInfo) {
    if (!questionInfo) {
        return `
        <div class="mt-3 p-3 border rounded bg-light text-muted">
            <strong>⚠️ Soru bulunamadı.</strong> Bu sorunun silinmiş veya taşınmış olması mümkün.
        </div>`;
    }

    const options = (questionInfo.options || [])
        .map((opt) => `<li><strong>${opt.id}.</strong> ${opt.text}</li>`)
        .join('');

    const correctLabel = questionInfo.correctOption
        ? `<span class="badge badge-success ml-2">Doğru: ${questionInfo.correctOption}</span>`
        : '';

    return `
        <div class="mt-3 p-3 border rounded bg-light">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <strong>🧩 Soru Önizleme</strong>
                ${correctLabel}
            </div>
            <div class="text-main mb-2">${questionInfo.text || 'Soru metni bulunamadı.'}</div>
            ${options ? `<ul class="text-sm text-muted">${options}</ul>` : '<div class="text-sm text-muted">Şık bilgisi yok.</div>'}
        </div>`;
}

// Global Actions
export const AdminReports = {
    archive: async (id) => {
        if (!confirm('Bu bildirimi arşivlemek istiyor musunuz?')) return;
        try {
            await updateDoc(doc(db, "reports", id), { status: 'archived' });
            document.getElementById(`report-${id}`).remove();
        } catch (e) { alert("İşlem başarısız"); }
    },
    editQuestion: async (_reportId, questionId) => {
        if (!questionId) {
            alert("Bu bildirime bağlı soru bulunamadı.");
            return;
        }
        if (typeof window.openQuestionEditor !== 'function') {
            alert("Soru düzenleyici yüklenemedi.");
            return;
        }
        window.openQuestionEditor(questionId);
    },
    delete: async (id) => {
        if (!confirm('Bu bildirimi kalıcı olarak silmek istiyor musunuz?')) return;
        try {
            await deleteDoc(doc(db, "reports", id));
            document.getElementById(`report-${id}`).remove();
        } catch (e) { alert("Silme başarısız"); }
    }
};
