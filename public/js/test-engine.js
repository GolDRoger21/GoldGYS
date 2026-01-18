import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, deleteDoc, addDoc, collection, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class TestEngine {
    constructor(containerId, questionsData, options = {}) {
        this.container = document.getElementById(containerId);
        this.questions = questionsData;
        this.examId = options.examId || null;
        this.mode = options.mode || 'practice'; // 'exam' (Sınav) veya 'practice' (Öğrenme)
        this.duration = options.duration || 0; // Dakika cinsinden süre (Sınav modu için)

        this.currentIndex = 0;
        this.answers = {}; // { qId: { selected: 'A', isCorrect: true, timeSpent: 12 } }
        this.favorites = new Set();
        this.timerInterval = null;
        this.startTime = null;
        this.remainingTime = this.duration * 60;

        // UI Elementleri
        this.ui = {
            trueVal: document.getElementById('trueVal'),
            falseVal: document.getElementById('falseVal'),
            remainVal: document.getElementById('remainVal'),
            timerDisplay: document.getElementById('timerDisplay'),
            modal: document.getElementById('resultModal'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            resultText: document.getElementById('resultText')
        };

        window.testEngine = this;
        this.init();
    }

    async init() {
        await this.loadUserFavorites();
        this.renderCurrentQuestion();
        this.updateCounters();
        this.setupMobileGestures();

        if (this.mode === 'exam' && this.duration > 0) {
            this.startTimer();
        } else {
            if (this.ui.timerDisplay) this.ui.timerDisplay.parentElement.style.display = 'none';
        }
    }

    // --- SAYAÇ YÖNETİMİ ---
    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            this.remainingTime--;
            const m = Math.floor(this.remainingTime / 60);
            const s = this.remainingTime % 60;
            if (this.ui.timerDisplay) {
                this.ui.timerDisplay.innerText = `${m}:${s < 10 ? '0' + s : s}`;
            }

            if (this.remainingTime <= 0) {
                clearInterval(this.timerInterval);
                alert("Süre doldu! Test bitiriliyor.");
                this.finishTest(true); // true = timeout
            }
        }, 1000);
    }

    // --- RENDER İŞLEMLERİ ---
    renderCurrentQuestion() {
        this.container.innerHTML = '';
        const q = this.questions[this.currentIndex];
        const card = this.createQuestionCard(q, this.currentIndex);
        this.container.appendChild(card);
        this.renderNavigation();

        // Eğer daha önce cevaplanmışsa durumu geri yükle
        if (this.answers[q.id]) {
            this.restoreAnswerState(q.id);
        }
    }

    createQuestionCard(q, index) {
        const article = document.createElement('article');
        article.className = 'soru-kart';
        article.id = `q-${q.id}`;
        article.dataset.id = q.id;

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
            <button class="sik-btn" data-opt="${opt.id}" onclick="window.testEngine.handleAnswer('${q.id}', '${opt.id}')">
                <div class="sik-harf">${opt.id}</div>
                ${opt.text}
            </button>
        `).join('');

        // 3. Çözüm Alanı (Yeni Veri Yapısına Göre)
        const sol = q.solution || {};
        const leg = q.legislationRef || {};

        const solutionHTML = `
            <div class="cozum-container" id="sol-${q.id}" style="display:none;">
                <div class="cozum-header">💡 Detaylı Analiz & Çözüm</div>
                <div class="cozum-content text-justify-custom">
                    ${leg.code ? `<p class="mb-2"><span class="badge badge-info">⚖️ ${leg.name || 'Kanun'} Md. ${leg.article}</span></p>` : ''}
                    ${sol.dayanakText ? `<p><strong>Dayanak:</strong> ${sol.dayanakText}</p>` : ''}
                    <p><strong>🧠 Analiz:</strong> ${sol.analiz || 'Çözüm yüklenemedi.'}</p>
                    ${sol.tuzak ? `<div class="tuzak-kutu"><strong>⚠️ Sınav Tuzağı:</strong> ${sol.tuzak}</div>` : ''}
                    ${sol.hap ? `<div class="hap-kutu"><strong>💊 Hap Bilgi:</strong> ${sol.hap}</div>` : ''}
                </div>
            </div>
        `;

        article.innerHTML = `
            <div class="kart-header">
                <span class="soru-no">SORU ${index + 1}</span>
                <div class="kart-actions" style="display:flex; gap:10px;">
                    <button class="btn-icon fav-btn" onclick="window.testEngine.toggleFavorite('${q.id}')" title="Favori">
                        ${this.favorites.has(q.id) ? '★' : '☆'}
                    </button>
                    <button class="btn-icon report-btn" onclick="window.testEngine.openReportModal('${q.id}')" title="Bildir">🚩</button>
                </div>
            </div>
            <div class="soru-metni text-justify-custom">${contentHTML}</div>
            <div class="siklar-alani">${optionsHTML}</div>
            ${solutionHTML}
        `;
        return article;
    }

    renderNavigation() {
        const navDiv = document.createElement('div');
        navDiv.className = 'test-navigation';
        navDiv.style.cssText = "display: flex; justify-content: space-between; margin-top: 20px; gap: 10px;";

        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn-nav btn-prev';
        btnPrev.innerHTML = '← Önceki';
        btnPrev.onclick = () => this.prevQuestion();
        btnPrev.disabled = this.currentIndex === 0;

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

    // --- CEVAPLAMA MANTIĞI ---
    handleAnswer(questionId, selectedOptionId) {
        // Eğer daha önce cevaplandıysa işlem yapma
        if (this.answers[questionId]) return;

        const question = this.questions.find(q => q.id === questionId);
        const isCorrect = (selectedOptionId === question.correctOption);

        // Cevabı Kaydet
        this.answers[questionId] = {
            selected: selectedOptionId,
            isCorrect,
            category: question.category || 'Genel'
        };

        // UI Güncelleme (Moda Göre)
        if (this.mode === 'practice') {
            // Öğrenme Modu: Anlık geri bildirim ve çözüm göster
            this.showFeedback(questionId, selectedOptionId, isCorrect, question.correctOption);
        } else {
            // Sınav Modu: Sadece seçili olduğunu göster (Renk verme)
            this.markSelected(questionId, selectedOptionId);
        }

        this.updateCounters();
    }

    showFeedback(qId, selectedId, isCorrect, correctId) {
        const card = document.getElementById(`q-${qId}`);
        const buttons = card.querySelectorAll('.sik-btn');

        buttons.forEach(btn => {
            btn.classList.add('disabled'); // Tıklamayı engelle
            const optId = btn.dataset.opt;

            if (optId === selectedId) {
                btn.classList.add(isCorrect ? 'correct' : 'wrong');
            }
            if (!isCorrect && optId === correctId) {
                btn.classList.add('correct'); // Doğruyu göster
            }
        });

        // Çözümü Aç
        const solDiv = document.getElementById(`sol-${qId}`);
        if (solDiv) {
            solDiv.style.display = 'block';
            solDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Yanlışsa DB'ye kaydet
        if (!isCorrect && auth.currentUser) {
            this.saveWrongAnswer(qId, this.questions.find(q => q.id === qId));
        }
    }

    markSelected(qId, selectedId) {
        const card = document.getElementById(`q-${qId}`);
        const buttons = card.querySelectorAll('.sik-btn');

        buttons.forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.opt === selectedId) {
                btn.classList.add('selected'); // Sadece mavi çerçeve vb.
            }
        });
    }

    restoreAnswerState(qId) {
        const ans = this.answers[qId];
        const q = this.questions.find(item => item.id === qId);

        if (this.mode === 'practice') {
            this.showFeedback(qId, ans.selected, ans.isCorrect, q.correctOption);
        } else {
            this.markSelected(qId, ans.selected);
        }
    }

    // --- NAVİGASYON ---
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

    scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

    // --- SONUÇ VE KAYIT ---
    async finishTest(isTimeout = false) {
        if (this.timerInterval) clearInterval(this.timerInterval);

        // İstatistikleri Hesapla
        const total = this.questions.length;
        const correctCount = Object.values(this.answers).filter(a => a.isCorrect).length;
        const wrongCount = Object.values(this.answers).filter(a => a.isCorrect === false).length; // Boşları sayma
        const emptyCount = total - (correctCount + wrongCount);
        const score = Math.round((correctCount / total) * 100);

        // Sınav Modundaysa: Şimdi tüm cevapları kontrol et ve göster
        if (this.mode === 'exam') {
            this.mode = 'practice'; // Artık inceleme moduna geç
            this.renderCurrentQuestion(); // Mevcut soruyu güncelle
            alert("Sınav bitti! Şimdi cevaplarınızı ve çözümleri inceleyebilirsiniz.");
        }

        // Modalı Göster
        if (this.ui.scoreDisplay) this.ui.scoreDisplay.innerText = `%${score}`;
        let msg = isTimeout ? "Süre Doldu! " : "";
        msg += score >= 70 ? "Tebrikler, başarılı!" : "Biraz daha çalışmalısın.";
        if (this.ui.resultText) this.ui.resultText.innerText = msg;
        if (this.ui.modal) this.ui.modal.style.display = 'flex';

        // Veritabanına Kaydet
        await this.saveExamResult({ score, correctCount, wrongCount, emptyCount, total });
    }

    async saveExamResult(stats) {
        if (!auth.currentUser) return;

        const categoryBreakdown = {};
        this.questions.forEach(q => {
            const cat = q.category || 'Genel';
            if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { total: 0, correct: 0 };
            categoryBreakdown[cat].total++;
            const ans = this.answers[q.id];
            if (ans && ans.isCorrect) categoryBreakdown[cat].correct++;
        });

        try {
            await addDoc(collection(db, `users/${auth.currentUser.uid}/exam_results`), {
                examId: this.examId || 'custom',
                examTitle: document.title || 'Test',
                score: stats.score,
                correct: stats.correctCount,
                wrong: stats.wrongCount,
                empty: stats.emptyCount,
                total: stats.total,
                categoryStats: categoryBreakdown,
                completedAt: serverTimestamp(),
                mode: this.mode
            });
        } catch (e) { console.error("Kayıt hatası:", e); }
    }

    // --- YARDIMCILAR ---
    async saveWrongAnswer(qId, qData) {
        try {
            const ref = doc(db, `users/${auth.currentUser.uid}/wrongs/${qId}`);
            await setDoc(ref, {
                questionId: qId,
                text: qData.text.substring(0, 100) + "...",
                category: qData.category || 'Genel',
                lastAttempt: serverTimestamp(),
                count: increment(1)
            }, { merge: true });
        } catch (e) { console.error(e); }
    }

    updateCounters() {
        const correct = Object.values(this.answers).filter(a => a.isCorrect).length;
        const wrong = Object.values(this.answers).filter(a => a.isCorrect === false).length;
        const answered = Object.keys(this.answers).length;

        if (this.ui.trueVal) this.ui.trueVal.innerText = correct;
        if (this.ui.falseVal) this.ui.falseVal.innerText = wrong;
        if (this.ui.remainVal) this.ui.remainVal.innerText = this.questions.length - answered;
    }

    async loadUserFavorites() {
        if (!auth.currentUser) return;
        try {
            const snap = await getDocs(collection(db, `users/${auth.currentUser.uid}/favorites`));
            snap.forEach(doc => this.favorites.add(doc.id));
        } catch (e) { }
    }

    async toggleFavorite(qId) {
        if (!auth.currentUser) return alert("Giriş yapmalısınız.");
        const btn = document.querySelector(`#q-${qId} .fav-btn`);
        const ref = doc(db, `users/${auth.currentUser.uid}/favorites/${qId}`);

        if (this.favorites.has(qId)) {
            this.favorites.delete(qId);
            btn.innerText = '☆';
            btn.classList.remove('active');
            await deleteDoc(ref);
        } else {
            this.favorites.add(qId);
            btn.innerText = '★';
            btn.classList.add('active');
            const q = this.questions.find(i => i.id === qId);
            await setDoc(ref, {
                questionId: q.id,
                text: q.text,
                category: q.category,
                addedAt: serverTimestamp()
            });
        }
    }

    openReportModal(qId) {
        const desc = prompt("Hata bildiriminiz nedir?");
        if (desc && auth.currentUser) {
            addDoc(collection(db, "reports"), {
                questionId: qId,
                userId: auth.currentUser.uid,
                description: desc,
                status: "pending",
                createdAt: serverTimestamp()
            });
            alert("Bildiriminiz alındı.");
        }
    }

    setupMobileGestures() {
        let touchstartX = 0;
        let touchendX = 0;
        this.container.addEventListener('touchstart', e => touchstartX = e.changedTouches[0].screenX);
        this.container.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            if (touchendX < touchstartX - 50) this.nextQuestion();
            if (touchendX > touchstartX + 50) this.prevQuestion();
        });
    }
}