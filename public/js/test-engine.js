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
        // this.renderAllQuestions(); // Eski toplu gösterim iptal
        this.renderCurrentQuestion(); // Yeni adım adım gösterim
        this.updateCounters();
        this.setupMobileGestures();
    }

    // --- NAVİGASYON VE RENDER ---

    renderCurrentQuestion() {
        this.container.innerHTML = '';
        const q = this.questions[this.currentIndex];
        const card = this.createQuestionCard(q, this.currentIndex);
        this.container.appendChild(card);

        // Navigasyon Butonlarını Ekle
        this.renderNavigation();
    }

    renderNavigation() {
        const navDiv = document.createElement('div');
        navDiv.className = 'test-navigation';
        navDiv.style.cssText = "display: flex; justify-content: space-between; margin-top: 20px; gap: 10px;";

        // Önceki Butonu
        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn-nav btn-prev';
        btnPrev.innerHTML = '← Önceki';
        btnPrev.onclick = () => this.prevQuestion();
        btnPrev.disabled = this.currentIndex === 0;

        // Sonraki / Bitir Butonu
        const btnNext = document.createElement('button');
        btnNext.className = 'btn-nav btn-next';

        if (this.currentIndex === this.questions.length - 1) {
            btnNext.innerHTML = 'Testi Bitir ✓';
            btnNext.className += ' btn-finish';
            btnNext.onclick = () => {
                if (confirm("Testi bitirmek istediğinize emin misiniz?")) this.finishTest();
            };
        } else {
            btnNext.innerHTML = 'Sonraki →';
            btnNext.onclick = () => this.nextQuestion();
        }

        navDiv.appendChild(btnPrev);
        navDiv.appendChild(btnNext);
        this.container.appendChild(navDiv);
    }

    nextQuestion() {
        if (this.currentIndex < this.questions.length - 1) {
            this.currentIndex++;
            this.renderCurrentQuestion();
            this.scrollToTop();
        }
    }

    prevQuestion() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.renderCurrentQuestion();
            this.scrollToTop();
        }
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setupMobileGestures() {
        // Basit Swipe Algılama
        let touchstartX = 0;
        let touchendX = 0;
        const threshold = 50;

        this.container.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
        });

        this.container.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            this.handleGesture();
        });

        this.handleGesture = () => {
            if (touchendX < touchstartX - threshold) this.nextQuestion(); // Sola kaydır (İleri)
            if (touchendX > touchstartX + threshold) this.prevQuestion(); // Sağa kaydır (Geri)
        }
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

        // Otomatik İlerleme (Opsiyonel: Kullanıcıyı çok sıkmamak için sadece küçük bir gecikme ile)
        // setTimeout(() => {
        //     if (isCorrect) this.nextQuestion(); 
        // }, 1000);
    }

    async saveWrongAnswer(questionId, questionData) {
        try {
            // Kullanıcının 'wrongs' koleksiyonuna ekle
            // setDoc ve merge: true kullanarak, varsa günceller yoksa oluşturur
            const wrongRef = doc(db, `users/${auth.currentUser.uid}/wrongs/${questionId}`);

            await setDoc(wrongRef, {
                questionId: questionId,
                text: questionData.text ? questionData.text.substring(0, 150) + "..." : "Soru metni yok",
                category: questionData.category || 'Genel',
                lastAttempt: serverTimestamp(),
                count: increment(1) // Yanlış sayısını 1 artır
            }, { merge: true });

            // console.log("Yanlış cevap kaydedildi.");
        } catch (e) {
            console.error("Yanlış kayıt hatası:", e);
        }
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
            // console.log("Sonuç başarıyla kaydedildi.");

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