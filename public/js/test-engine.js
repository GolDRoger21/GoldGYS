import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class TestEngine {
    constructor(containerId, questionsData) {
        this.container = document.getElementById(containerId);
        this.questions = questionsData;
        this.currentIndex = 0;
        this.answers = {}; // { questionId: { selected: "A", isCorrect: true } }
        this.favorites = new Set(); // Kullanıcının favori soru ID'leri
        
        this.ui = {
            trueVal: document.getElementById('trueVal'),
            falseVal: document.getElementById('falseVal'),
            remainVal: document.getElementById('remainVal'),
            modal: document.getElementById('resultModal')
        };
        
        this.init();
    }

    async init() {
        await this.loadUserFavorites();
        this.renderAllQuestions();
        this.updateCounters();
        this.setupGlobalListeners();
    }

    async loadUserFavorites() {
        if (!auth.currentUser) return;
        // Kullanıcının favorilerini çek
        const favRef = collection(db, `users/${auth.currentUser.uid}/favorites`);
        // (Gerçek uygulamada burası getDocs ile çekilip Set'e atılır)
    }

    renderAllQuestions() {
        this.container.innerHTML = '';
        this.questions.forEach((q, index) => {
            const card = this.createQuestionCard(q, index);
            this.container.appendChild(card);
        });
    }

    createQuestionCard(q, index) {
        const article = document.createElement('article');
        article.className = 'soru-kart';
        article.id = `q-${q.id}`;
        article.dataset.id = q.id;

        // Öncüllü Soru Mantığı
        let contentHTML = q.text;
        if (q.type === 'oncullu' && q.onculler) {
            const listItems = q.onculler.map(o => `<li>${o}</li>`).join('');
            contentHTML += `<ul class="oncullu-liste">${listItems}</ul>`;
            if (q.questionRoot) contentHTML += `<p class="soru-kok-vurgu">${q.questionRoot}</p>`;
        }

        // Şıklar
        const optionsHTML = q.options.map(opt => `
            <button class="sik-btn" onclick="window.testEngine.handleAnswer('${q.id}', '${opt.id}')">
                <div class="sik-harf">${opt.id}</div>
                ${opt.text}
            </button>
        `).join('');

        // Kart HTML
        article.innerHTML = `
            <div class="kart-header">
                <span class="soru-no">SORU ${index + 1}</span>
                <div class="kart-actions">
                    <button class="btn-icon fav-btn" onclick="window.testEngine.toggleFavorite('${q.id}')" title="Favorilere Ekle">
                        ${this.favorites.has(q.id) ? '★' : '☆'}
                    </button>
                    <button class="btn-icon report-btn" onclick="window.testEngine.openReportModal('${q.id}')" title="Hata Bildir">
                        🚩
                    </button>
                </div>
            </div>
            <div class="soru-metni text-justify-custom">${contentHTML}</div>
            <div class="siklar-alani">${optionsHTML}</div>
            
            <div class="cozum-container" id="sol-${q.id}">
                <div class="cozum-header">💡 Detaylı Analiz</div>
                <div class="cozum-content text-justify-custom">
                    ${q.solution.dayanak ? `<p><strong>⚖️ Mevzuat:</strong> ${q.solution.dayanak}</p>` : ''}
                    <p><strong>🧠 Analiz:</strong> ${q.solution.analiz}</p>
                    ${q.solution.tuzak ? `<div class="tuzak-kutu"><strong>⚠️ Sınav Tuzağı:</strong> ${q.solution.tuzak}</div>` : ''}
                    ${q.solution.hap ? `<div class="hap-kutu"><strong>💊 Hap Bilgi:</strong> ${q.solution.hap}</div>` : ''}
                </div>
            </div>
        `;

        return article;
    }

    handleAnswer(questionId, selectedOptionId) {
        if (this.answers[questionId]) return; // Zaten cevaplanmış

        const question = this.questions.find(q => q.id === questionId);
        const isCorrect = selectedOptionId === question.correctOption;
        
        this.answers[questionId] = { selected: selectedOptionId, isCorrect };

        // UI Güncelleme
        const card = document.getElementById(`q-${questionId}`);
        const buttons = card.querySelectorAll('.sik-btn');
        const solutionDiv = document.getElementById(`sol-${questionId}`);

        buttons.forEach(btn => {
            btn.classList.add('disabled');
            const optId = btn.querySelector('.sik-harf').innerText;
            
            if (optId === selectedOptionId) {
                btn.classList.add(isCorrect ? 'correct' : 'wrong');
            }
            if (optId === question.correctOption && !isCorrect) {
                btn.classList.add('correct'); // Doğru cevabı göster
            }
        });

        // Çözümü göster
        solutionDiv.style.display = 'block';
        
        // Sayaçları güncelle
        this.updateCounters();

        // Veritabanına istatistik gönder (Opsiyonel: Bulk update yapılabilir)
        this.saveProgress(questionId, isCorrect);
    }

    updateCounters() {
        const total = this.questions.length;
        const answered = Object.values(this.answers);
        const correct = answered.filter(a => a.isCorrect).length;
        const wrong = answered.filter(a => !a.isCorrect).length;

        if(this.ui.trueVal) this.ui.trueVal.innerText = correct;
        if(this.ui.falseVal) this.ui.falseVal.innerText = wrong;
        if(this.ui.remainVal) this.ui.remainVal.innerText = total - answered.length;
    }

    async toggleFavorite(questionId) {
        if (!auth.currentUser) return alert("Favorilere eklemek için giriş yapmalısınız.");
        
        const btn = document.querySelector(`#q-${questionId} .fav-btn`);
        const userFavRef = doc(db, `users/${auth.currentUser.uid}/favorites/${questionId}`);

        if (this.favorites.has(questionId)) {
            this.favorites.delete(questionId);
            btn.innerText = '☆';
            // Firestore'dan sil
            // await deleteDoc(userFavRef);
        } else {
            this.favorites.add(questionId);
            btn.innerText = '★';
            // Firestore'a ekle (Soru özetini de ekle ki offline çalışabilsin)
            const q = this.questions.find(q => q.id === questionId);
            await setDoc(userFavRef, {
                questionId: q.id,
                text: q.text,
                addedAt: serverTimestamp()
            });
        }
    }

    openReportModal(questionId) {
        const reason = prompt("Hata bildiriminiz nedir? (Örn: Yanlış şık, yazım hatası)");
        if (reason) this.submitReport(questionId, reason);
    }

    async submitReport(questionId, description) {
        if (!auth.currentUser) return;
        try {
            await addDoc(collection(db, "reports"), {
                questionId: questionId,
                userId: auth.currentUser.uid,
                description: description,
                status: "pending",
                createdAt: serverTimestamp()
            });
            alert("Bildiriminiz alındı. Teşekkürler!");
        } catch (e) {
            console.error(e);
            alert("Bildirim gönderilemedi.");
        }
    }

    // İstatistik Kaydı
    async saveProgress(questionId, isCorrect) {
        // Burada kullanıcının günlük çözdüğü soru sayısı vb. güncellenir.
    }

    setupGlobalListeners() {
        window.testEngine = this; // HTML onclick'ler için global erişim
    }
}