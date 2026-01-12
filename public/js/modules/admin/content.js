import { db } from "../../firebase-config.js";
import { collection, addDoc, getDocs, serverTimestamp, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function initContentPage() {
    console.log("İçerik yönetimi yükleniyor...");
    
    // Event Listener'lar
    document.getElementById('btnSaveTopic').addEventListener('click', saveTopic);
    
    loadTopicsList();
    loadReports(); // Raporları yükle
}

// --- KONU YÖNETİMİ ---

async function saveTopic() {
    const titleInput = document.getElementById('topicTitle');
    const descInput = document.getElementById('topicDesc');
    const categorySelect = document.getElementById('topicCategory');
    
    const title = titleInput.value;
    if (!title) return alert("Konu başlığı zorunludur!");

    try {
        await addDoc(collection(db, "topics"), {
            title: title,
            description: descInput.value,
            category: categorySelect.value, // örn: "anayasa", "idare-hukuku"
            createdAt: serverTimestamp(),
            isActive: true
        });
        
        alert("Konu başarıyla eklendi!");
        titleInput.value = ''; // Formu temizle
        loadTopicsList(); // Listeyi yenile
    } catch (error) {
        console.error("Konu ekleme hatası:", error);
        alert("Hata: " + error.message);
    }
}

async function loadTopicsList() {
    const listContainer = document.getElementById('topicsList');
    listContainer.innerHTML = 'Yükleniyor...';
    
    const snapshot = await getDocs(collection(db, "topics"));
    
    let html = '<ul class="admin-list">';
    snapshot.forEach(docSnap => {
        const topic = docSnap.data();
        html += `
            <li class="admin-list-item">
                <strong>${topic.title}</strong> <span class="tag">${topic.category}</span>
                <div class="actions">
                    <button class="btn-sm" onclick="window.AdminContent.editTopic('${docSnap.id}')">Düzenle</button>
                </div>
            </li>
        `;
    });
    html += '</ul>';
    
    listContainer.innerHTML = html;
}


// --- RAPOR YÖNETİMİ ---
export async function loadReports() {
    const reportsList = document.getElementById('reportsList');
    if(!reportsList) return;
    reportsList.innerHTML = 'Yükleniyor...';
    
    const q = query(collection(db, "reports"), where("status", "==", "pending"));

    try {
        const snapshot = await getDocs(q);
        let html = '<ul class="admin-list">';

        if (snapshot.empty) {
            html += '<li class="admin-list-item">Bekleyen rapor bulunmuyor.</li>';
        } else {
            snapshot.forEach(docSnap => {
                const report = docSnap.data();
                html += `
                    <li class="admin-list-item">
                        <span><strong>Soru ID:</strong> ${report.questionId}</span>
                        <p><strong>Bildirim:</strong> "${report.description}"</p>
                        <small><strong>Kullanıcı:</strong> ${report.userId}</small>
                        <div class="actions">
                            <button class="btn-sm btn-primary" onclick="window.AdminContent.handleReport('${docSnap.id}', '${report.questionId}', '${report.userId}')">İncele & Çöz</button>
                        </div>
                    </li>
                `;
            });
        }
        html += '</ul>';
        reportsList.innerHTML = html;
    } catch (error) {
        console.error("Raporlar yüklenirken hata oluştu:", error);
        reportsList.innerHTML = '<li class="admin-list-item error">Raporlar yüklenemedi.</li>';
    }
}

async function resolveReport(reportId, userId, action, adminNote) {
    const reportRef = doc(db, "reports", reportId);
    
    try {
        // 1. Raporun durumunu güncelle
        await updateDoc(reportRef, {
            status: action, // 'fixed' veya 'rejected'
            adminNote: adminNote,
            resolvedAt: serverTimestamp()
        });

        // 2. Kullanıcıya Bildirim Gönder
        await addDoc(collection(db, "notifications"), {
            userId: userId,
            type: "report_response",
            title: action === 'fixed' ? "Teşekkürler! Hata düzeltildi." : "Bildiriminiz hakkında",
            message: `Bildirdiğiniz soru incelendi: ${adminNote}`,
            read: false,
            createdAt: serverTimestamp()
        });

        alert("İşlem tamamlandı ve kullanıcıya bildirim gönderildi.");
        loadReports(); // Listeyi yenile

    } catch (error) {
        console.error("Rapor çözülürken hata:", error);
        alert("Hata: " + error.message);
    }
}

// Make functions globally available for inline HTML onclicks
window.AdminContent = {
    handleReport: async (reportId, questionId, userId) => {
        const adminNote = prompt("Çözüm notu girin (Kullanıcıya gösterilecek mesaj):\nÖrn: 'Haklısınız, şık düzeltildi.' veya 'Soruda bir hata bulunamadı.'");
        if (adminNote === null) return; // User cancelled prompt

        const action = confirm("Rapor 'Düzeltildi' olarak mı işaretlensin?\n(İptal'e basarsanız 'Reddedildi' olarak işaretlenir.)") ? 'fixed' : 'rejected';
        
        await resolveReport(reportId, userId, action, adminNote);
        
        console.log(`İnceleme için Soru Editörünü aç: ${questionId}`);
    },
    editTopic: (topicId) => {
        console.log(`Editing topic ${topicId}`);
        alert(`Topic editing is not implemented yet. Topic ID: ${topicId}`);
    }
};