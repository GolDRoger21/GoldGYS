import { db, auth } from "./firebase-config.js";
import { doc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class TestEngine {
    constructor(containerId, questionsData, options = {}) {
        this.container = document.getElementById(containerId);
        this.questions = questionsData;
        this.options = options; // { examId: '...', mode: 'quiz' }
        this.answers = {}; 
        this.currentScore = { correct: 0, wrong: 0 };
        
        // HTML'deki sayaç elementlerini bul
        this.ui = {
            trueVal: document.getElementById('trueVal'),
            falseVal: document.getElementById('falseVal'),
            remainVal: document.getElementById('remainVal'),
            resultModal: document.getElementById('resultModal')
        };

        if (!this.container) return console.error("Test container bulunamadı!");
        this.init();
    }

    init() {
        this.renderQuestions();
        this.updateCounters();
        console.log("✅ Gelişmiş Test Motoru Başlatıldı");
    }

    renderQuestions() {
        this.container.innerHTML = '';
        
        if (this.questions.length === 0) {
            this.container.innerHTML = '<div class="alert alert-warning text-center">Bu testte henüz soru bulunmamaktadır.</div>';
            return;
        }

        this.questions.forEach((q, index) => {
            const card = document.createElement('article');
            card.className = 'soru-kart';
            card.id = `q-card-${q.id}`;
            card.setAttribute('data-id', q.id);

            // 1. Öncüllü Soru Kontrolü
            let onculluHTML = '';
            if (q.type === 'oncullu' && q.onculler) {
                onculluHTML = '<ul class="oncullu-liste">';
                q.onculler.forEach(o => onculluHTML += `<li>${o}</li>`);
                onculluHTML += '</ul>';
                if(q.questionRoot) onculluHTML += `<p class="soru-kok-vurgu">${q.questionRoot}</p>`;
            }

            // 2. Şıklar (Dinamik Oluşturma)
            let optionsHTML = '<div class="siklar-alani">';
            // Eğer options bir Array ise (Admin'den gelen format) veya Map ise (Eski format) kontrol et
            const opts = Array.isArray(q.options) ? q.options : 
                         Object.keys(q.options).map(key => ({ id: key, text: q.options[key] }));

            opts.forEach(opt => {
                optionsHTML += `
                    <button class="sik-btn" id="btn-${q.id}-${opt.id}" 
                        onclick="window.testInstance.handleAnswer('${q.id}', '${opt.id}', '${q.correctAnswer}')">
                        <div class="sik-harf">${opt.id}</div>
                        <div class="sik-metin">${opt.text}</div>
                    </button>`;
            });
            optionsHTML += '</div>';

            // 3. Gelişmiş Çözüm Alanı (Gizli)
            const sol = q.solution || {};
            const solutionHTML = `
                <div class="cozum-container" id="sol-${q.id}" style="display:none;">
                    <div class="cozum-header">💡 Detaylı Çözüm & Analiz</div>
                    <div class="cozum-content text-justify-custom">
                        ${sol.dayanak ? `<p><strong>📘 Dayanak:</strong> ${sol.dayanak}</p>` : ''}
                        ${sol.analiz ? `<p><strong>📝 Analiz:</strong> ${sol.analiz}</p>` : ''}
                        ${sol.tuzak ? `<div class="tuzak-kutu"><strong>⚠️ Sınav Tuzağı:</strong> ${sol.tuzak}</div>` : ''}
                        ${sol.hap ? `<div class="hap-kutu"><strong>💊 Hap Bilgi:</strong> ${sol.hap}</div>` : ''}
                        ${(!sol.dayanak && !sol.analiz) ? `<p>${typeof sol === 'string' ? sol : 'Çözüm detayları eklenmemiş.'}</p>` : ''}
                    </div>
                    <div class="soru-araclari mt-3 text-end border-top pt-2">
                        <button class="btn btn-sm btn-outline-warning me-2" onclick="window.testInstance.toggleFavorite('${q.id}')">⭐ Favorilere Ekle</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.testInstance.reportQuestion('${q.id}')">🚩 Hata Bildir</button>
                    </div>
                </div>
            `;

            // Kart İçeriği
            card.innerHTML = `
                <div class="kart-header">
                    <span class="soru-no">SORU ${index + 1}</span>
                    <span class="badge bg-light text-dark">${q.category || 'Genel'}</span>
                </div>
                <div class="soru-metni text-justify-custom">
                    ${q.text}
                    ${onculluHTML}
                </div>
                ${optionsHTML}
                ${solutionHTML}
            `;

            this.container.appendChild(card);
        });
    }

    handleAnswer(qId, selectedId, correctId) {
        if (this.answers[qId]) return; // Zaten cevaplanmış

        this.answers[qId] = selectedId;
        const card = document.getElementById(`q-card-${qId}`);
        const solutionBox = document.getElementById(`sol-${qId}`);
        
        // Butonları bul
        const btnSelected = document.getElementById(`btn-${qId}-${selectedId}`);
        const btnCorrect = document.getElementById(`btn-${qId}-${correctId}`);

        if (selectedId === correctId) {
            btnSelected.classList.add('correct');
            this.currentScore.correct++;
        } else {
            btnSelected.classList.add('wrong');
            if(btnCorrect) btnCorrect.classList.add('correct'); // Doğruyu göster
            this.currentScore.wrong++;
        }

        // Şıkları kilitle
        card.querySelectorAll('.sik-btn').forEach(btn => btn.classList.add('disabled'));
        
        // Çözümü aç
        if(solutionBox) {
            solutionBox.style.display = 'block';
            solutionBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        this.updateCounters();
    }

    updateCounters() {
        if(this.ui.trueVal) this.ui.trueVal.innerText = this.currentScore.correct;
        if(this.ui.falseVal) this.ui.falseVal.innerText = this.currentScore.wrong;
        
        const remaining = this.questions.length - (this.currentScore.correct + this.currentScore.wrong);
        if(this.ui.remainVal) this.ui.remainVal.innerText = remaining;
    }

    // --- ÖĞRENCİ ARAÇLARI (Favori & Hata Bildirimi) ---

    async toggleFavorite(qId) {
        if (!auth.currentUser) return alert("Favorilere eklemek için giriş yapmalısınız.");
        
        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await updateDoc(userRef, {
                favorites: arrayUnion(qId) // Soru ID'sini kullanıcının favori dizisine ekle
            });
            alert("Soru favorilere eklendi! ⭐");
        } catch (error) {
            console.error(error);
            alert("Favori işlemi başarısız.");
        }
    }

    async reportQuestion(qId) {
        const reason = prompt("Hata nedir? (Örn: Cevap anahtarı yanlış, Yazım hatası...)");
        if (!reason) return;

        try {
            await addDoc(collection(db, "reports"), {
                questionId: qId,
                userId: auth.currentUser ? auth.currentUser.uid : 'anonymous',
                reason: reason,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            alert("Geri bildiriminiz için teşekkürler! İncelenecektir. 👍");
        } catch (error) {
            console.error(error);
            alert("Bildirim gönderilemedi.");
        }
    }
}

// Global erişim için (HTML onclick'ler çalışsın diye)
window.TestEngine = TestEngine;