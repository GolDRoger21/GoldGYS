import { db } from "../../firebase-config.js";
import { collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listContainer = document.getElementById('reportsList');

export async function initReportsPage() {
    console.log("Raporlar yükleniyor...");
    if (!listContainer) return;

    listContainer.innerHTML = '<p>Yükleniyor...</p>';

    try {
        const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = '<div class="alert alert-info">Henüz bekleyen bildirim yok.</div>';
            return;
        }

        renderReports(snapshot);
    } catch (error) {
        console.error("Rapor hatası:", error);
        listContainer.innerHTML = `<p class="error">Hata: ${error.message}</p>`;
    }
}

function renderReports(snapshot) {
    let html = '<div class="grid-12 stack-md">';
    
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : '-';
        
        html += `
        <div class="col-span-12 card" id="report-${docSnap.id}">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <h4 class="text-warning">${data.type || 'Hata Bildirimi'}</h4>
                    <p class="text-sm text-muted">Soru ID: ${data.questionId} • ${date} • Gönderen: ${data.userId || 'Anonim'}</p>
                </div>
                <div>
                    <button class="btn btn-sm btn-secondary" onclick="window.AdminReports.archive('${docSnap.id}')">Arşivle</button>
                    <button class="btn btn-sm btn-danger" onclick="window.AdminReports.delete('${docSnap.id}')">Sil</button>
                </div>
            </div>
            <div class="mt-2 p-2 bg-dark rounded">
                ${data.description || 'Açıklama yok'}
            </div>
        </div>`;
    });
    
    html += '</div>';
    listContainer.innerHTML = html;
}

// Global Actions
export const AdminReports = {
    archive: async (id) => {
        if(!confirm('Bu bildirimi arşivlemek istiyor musunuz?')) return;
        try {
            await updateDoc(doc(db, "reports", id), { status: 'archived' });
            document.getElementById(`report-${id}`).remove();
        } catch(e) { alert("İşlem başarısız"); }
    },
    delete: async (id) => {
        if(!confirm('Bu bildirimi kalıcı olarak silmek istiyor musunuz?')) return;
        try {
            await deleteDoc(doc(db, "reports", id));
            document.getElementById(`report-${id}`).remove();
        } catch(e) { alert("Silme başarısız"); }
    }
};