import { db } from "../../firebase-config.js";
import { collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function initContentPage() {
    console.log("İçerik yönetimi yükleniyor...");
    
    // Event Listener'lar
    document.getElementById('btnSaveTopic').addEventListener('click', saveTopic);
    // document.getElementById('btnSaveExam').addEventListener('click', saveExam);
    
    loadTopicsList();
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
    snapshot.forEach(doc => {
        const topic = doc.data();
        html += `
            <li class="admin-list-item">
                <strong>${topic.title}</strong> <span class="tag">${topic.category}</span>
                <div class="actions">
                    <button class="btn-sm" onclick="editTopic('${doc.id}')">Düzenle</button>
                </div>
            </li>
        `;
    });
    html += '</ul>';
    
    listContainer.innerHTML = html;
}