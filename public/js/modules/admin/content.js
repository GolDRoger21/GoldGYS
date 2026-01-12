
import { db } from "../../firebase-config.js";
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// UI Elementleri için bir nesne
const ui = {
    // Konu Ekleme Formu
    topicCategory: document.getElementById('topicCategory'),
    topicTitle: document.getElementById('topicTitle'),
    topicDesc: document.getElementById('topicDesc'),
    btnSaveTopic: document.getElementById('btnSaveTopic'),
    topicsList: document.getElementById('topicsList'),
    
    // Soru Editörü
    questionEditor: document.getElementById('questionEditor'),
    editQuestionId: document.getElementById('editQuestionId'),
    qText: document.getElementById('qText'),
    optA: document.getElementById('optA'),
    optB: document.getElementById('optB'),
    // Not: Diğer şıklar (C, D, E) HTML'de varsa buraya eklenmeli.
    // Örnek: optC: document.getElementById('optC'),
    solDayanak: document.getElementById('solDayanak'),
    solAnaliz: document.getElementById('solAnaliz'),
    solTuzak: document.getElementById('solTuzak'),
    solHap: document.getElementById('solHap'),
    btnSaveQuestion: document.getElementById('btnSaveQuestion'),

    // Toplu Yükleme
    bulkJsonInput: document.getElementById('bulkJsonInput'),
    btnBulkUpload: document.getElementById('btnBulkUpload')
};

// --- İÇERİK SAYFASI BAŞLATMA ---
export function initContentPage() {
    // Event Listeners (Olay Dinleyicileri)
    // Butonların null olma ihtimaline karşı kontrol ekliyoruz.
    if(ui.btnSaveTopic) ui.btnSaveTopic.addEventListener('click', saveTopic);
    if(ui.btnSaveQuestion) ui.btnSaveQuestion.addEventListener('click', saveQuestion);
    if(ui.btnBulkUpload) ui.btnBulkUpload.addEventListener('click', handleBulkUpload);

    // Mevcut konuları yükle
    loadTopics();
}

// --- SORU DÜZENLEYİCİYİ AÇAN FONKSİYON ---
// Bu fonksiyonu legislation.js'in kullanabilmesi için export ediyoruz.
export async function openQuestionEditor(questionId) {
    if (!questionId) {
        // Yeni soru modu
        ui.questionEditor.style.display = 'block';
        ui.editQuestionId.value = '';
        // Formu temizle... (Gerekirse implemente edilebilir)
        return;
    }

    try {
        const docRef = doc(db, "questions", questionId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Formu doldur
            ui.editQuestionId.value = questionId;
            ui.qText.value = data.text || '';
            
            // Seçenekler (options) - Genellikle bir objedir
            if (data.options) {
                ui.optA.value = data.options.A || '';
                ui.optB.value = data.options.B || '';
                // Diğer şıklar varsa...
                // ui.optC.value = data.options.C || '';
            }

            // Çözüm (solution) - Bu da bir objedir
            if (data.solution) {
                ui.solDayanak.value = data.solution.basis || '';
                ui.solAnaliz.value = data.solution.analysis || '';
                ui.solTuzak.value = data.solution.trap || '';
                ui.solHap.value = data.solution.pill || '';
            }
            
            ui.questionEditor.style.display = 'block';
            ui.questionEditor.scrollIntoView({ behavior: 'smooth' });

        } else {
            console.error("Soru bulunamadı:", questionId);
            alert("Düzenlenecek soru bulunamadı.");
        }
    } catch (error) {
        console.error("Soru yüklenirken hata:", error);
        alert("Soru bilgileri yüklenirken bir hata oluştu.");
    }
}


// --- MEVCUT FONKSİYONLAR ---

async function saveTopic() {
    // Konu kaydetme mantığı...
    console.log("Konu kaydediliyor...");
}

async function loadTopics() {
    // Konuları yükleme mantığı...
    console.log("Konular yükleniyor...");
}

async function saveQuestion() {
    // Soru kaydetme/güncelleme mantığı...
    console.log("Soru kaydediliyor...");
}

// --- TOPLU SORU YÜKLEME (BULK UPLOAD) ---
export async function handleBulkUpload() {
    const jsonInput = document.getElementById('bulkJsonInput');
    
    if (!jsonInput || !jsonInput.value.trim()) {
        alert("Lütfen geçerli bir JSON verisi yapıştırın.");
        return;
    }

    try {
        const questions = JSON.parse(jsonInput.value);
        if (!Array.isArray(questions)) throw new Error("Veri bir dizi (array) olmalıdır: [...]");

        if(!confirm(`${questions.length} adet soru yüklenecek. Onaylıyor musunuz?`)) return;

        const batch = writeBatch(db);
        const questionsRef = collection(db, "questions");

        let count = 0;
        questions.forEach(q => {
            if(!q.text || !q.options || !q.correctOption) {
                console.warn("Eksik verili soru atlandı:", q);
                return;
            }

            const newDocRef = doc(questionsRef);
            
            batch.set(newDocRef, {
                ...q,
                createdAt: serverTimestamp(),
                isFlaggedForReview: false, // Yeni eklenen sorular varsayılan olarak günceldir
                isActive: true,
                stats: { correct: 0, wrong: 0 }
            });
            count++;
        });

        await batch.commit();
        alert(`${count} soru başarıyla veritabanına eklendi!`);
        jsonInput.value = '';

    } catch (error) {
        console.error("Yükleme Hatası:", error);
        alert("Hata: JSON formatı bozuk olabilir. Konsolu kontrol edin.\n" + error.message);
    }
}
