import { auth, db, functions } from "./firebase-config.js";
import { showConfirm, showToast } from "./notifications.js";
import {
    doc, setDoc, addDoc, collection, serverTimestamp, increment, deleteDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { WrongSummaryService } from "./wrong-summary-service.js";
import { CacheManager } from "./cache-manager.js";
import { USER_CACHE_KEYS } from "./cache-keys.js";

const TEST_ENGINE_CACHE_INVALIDATION = Object.freeze({
    examCompletion: (uid) => [
        USER_CACHE_KEYS.examResultsCollection(uid),
        USER_CACHE_KEYS.dashboardStats(uid)
    ],
    favorites: (uid) => [
        USER_CACHE_KEYS.userFavorites(uid)
    ]
});

export class TestEngine {
    constructor(containerId, questionsData, options = {}) {
        this.container = document.getElementById(containerId);
        this.questions = questionsData;
        this.questionLookup = new Map(this.questions.map((question) => [question.id, question]));
        this.options = options;

        // Ayarlar
        this.examId = options.examId || 'custom_practice';
        this.examTitle = options.title || 'Genel Test';
        this.topicId = options.topicId || null;
        this.topicTitle = options.topicTitle || null;
        const rawMode = options.mode || 'practice';
        this.mode = rawMode === 'learning' ? 'practice' : rawMode; // 'exam' (Sınav) veya 'practice' (Çalışma)
        this.duration = options.duration || 0; // Dakika cinsinden
        this.deferWrongWrites = Boolean(options.deferWrongWrites);
        this.persistPracticeResults = Boolean(options.persistPracticeResults);
        this.onQuestionAnswered = typeof options.onQuestionAnswered === 'function' ? options.onQuestionAnswered : null;
        this.onFinish = typeof options.onFinish === 'function' ? options.onFinish : null;

        // Durum Değişkenleri
        this.currentIndex = 0;
        this.answers = options.initialAnswers ? { ...options.initialAnswers } : {}; // { qId: { selected: 'A', isCorrect: true, timeSpent: 12 } }
        this.favorites = new Set();
        this.timerInterval = null;
        this.remainingTime = this.duration * 60;
        this.startTime = Date.now();
        this.pendingWrongAnswers = new Map();
        this.pendingFavoriteChanges = new Map();
        this.flushWrongAnswersPromise = null;
        this.flushFavoriteChangesPromise = null;

        // UI Elementleri (HTML'de bu ID'lerin olduğundan emin olacağız)
        this.ui = {
            trueVal: document.getElementById('trueVal'),
            falseVal: document.getElementById('falseVal'),
            remainVal: document.getElementById('remainVal'),
            timerDisplay: document.getElementById('timerDisplay'),
            modal: document.getElementById('resultModal'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            resultText: document.getElementById('resultText')
        };

        // Global erişim (HTML onclick için)
        window.testEngine = this;

        this.init();
    }

    async init() {
        this.renderAllQuestions();
        this.updateCounters();
        this.setupLifecycleHandlers();

        // Sınav Moduysa Sayacı Başlat
        if (this.mode === 'exam') {
            this.prepareExamTimer();
            this.startTimer();
        } else {
            // Çalışma modunda sayaç gizlenebilir
            if (this.ui.timerDisplay) this.ui.timerDisplay.parentElement.style.display = 'none';
        }
    }

    setupLifecycleHandlers() {
        const tryFlush = () => {
            if (this.pendingWrongAnswers.size > 0) {
                void this.flushWrongAnswers();
            }
            if (this.pendingFavoriteChanges.size > 0) {
                void this.flushFavoriteChanges();
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                tryFlush();
            }
        });

        window.addEventListener('pagehide', tryFlush);
        window.addEventListener('beforeunload', tryFlush);
    }

    getQuestionById(questionId) {
        return this.questionLookup.get(questionId) || null;
    }

    // --- SAYAÇ YÖNETİMİ ---
    startTimer() {
        this.updateTimerDisplay(); // İlk render
        this.timerInterval = setInterval(() => {
            this.remainingTime--;
            this.updateTimerDisplay();

            if (this.remainingTime <= 0) {
                clearInterval(this.timerInterval);
                showToast("Süre doldu! Sınav otomatik olarak bitiriliyor.", "warning", { duration: 4500 });
                this.finishTest(true);
            }
        }, 1000);
    }

    prepareExamTimer() {
        if (this.remainingTime <= 0) {
            if (this.duration <= 0) {
                this.remainingTime = Math.round(this.questions.length * 75);
            } else {
                this.remainingTime = Math.round(this.duration * 60);
            }
        }
        // Sınav modunda çözüm alanı gizli kalır, sayaç görünür
        if (this.ui.timerDisplay) this.ui.timerDisplay.parentElement.style.display = 'flex';
    }

    setMode(nextMode) {
        const normalizedMode = nextMode === 'learning' ? 'practice' : nextMode;
        if (normalizedMode === this.mode) return;

        this.mode = normalizedMode;

        if (this.mode === 'exam') {
            this.prepareExamTimer();
            if (!this.timerInterval) {
                this.startTimer();
            }
        } else {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            if (this.ui.timerDisplay) this.ui.timerDisplay.parentElement.style.display = 'none';
        }

        this.applyModeToAllQuestions();
    }

    updateTimerDisplay() {
        if (!this.ui.timerDisplay) return;
        const m = Math.floor(this.remainingTime / 60);
        const s = this.remainingTime % 60;
        this.ui.timerDisplay.innerText = `${m}:${s < 10 ? '0' + s : s}`;

        // Son 5 dakika uyarısı
        if (this.remainingTime < 300) {
            this.ui.timerDisplay.style.color = 'var(--color-danger)';
            this.ui.timerDisplay.classList.add('pulse-anim');
        }
    }

    // --- RENDER İŞLEMLERİ ---
    renderAllQuestions() {
        this.container.innerHTML = '';

        this.questions.forEach((question, index) => {
            const card = this.createQuestionCard(question, index);
            this.container.appendChild(card);

            if (this.answers[question.id]) {
                this.restoreAnswerState(question.id);
            }
        });
    }

    createQuestionCard(q, index) {
        const article = document.createElement('article');
        article.className = 'soru-kart fade-in'; // CSS animasyonu için class
        article.id = `q-${q.id}`;
        article.dataset.id = q.id;

        // 1. Soru Metni ve Öncüller
        let contentHTML = `<div class="soru-metni">${q.text}</div>`;

        if (q.type === 'oncullu' && q.onculler && q.onculler.length > 0) {
            const listItems = q.onculler.map((o, i) => `<li><span class="oncul-no">${['I', 'II', 'III', 'IV', 'V'][i]}</span> ${o}</li>`).join('');
            const questionText = q.text ? `<div class="soru-metni">${q.text}</div>` : '';
            contentHTML = `
                ${questionText}
                <ul class="oncullu-liste">${listItems}</ul>
                ${q.questionRoot ? `<p class="soru-kok-vurgu">${q.questionRoot}</p>` : ''}
            `;
        }

        // 2. Şıklar
        const optionsHTML = q.options.map(opt => `
            <button class="sik-btn" data-opt="${opt.id}" onclick="window.testEngine.handleAnswer('${q.id}', '${opt.id}')">
                <div class="sik-harf">${opt.id}</div>
                <div class="sik-metin">${opt.text}</div>
            </button>
        `).join('');

        // 3. Detaylı Çözüm Alanı (Veri Modelindeki 'solution' objesi)
        const sol = q.solution || {};
        const leg = q.legislationRef || {};

        // Çözüm HTML'i (Başlangıçta display:none)
        const solutionHTML = `
            <div class="cozum-container" id="sol-${q.id}" style="display:none;">
                <div class="cozum-header">
                    <span class="icon">💡</span> Detaylı Çözüm ve Analiz
                </div>
                
                ${leg.code ? `
                <div class="mevzuat-badge">
                    <span class="icon">⚖️</span> 
                    <strong>${leg.code} Sayılı Kanun</strong> - Madde ${leg.article}
                </div>` : ''}

                <div class="cozum-body">
                    ${sol.analiz ? `<p class="analiz-text">${sol.analiz}</p>` : ''}
                    
                    ${sol.dayanakText ? `
                    <div class="dayanak-kutu">
                        <strong>📜 Mevzuat Dayanağı:</strong>
                        <p>${sol.dayanakText}</p>
                    </div>` : ''}

                    <div class="ipucu-grid">
                        ${sol.hap ? `
                        <div class="hap-kutu">
                            <div class="box-title">💊 Hap Bilgi</div>
                            <p>${sol.hap}</p>
                        </div>` : ''}
                        
                        ${sol.tuzak ? `
                        <div class="tuzak-kutu">
                            <div class="box-title">⚠️ Sınav Tuzağı</div>
                            <p>${sol.tuzak}</p>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        `;

        article.innerHTML = `
            <div class="kart-header">
                <span class="soru-badge">Soru ${index + 1} / ${this.questions.length}</span>
                <div class="kart-actions">
                    <button class="btn-icon fav-btn ${this.favorites.has(q.id) ? 'active' : ''}" 
                            onclick="window.testEngine.toggleFavorite('${q.id}')" 
                            title="Favorilere Ekle">
                        ${this.favorites.has(q.id) ? '★' : '☆'}
                    </button>
                    <button class="btn-icon report-btn" onclick="window.testEngine.openReportModal('${q.id}')" title="Hata Bildir">🚩</button>
                </div>
            </div>
            <div class="soru-icerik">
                ${contentHTML}
            </div>
            <div class="siklar-wrapper">
                ${optionsHTML}
            </div>
            ${solutionHTML}
        `;
        return article;
    }

    // --- CEVAPLAMA MANTIĞI ---
    handleAnswer(questionId, selectedOptionId) {
        const question = this.getQuestionById(questionId);
        if (!question) return;
        const isCorrect = (selectedOptionId === question.correctOption);

        if (this.mode === 'exam') {
            this.answers[questionId] = {
                selected: selectedOptionId,
                isCorrect: isCorrect,
                category: question.category || 'Genel',
                timestamp: Date.now(),
                synced: false
            };
            this.markSelected(questionId, selectedOptionId);
            this.updateCounters();
            if (this.onQuestionAnswered) {
                this.onQuestionAnswered({ questionId, selectedOptionId, isCorrect, question });
            }
            return;
        }

        // Eğer zaten cevaplandıysa işlem yapma
        if (this.answers[questionId]) return;

        // Cevabı Kaydet
        this.answers[questionId] = {
            selected: selectedOptionId,
            isCorrect: isCorrect,
            category: question.category || 'Genel',
            timestamp: Date.now(),
            synced: false
        };

        // Çalışma Modu: Anlık geri bildirim ve çözüm gösterimi
        this.showFeedback(questionId, selectedOptionId, isCorrect, question.correctOption);

        if (!this.deferWrongWrites) {
            const uid = this.getCurrentUid();
            // Yanlışsa hemen DB'ye işle (Kullanıcı bekletilmez, arka planda çalışır)
            if (!isCorrect && uid) {
                this.saveWrongAnswer(questionId, question);
            }

            if (isCorrect && uid) {
                this.clearWrongAnswer(questionId);
            }

            if (this.answers[questionId]) {
                this.answers[questionId].synced = true;
            }
        }

        this.updateCounters();
        if (this.onQuestionAnswered) {
            this.onQuestionAnswered({ questionId, selectedOptionId, isCorrect, question });
        }
    }

    showFeedback(qId, selectedId, isCorrect, correctId) {
        const card = document.getElementById(`q-${qId}`);
        if (!card) return;

        const buttons = card.querySelectorAll('.sik-btn');
        buttons.forEach(btn => {
            btn.classList.add('disabled'); // Tıklamayı engelle
            const optId = btn.dataset.opt;
            btn.querySelectorAll('.result-icon').forEach(icon => icon.remove());

            if (optId === selectedId) {
                btn.classList.add(isCorrect ? 'correct' : 'wrong');
                // İkon ekle
                btn.innerHTML += isCorrect ? ' <span class="result-icon">✓</span>' : ' <span class="result-icon">✗</span>';
            }

            // Yanlış yapıldıysa doğru cevabı da göster
            if (!isCorrect && optId === correctId) {
                btn.classList.add('correct-ghost'); // Doğru cevap olduğunu belli et
                btn.innerHTML += ' <span class="result-icon">✓</span>';
            }
        });

        // Çözümü Aç (Animasyonlu)
        const solDiv = document.getElementById(`sol-${qId}`);
        if (solDiv) {
            solDiv.style.display = 'block';
            // Hafif bir scroll ile çözümü göster
            setTimeout(() => {
                solDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    }

    applyModeToAllQuestions() {
        this.questions.forEach(question => {
            if (this.mode === 'exam') {
                this.resetQuestionForExam(question.id);
            } else {
                const ans = this.answers[question.id];
                if (ans) {
                    this.showFeedback(question.id, ans.selected, ans.isCorrect, question.correctOption);
                }
            }
        });
    }

    resetQuestionForExam(qId) {
        const card = document.getElementById(`q-${qId}`);
        if (!card) return;
        const buttons = card.querySelectorAll('.sik-btn');
        buttons.forEach(btn => {
            btn.classList.remove('correct', 'wrong', 'correct-ghost', 'disabled', 'selected');
            btn.querySelectorAll('.result-icon').forEach(icon => icon.remove());
        });
        const solDiv = document.getElementById(`sol-${qId}`);
        if (solDiv) solDiv.style.display = 'none';

        const ans = this.answers[qId];
        if (ans) {
            this.markSelected(qId, ans.selected);
        }
    }

    markSelected(qId, selectedId) {
        const card = document.getElementById(`q-${qId}`);
        const buttons = card.querySelectorAll('.sik-btn');

        buttons.forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.opt === selectedId) {
                btn.classList.add('selected'); // Sadece mavi çerçeve/koyu renk
            }
        });
    }

    restoreAnswerState(qId) {
        const ans = this.answers[qId];
        const q = this.getQuestionById(qId);
        if (!q) return;

        if (this.mode !== 'exam') {
            this.showFeedback(qId, ans.selected, ans.isCorrect, q.correctOption);
        } else {
            this.markSelected(qId, ans.selected);
        }
    }

    // --- NAVİGASYON ---
    nextQuestion() {
        if (this.currentIndex < this.questions.length - 1) {
            this.currentIndex++;
            this.renderAllQuestions();
            this.scrollToTop();
        }
    }

    prevQuestion() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.renderAllQuestions();
            this.scrollToTop();
        }
    }

    async finishConfirm() {
        const answeredCount = Object.keys(this.answers).length;
        const total = this.questions.length;
        const empty = total - answeredCount;

        let msg = "Testi bitirmek istediğinize emin misiniz?";
        if (empty > 0) msg += ` ${empty} soruyu boş bıraktınız.`;

        const shouldFinish = await showConfirm(msg, {
            title: "Testi Bitir",
            confirmText: "Testi Bitir",
            cancelText: "Devam Et"
        });
        if (shouldFinish) {
            this.finishTest();
        }
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- SONUÇ HESAPLAMA VE KAYIT ---
    async finishTest(isTimeout = false) {
        if (this.timerInterval) clearInterval(this.timerInterval);

        const modeAtFinish = this.mode;

        // İstatistikleri Hesapla
        const total = this.questions.length;
        const correctCount = Object.values(this.answers).filter(a => a.isCorrect).length;
        const wrongCount = Object.values(this.answers).filter(a => a.isCorrect === false).length;
        const emptyCount = total - (correctCount + wrongCount);
        const score = Math.round((correctCount / total) * 100);
        const timeSpent = Math.floor((Date.now() - this.startTime) / 1000); // Saniye

        // Sınav Modundaysa: Modu 'practice' yap ve kullanıcıya inceleme fırsatı ver
        if (this.mode === 'exam') {
            this.mode = 'practice'; // Artık çözümleri görebilir
            this.showExamInfoModal("Sınav tamamlandı. Sonuçlarınız kaydedildi. Şimdi cevaplarınızı ve çözümleri inceleyebilirsiniz.");
            this.renderAllQuestions(); // Mevcut soruları güncelle (renkler ve çözümler gelsin)
        }

        // UI Güncelle (Modal)
        if (this.ui.scoreDisplay) this.ui.scoreDisplay.innerText = `%${score}`;
        if (document.getElementById('resultCorrect')) document.getElementById('resultCorrect').innerText = correctCount;
        if (document.getElementById('resultWrong')) document.getElementById('resultWrong').innerText = wrongCount;

        let msg = isTimeout ? "Süre Doldu! " : "";
        if (score >= 70) msg += "Tebrikler, başarılı bir performans! 🎉";
        else if (score >= 50) msg += "Fena değil, ama biraz daha tekrar yapmalısın. 👍";
        else msg += "Konu eksiklerin var, çalışmaya devam etmelisin. 💪";

        if (this.ui.resultText) this.ui.resultText.innerText = msg;
        if (this.ui.modal) this.ui.modal.style.display = 'flex';
        const returnBtn = document.getElementById('btnReturnTopic');
        if (returnBtn) returnBtn.style.display = 'inline-flex';

        if (this.onFinish) {
            await this.onFinish({ answers: this.answers, isTimeout });
        }

        // Test boyunca biriken favori değişikliklerini tek seferde işle
        await this.flushFavoriteChanges();

        // Veritabanına Kaydet
        await this.saveExamResult({
            score, correctCount, wrongCount, emptyCount, total, timeSpent, mode: modeAtFinish
        });
    }

    calculateScore() {
        const total = this.questions.length;
        if (total === 0) return 0;
        const correctCount = Object.values(this.answers).filter(a => a.isCorrect).length;
        return Math.round((correctCount / total) * 100);
    }

    showExamInfoModal(message) {
        const modal = document.getElementById('examInfoModal');
        const messageEl = document.getElementById('examInfoMessage');
        const closeBtn = document.getElementById('examInfoClose');

        if (!modal || !messageEl) {
            showToast(message, "info", { duration: 5000 });
            return;
        }

        messageEl.textContent = message;
        modal.style.display = 'flex';

        const close = () => {
            modal.style.display = 'none';
            modal.removeEventListener('click', handleOverlayClick);
            if (closeBtn) closeBtn.removeEventListener('click', close);
        };

        const handleOverlayClick = (event) => {
            if (event.target === modal) close();
        };

        if (closeBtn) closeBtn.addEventListener('click', close);
        modal.addEventListener('click', handleOverlayClick);
    }

    getCurrentUid() {
        return auth.currentUser?.uid || null;
    }

    async invalidateCaches(cacheKeys = []) {
        if (!Array.isArray(cacheKeys) || cacheKeys.length === 0) return;
        await Promise.all(cacheKeys.map((cacheKey) => CacheManager.deleteData(cacheKey)));
    }

    getUserCacheInvalidationKeys(scope, uid = this.getCurrentUid()) {
        if (!uid) return [];
        const resolver = TEST_ENGINE_CACHE_INVALIDATION[scope];
        return typeof resolver === 'function' ? resolver(uid) : [];
    }

    async invalidateUserCaches(scope) {
        await this.invalidateCaches(this.getUserCacheInvalidationKeys(scope));
    }

    async saveExamResult(stats) {
        const uid = this.getCurrentUid();
        if (!uid) return;

        // Maliyet optimizasyonu: practice modunda her seansı kalıcı exam_result olarak yazmak yerine
        // varsayılan olarak sadece exam modunu yazıyoruz. İstenirse options.persistPracticeResults=true ile açılabilir.
        if ((stats.mode || this.mode) === 'practice' && !this.persistPracticeResults) {
            return;
        }

        // Kategori bazlı analiz
        const categoryBreakdown = {};
        this.questions.forEach(q => {
            const cat = q.category || 'Genel';
            if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { total: 0, correct: 0, wrong: 0, empty: 0 };

            const ans = this.answers[q.id];
            if (ans) {
                if (ans.isCorrect) categoryBreakdown[cat].correct++;
                else categoryBreakdown[cat].wrong++;
            } else {
                categoryBreakdown[cat].empty++;
            }
            categoryBreakdown[cat].total++;
        });

        try {
            // 1. Sınav Sonucunu Kaydet
            await addDoc(collection(db, `users/${uid}/exam_results`), {
                examId: this.examId,
                examTitle: this.examTitle,
                topicId: this.topicId,
                topicTitle: this.topicTitle,
                score: stats.score,
                correct: stats.correctCount,
                wrong: stats.wrongCount,
                empty: stats.emptyCount,
                total: stats.total,
                timeSpentSeconds: stats.timeSpent,
                categoryStats: categoryBreakdown,
                completedAt: serverTimestamp(),
                mode: stats.mode || this.mode
            });

            // Sınav sonucu eklendiği için lokal analitik ve istatistik listesi (cache) düşürülür
            await this.invalidateUserCaches('examCompletion'); // Dashboard özetini de düşür


            // 2. Yanlış Yapılanları 'wrong_summaries' koleksiyonuna işle (Sınav modunda toplu işlem)
            // Practice modunda anlık işleniyor, Exam modunda burada işlenmeli.
            // Ancak basitlik adına: Practice modunda anlık işledik. Exam modunda ise burada döngüyle işleyelim.
            // Not: Practice modunda zaten işlendiği için tekrar işlememek lazım.

            // Eğer mod 'exam' idiyse (init'te set edilen), yanlışları şimdi kaydet
            // (this.mode finishTest başında practice yapıldığı için orijinal modu kontrol etmek zor olabilir, 
            // bu yüzden answers üzerinden gidilebilir veya constructor'daki mode saklanabilir. 
            // Şimdilik basitçe: Her yanlış cevap için update yapalım, firestore increment kullanıldığı için sorun olmaz)

            const wrongAnswers = Object.keys(this.answers).filter(qId => !this.answers[qId].isCorrect && !this.answers[qId].synced);
            wrongAnswers.forEach(qId => {
                const q = this.getQuestionById(qId);
                this.saveWrongAnswer(qId, q);
            });

            // YENİ: Optimistic Cache Update için listeyi hazırla
            const pendingList = Array.from(this.pendingWrongAnswers.values());

            await this.flushWrongAnswers();

            // Cache'i güncelle (Firestore yazımından bağımsız, UI için)
            if (pendingList.length > 0) {
                WrongSummaryService.updateCacheWithNewWrongs(uid, pendingList)
                    .catch(err => console.error("Cache update silent fail:", err));
            }

            wrongAnswers.forEach(qId => {
                if (this.answers[qId]) {
                    this.answers[qId].synced = true;
                }
            });

            const correctAnswers = Object.keys(this.answers).filter(qId => this.answers[qId].isCorrect);
            const clearPromises = correctAnswers.map(qId => this.clearWrongAnswer(qId));
            await Promise.all(clearPromises);
        } catch (e) {
            console.error("Sonuç kaydetme hatası:", e);
        }
    }

    // --- YARDIMCI FONKSİYONLAR ---

    // Yanlış yapılan soruyu havuza atar veya sayacını artırır
    async saveWrongAnswer(qId, qData) {
        if (!this.getCurrentUid()) return;
        const safeText = qData?.text ? qData.text.substring(0, 150) + "..." : "";
        const category = qData?.category || 'Genel';
        const existing = this.pendingWrongAnswers.get(qId);
        if (existing) {
            existing.count += 1;
            return;
        }

        this.pendingWrongAnswers.set(qId, {
            questionId: qId,
            text: safeText,
            category,
            examId: this.examId,
            count: 1
        });

        if (!this.deferWrongWrites && this.pendingWrongAnswers.size >= 20) {
            await this.flushWrongAnswers();
        }
    }

    async clearWrongAnswer(qId) {
        return;
    }

    async flushWrongAnswers() {
        if (this.flushWrongAnswersPromise) return this.flushWrongAnswersPromise;

        this.flushWrongAnswersPromise = this._flushWrongAnswersInternal();
        try {
            return await this.flushWrongAnswersPromise;
        } finally {
            this.flushWrongAnswersPromise = null;
        }
    }

    async _flushWrongAnswersInternal() {
        const uid = this.getCurrentUid();
        if (!uid || this.pendingWrongAnswers.size === 0) return;
        const dateKey = new Date().toISOString().slice(0, 10);
        const ref = doc(db, `users/${uid}/wrong_summaries/${dateKey}`);
        const updates = {
            updatedAt: serverTimestamp()
        };
        const questionIds = [];

        this.pendingWrongAnswers.forEach((payload, qId) => {
            updates[`wrongCounts.${qId}`] = increment(payload.count);
            updates[`questionMeta.${qId}`] = {
                questionId: payload.questionId,
                text: payload.text,
                category: payload.category,
                examId: payload.examId,
                lastAttempt: serverTimestamp()
            };
            questionIds.push(qId);
        });

        if (questionIds.length > 0) {
            updates.questionIds = arrayUnion(...questionIds);
        }

        try {
            await setDoc(ref, updates, { merge: true });
            this.pendingWrongAnswers.clear();
        } catch (e) {
            console.error("Yanlış soru toplu kaydı hatası:", e);
        }
    }

    updateCounters() {
        const correct = Object.values(this.answers).filter(a => a.isCorrect).length;
        const wrong = Object.values(this.answers).filter(a => a.isCorrect === false).length;
        const answered = Object.keys(this.answers).length;

        if (this.ui.trueVal) this.ui.trueVal.innerText = correct;
        if (this.ui.falseVal) this.ui.falseVal.innerText = wrong;
        if (this.ui.remainVal) this.ui.remainVal.innerText = this.questions.length - answered;
    }

    async flushFavoriteChanges() {
        if (this.flushFavoriteChangesPromise) return this.flushFavoriteChangesPromise;

        this.flushFavoriteChangesPromise = this._flushFavoriteChangesInternal();
        try {
            return await this.flushFavoriteChangesPromise;
        } finally {
            this.flushFavoriteChangesPromise = null;
        }
    }

    async _flushFavoriteChangesInternal() {
        const uid = this.getCurrentUid();
        if (!uid || this.pendingFavoriteChanges.size === 0) return;

        const operations = [];
        this.pendingFavoriteChanges.forEach((isFavorite, qId) => {
            const ref = doc(db, `users/${uid}/favorites/${qId}`);
            if (!isFavorite) {
                operations.push(deleteDoc(ref));
                return;
            }

            const q = this.getQuestionById(qId);
            operations.push(setDoc(ref, {
                questionId: q?.id || qId,
                text: q?.text || '',
                category: q?.category || 'Genel',
                addedAt: serverTimestamp()
            }, { merge: true }));
        });

        try {
            await Promise.all(operations);
            this.pendingFavoriteChanges.clear();
            await this.invalidateUserCaches('favorites');
        } catch (error) {
            console.error("Favori değişikliklerini toplu kaydetme hatası:", error);
        }
    }

    async toggleFavorite(qId) {
        if (!this.getCurrentUid()) {
            showToast("Bu işlem için giriş yapmalısınız.", "error");
            return;
        }

        const btn = document.querySelector(`#q-${qId} .fav-btn`);

        if (this.favorites.has(qId)) {
            this.favorites.delete(qId);
            this.pendingFavoriteChanges.set(qId, false);
            if (btn) {
                btn.innerText = '☆';
                btn.classList.remove('active');
            }
            return;
        }

        this.favorites.add(qId);
        this.pendingFavoriteChanges.set(qId, true);
        if (btn) {
            btn.innerText = '★';
            btn.classList.add('active');
        }
    }

    openReportModal(qId) {
        const desc = prompt("Bu soruda ne gibi bir hata var? (Örn: Cevap yanlış, Yazım hatası)");
        if (desc && this.getCurrentUid()) {
            const submitReport = httpsCallable(functions, "submitReport");
            submitReport({
                questionId: qId,
                description: desc,
                type: "question_error",
                source: "question_modal"
            })
                .then(() => showToast("Bildiriminiz alındı. Teşekkürler!", "success"))
                .catch((error) => {
                    console.error("Bildirimi gönderme hatası:", error);
                    showToast(`Bildiriminiz gönderilemedi: ${error.message}`, "error");
                });
        }
    }

    setupMobileGestures() { }
}
