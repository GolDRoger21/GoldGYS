// public/js/test-engine.js
import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, addDoc, collection, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class TestEngine {
    constructor(containerId, questionsData) {
        this.container = document.getElementById(containerId);
        this.questions = questionsData;
        this.currentIndex = 0;
        this.answers = {}; // { questionId: { selected: "A", isCorrect: true } }
        this.favorites = new Set();
        
        // UI Elementleri (Senin HTML yapına uygun)
        this.ui = {
            trueVal: document.getElementById('trueVal'),
            falseVal: document.getElementById('falseVal'),
            remainVal: document.getElementById('remainVal'),
            modal: document.getElementById('resultModal'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            resultText: document.getElementById('resultText')
        };
        
        // Global erişim için (HTML onclick'ler için)
        window.testEngine = this;
        
        this.init();
    }

    async init() {
        await this.loadUserFavorites();
        this.renderAllQuestions();
        this.updateCounters();
    }

    // Kullanıcının favorilerini veritabanından çek
    async loadUserFavorites() {
        if (!auth.currentUser) return;
        try {
            // Basitlik için tüm favori ID'lerini bir kerede çekiyoruz
            // Gerçek uygulamada sayfalama yapılabilir
            const favRef = collection(db, `users/${auth.currentUser.uid}/favorites`);
            // Not: Collection'dan sadece ID'leri çekmek için getDocs kullanılmalı
            // Burada performans için basit tutuyoruz, detaylı sorgu gerekebilir.
        } catch (e) {
            console.warn("Favoriler yüklenemedi:", e);
        }
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
            // Soru kökü varsa ekle
            if (q.questionRoot) {
                contentHTML += `<p class="soru-kok-vurgu">${q.questionRoot}</p>`;
            }
        }

        // 2. Şıklar
        // q.options dizisini map ile dönüyoruz
        const optionsHTML = q.options.map(opt => `
            <button class="sik-btn" onclick="window.testEngine.handleAnswer('${q.id}', '${opt.id}')">
                <div class="sik-harf">${opt.id}</div>
                ${opt.text}
            </button>
        `).join('');

        // 3. Kart HTML Şablonu
        article.innerHTML = `
            <div class="kart-header">
                <span class="soru-no">SORU ${index + 1}</span>
                <div class="kart-actions" style="display:flex; gap:10px;">
                    <button class="btn-icon fav-btn" onclick="window.testEngine.toggleFavorite('${q.id}')" title="Favorilere Ekle" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">
                        ${this.favorites.has(q.id) ? '★' : '☆'}
                    </button>
                    <button class="btn-icon report-btn" onclick="window.testEngine.openReportModal('${q.id}')" title="Hata Bildir" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">
                        🚩
                    </button>
                </div>
            </div>
            
            <div class="soru-metni text-justify-custom">
                ${contentHTML}
            </div>
            
            <div class="siklar-alani">
                ${optionsHTML}
            </div>
            
            <div class="cozum-container" id="sol-${q.id}" style="display:none;">
                <div class="cozum-header">💡 Detaylı Analiz & Çözüm</div>
                <div class="cozum-content text-justify-custom">
                    ${q.solution.dayanak ? `<p><strong>⚖️ Dayanak:</strong> ${q.solution.dayanak}</p>` : ''}
                    <p><strong>🧠 Analiz:</strong> ${q.solution.analiz}</p>
                    ${q.solution.tuzak ? `<div class="tuzak-kutu"><strong>⚠️ Sınav Tuzağı:</strong> ${q.solution.tuzak}</div>` : ''}
                    ${q.solution.hap ? `<div class="hap-kutu"><strong>💊 Hap Bilgi:</strong> ${q.solution.hap}</div>` : ''}
                </div>
            </div>
        `;

        return article;
    }

    handleAnswer(questionId, selectedOptionId) {
        // Kartı bul
        const card = document.getElementById(`q-${questionId}`);
        if (card.dataset.answered === 'true') return; // Daha önce cevaplanmışsa dur

        const question = this.questions.find(q => q.id === questionId);
        const isCorrect = (selectedOptionId === question.correctOption);

        // Durumu kaydet
        this.answers[questionId] = { selected: selectedOptionId, isCorrect };
        card.dataset.answered = 'true';
        card.dataset.result = isCorrect ? 'correct' : 'wrong';

        // UI Güncelleme (Şık Renklendirme)
        const buttons = card.querySelectorAll('.sik-btn');
        buttons.forEach(btn => {
            btn.classList.add('disabled'); // Tıklamayı kapat
            const optId = btn.querySelector('.sik-harf').innerText;

            if (optId === selectedOptionId) {
                // Seçilen şıkkı boya
                btn.classList.add(isCorrect ? 'correct' : 'wrong');
            }
            
            // Eğer cevap yanlışsa, doğru olanı da göster
            if (!isCorrect && optId === question.correctOption) {
                btn.classList.add('correct');
            }
        });

        // Çözümü Göster
        const solDiv = document.getElementById(`sol-${questionId}`);
        if(solDiv) {
            solDiv.style.display = 'block';
            // Hafif bir animasyon efekti
            solDiv.animate([
                { opacity: 0, transform: 'translateY(-10px)' },
                { opacity: 1, transform: 'translateY(0)' }
            ], { duration: 300 });
        }

        // Sayaçları güncelle
        this.updateCounters();

        // (Opsiyonel) Firestore'a anlık istatistik gönderme eklenebilir
    }

    updateCounters() {
        const total = this.questions.length;
        const answeredCount = Object.keys(this.answers).length;
        const correctCount = Object.values(this.answers).filter(a => a.isCorrect).length;
        const wrongCount = Object.values(this.answers).filter(a => !a.isCorrect).length;

        if (this.ui.trueVal) this.ui.trueVal.innerText = correctCount;
        if (this.ui.falseVal) this.ui.falseVal.innerText = wrongCount;
        if (this.ui.remainVal) this.ui.remainVal.innerText = total - answeredCount;
    }

    // --- EKSTRA FONKSİYONLAR ---

    async toggleFavorite(questionId) {
        if (!auth.currentUser) return alert("Favorilere eklemek için giriş yapmalısınız.");
        
        const btn = document.querySelector(`#q-${questionId} .fav-btn`);
        const userFavRef = doc(db, `users/${auth.currentUser.uid}/favorites/${questionId}`);

        if (this.favorites.has(questionId)) {
            // Çıkar
            this.favorites.delete(questionId);
            btn.innerText = '☆';
            try { await deleteDoc(userFavRef); } catch(e) { console.error(e); }
        } else {
            // Ekle
            this.favorites.add(questionId);
            btn.innerText = '★';
            
            // Sorunun özet verisini kaydet ki sonra listede görünsün
            const q = this.questions.find(q => q.id === questionId);
            try {
                await setDoc(userFavRef, {
                    questionId: q.id,
                    text: q.text.substring(0, 150) + "...", // Kısaltılmış metin
                    category: q.category || "Genel",
                    addedAt: serverTimestamp()
                });
            } catch(e) { console.error("Fav ekleme hatası:", e); }
        }
    }

    openReportModal(questionId) {
        const desc = prompt("Hata bildiriminiz nedir? (Örn: Cevap anahtarı yanlış, Yazım hatası)");
        if (desc) {
            this.submitReport(questionId, desc);
        }
    }

    async submitReport(questionId, description) {
        if (!auth.currentUser) return alert("Bildirim için giriş yapmalısınız.");
        
        try {
            await addDoc(collection(db, "reports"), {
                questionId: questionId,
                userId: auth.currentUser.uid,
                description: description,
                status: "pending", // İncelenmeyi bekliyor
                createdAt: serverTimestamp()
            });
            alert("Geri bildiriminiz alındı. Teşekkürler!");
        } catch (error) {
            console.error("Rapor hatası:", error);
            alert("Bir hata oluştu.");
        }
    }

    finishTest() {
        const total = this.questions.length;
        const correctCount = Object.values(this.answers).filter(a => a.isCorrect).length;
        const score = Math.round((correctCount / total) * 100);

        if (this.ui.scoreDisplay) this.ui.scoreDisplay.innerText = `%${score}`;
        
        let msg = "Test tamamlandı.";
        if (score >= 90) msg = "Mükemmel! Konuya tamamen hakimsin.";
        else if (score >= 70) msg = "Başarılı. Ufak tekrarlar yeterli.";
        else msg = "Konuyu tekrar etmende fayda var.";

        if (this.ui.resultText) this.ui.resultText.innerText = msg;
        if (this.ui.modal) this.ui.modal.style.display = 'flex';
    }
}