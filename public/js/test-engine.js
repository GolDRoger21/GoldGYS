import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, deleteDoc, addDoc, collection, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class TestEngine {
    // Constructor'a 'examId' parametresi eklendi
    constructor(containerId, questionsData, examId = null) {
        this.container = document.getElementById(containerId);
        this.questions = questionsData;
        this.examId = examId; // Hangi sınavın çözüldüğünü takip etmek için
        this.currentIndex = 0;
        this.answers = {};
        this.favorites = new Set();

        // UI Elementleri
        this.ui = {
            trueVal: document.getElementById('trueVal'),
            falseVal: document.getElementById('falseVal'),
            remainVal: document.getElementById('remainVal'),
            modal: document.getElementById('resultModal'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            resultText: document.getElementById('resultText')
        };

        window.testEngine = this;
        this.init();
    }

    async init() {
        await this.loadUserFavorites();
        this.renderAllQuestions();
        this.updateCounters();
    }

    async loadUserFavorites() {
        if (!auth.currentUser) return;
        // Performans için basit bir yöntem: LocalStorage veya basit bir cache kullanılabilir.
        // Şimdilik boş geçiyoruz, favoriler sayfasında detaylı yükleme yapılır.
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
        article.dataset.answered = 'false';

        // 1. Öncüllü Soru Kontrolü
        let contentHTML = q.text;
        if (q.type === 'oncullu' && q.onculler && q.onculler.length > 0) {
            const listItems = q.onculler.map(o => `<li>${o}</li>`).join('');
            contentHTML += `<ul class="oncullu-liste">${listItems}</ul>`;
            if (q.questionRoot) {
                contentHTML += `<p class="soru-kok-vurgu">${q.questionRoot}</p>`;
            }
        }

        // 2. Şıklar
        const optionsHTML = q.options.map(opt => `
            <button class="sik-btn" onclick="window.testEngine.handleAnswer('${q.id}', '${opt.id}')">
                <div class="sik-harf">${opt.id}</div>
                ${opt.text}
            </button>
        `).join('');

        // 3. Kart HTML
        article.innerHTML = `
            <div class="kart-header">
                <span class="soru-no">SORU ${index + 1}</span>
                <div class="kart-actions" style="display:flex; gap:10px;">
                    <button class="btn-icon fav-btn" onclick="window.testEngine.toggleFavorite('${q.id}')" title="Favori">
                        ${this.favorites.has(q.id) ? '★' : '☆'}
                    </button>
                    <button class="btn-icon report-btn" onclick="window.testEngine.openReportModal('${q.id}')" title="Bildir">
                        🚩
                    </button>
                </div>
            </div>
            <div class="soru-metni text-justify-custom">${contentHTML}</div>
            <div class="siklar-alani">${optionsHTML}</div>
            
            <div class="cozum-container" id="sol-${q.id}" style="display:none;">
                <div class="cozum-header">💡 Detaylı Analiz & Çözüm</div>
                <div class="cozum-content text-justify-custom">
                    ${q.solution.dayanakText ? `<p><strong>⚖️ Dayanak:</strong> ${q.solution.dayanakText}</p>` : ''}
                    <p><strong>🧠 Analiz:</strong> ${q.solution.analiz || 'Çözüm yüklenemedi.'}</p>
                    ${q.solution.tuzak ? `<div class="tuzak-kutu"><strong>⚠️ Sınav Tuzağı:</strong> ${q.solution.tuzak}</div>` : ''}
                    ${q.solution.hap ? `<div class="hap-kutu"><strong>💊 Hap Bilgi:</strong> ${q.solution.hap}</div>` : ''}
                </div>
            </div>
        `;
        return article;
    }

    handleAnswer(questionId, selectedOptionId) {
        const card = document.getElementById(`q-${questionId}`);
        if (card.dataset.answered === 'true') return;

        const question = this.questions.find(q => q.id === questionId);
        const isCorrect = (selectedOptionId === question.correctOption);

        this.answers[questionId] = {
            selected: selectedOptionId,
            isCorrect,
            category: question.category || 'Genel' // İstatistik için kategori kaydı
        };

        card.dataset.answered = 'true';
        card.dataset.result = isCorrect ? 'correct' : 'wrong';

        // UI Güncelleme
        const buttons = card.querySelectorAll('.sik-btn');
        buttons.forEach(btn => {
            btn.classList.add('disabled');
            const optId = btn.querySelector('.sik-harf').innerText;
            if (optId === selectedOptionId) btn.classList.add(isCorrect ? 'correct' : 'wrong');
            if (!isCorrect && optId === question.correctOption) btn.classList.add('correct');
        });

        // Çözümü Göster
        const solDiv = document.getElementById(`sol-${questionId}`);
        if (solDiv) {
            solDiv.style.display = 'block';
            solDiv.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300 });
        }

        // YENİ: Yanlış cevap ise veritabanına kaydet
        if (!isCorrect && auth.currentUser) {
            this.saveWrongAnswer(questionId, question);
        }

        this.updateCounters();
    }

    async saveWrongAnswer(questionId, questionData) {
        try {
            // Kullanıcının 'wrongs' koleksiyonuna ekle
            // Aynı soru varsa tarihini güncelle (setDoc merge ile)
            const wrongRef = doc(db, `users/${auth.currentUser.uid}/wrongs/${questionId}`);
            await setDoc(wrongRef, {
                questionId: questionId,
                text: questionData.text,
                category: questionData.category || 'Genel',
                lastAttempt: serverTimestamp(),
                count: increment(1)
            }, { merge: true });
        } catch (e) { console.error("Yanlış kayıt hatası:", e); }
    }

    updateCounters() {
        const answeredCount = Object.keys(this.answers).length;
        const correctCount = Object.values(this.answers).filter(a => a.isCorrect).length;
        const wrongCount = Object.values(this.answers).filter(a => !a.isCorrect).length;

        if (this.ui.trueVal) this.ui.trueVal.innerText = correctCount;
        if (this.ui.falseVal) this.ui.falseVal.innerText = wrongCount;
        if (this.ui.remainVal) this.ui.remainVal.innerText = this.questions.length - answeredCount;
    }

    // --- SONUÇ KAYDETME VE BİTİRME ---

    async finishTest() {
        const total = this.questions.length;
        const correctCount = Object.values(this.answers).filter(a => a.isCorrect).length;
        const wrongCount = Object.values(this.answers).filter(a => !a.isCorrect).length;
        const emptyCount = total - (correctCount + wrongCount);
        const score = Math.round((correctCount / total) * 100);

        // 1. Modalı Göster
        if (this.ui.scoreDisplay) this.ui.scoreDisplay.innerText = `%${score}`;

        let msg = "Test tamamlandı.";
        if (score >= 90) msg = "Mükemmel! Derece yapabilirsin. 🏆";
        else if (score >= 70) msg = "Gayet iyi, başarılar. 👏";
        else msg = "Biraz daha tekrar yapmalısın. 📚";
        if (this.ui.resultText) this.ui.resultText.innerText = msg;
        if (this.ui.modal) this.ui.modal.style.display = 'flex';

        // 2. Sonucu Veritabanına Kaydet
        await this.saveExamResult({ score, correctCount, wrongCount, emptyCount, total });
    }

    async saveExamResult(stats) {
        if (!auth.currentUser) return; // Misafir kullanıcı kaydetmez

        // Kategori Bazlı Analiz Çıkar
        const categoryBreakdown = {};
        this.questions.forEach(q => {
            const cat = q.category || 'Genel';
            if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { total: 0, correct: 0 };

            categoryBreakdown[cat].total++;
            const ans = this.answers[q.id];
            if (ans && ans.isCorrect) categoryBreakdown[cat].correct++;
        });

        try {
            const resultData = {
                userId: auth.currentUser.uid,
                examId: this.examId || 'custom',
                examTitle: document.getElementById('testTitle')?.innerText || 'Genel Test',
                score: stats.score,
                correct: stats.correctCount,
                wrong: stats.wrongCount,
                empty: stats.emptyCount,
                total: stats.total,
                categoryStats: categoryBreakdown,
                completedAt: serverTimestamp()
            };

            // Kullanıcının "exam_results" koleksiyonuna ekle
            await addDoc(collection(db, `users/${auth.currentUser.uid}/exam_results`), resultData);
            console.log("Sonuç başarıyla kaydedildi.");

        } catch (error) {
            console.error("Sonuç kaydetme hatası:", error);
        }
    }

    // ... (toggleFavorite ve openReportModal fonksiyonları önceki haliyle aynı kalabilir veya buraya ekleyebilirsiniz)
    async toggleFavorite(questionId) {
        if (!auth.currentUser) return alert("Giriş yapmalısınız.");

        const btn = document.querySelector(`#q-${questionId} .fav-btn`);
        const userFavRef = doc(db, `users/${auth.currentUser.uid}/favorites/${questionId}`);

        if (this.favorites.has(questionId)) {
            this.favorites.delete(questionId);
            btn.innerText = '☆';
            btn.classList.remove('active');
            try { await deleteDoc(userFavRef); } catch (e) { }
        } else {
            this.favorites.add(questionId);
            btn.innerText = '★';
            btn.classList.add('active');

            const q = this.questions.find(q => q.id === questionId);
            try {
                await setDoc(userFavRef, {
                    questionId: q.id,
                    text: q.text,
                    category: q.category || "Genel",
                    addedAt: serverTimestamp()
                });
            } catch (e) { }
        }
    }

    openReportModal(questionId) {
        const desc = prompt("Hata bildiriminiz nedir?");
        if (desc && auth.currentUser) {
            addDoc(collection(db, "reports"), {
                questionId, userId: auth.currentUser.uid, description: desc, status: "pending", createdAt: serverTimestamp()
            });
            alert("Bildiriminiz alındı.");
        }
    }
}