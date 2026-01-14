import { db, auth } from "./firebase-config.js";
import { doc, setDoc, deleteDoc, addDoc, collection, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class TestEngine {
    /**
     * @param {string} containerId - Soruların basılacağı HTML elementinin ID'si
     * @param {Array} questionsData - Soru listesi
     * @param {string|null} examId - Hangi sınavın çözüldüğü (İstatistik için)
     */
    constructor(containerId, questionsData, examId = null) {
        this.container = document.getElementById(containerId);
        this.questions = questionsData;
        this.examId = examId;
        this.answers = {}; // Kullanıcının cevapları { soruId: 'A' }
        this.favorites = new Set();
        
        // UI Elementleri (HTML'de bu ID'lerin olması gerekir)
        this.ui = {
            trueVal: document.getElementById('trueVal'),
            falseVal: document.getElementById('falseVal'),
            remainVal: document.getElementById('remainVal'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            resultModal: document.getElementById('resultModal'),
            modalBody: document.querySelector('#resultModal .modal-body')
        };
        
        if (!this.container) {
            console.error(`TestEngine Hatası: '${containerId}' ID'li element bulunamadı.`);
            return;
        }

        this.init();
    }

    async init() {
        this.renderLoading();
        await this.loadUserFavorites();
        this.renderAllQuestions();
        this.updateCounters();
        console.log("✅ Test Motoru Başlatıldı");
    }

    renderLoading() {
        this.container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-muted);">
                <div class="loader-spinner" style="margin:0 auto 20px;"></div>
                <p>Sorular hazırlanıyor...</p>
            </div>`;
    }

    async loadUserFavorites() {
        if (!auth.currentUser) return;
        // Not: Gerçek uygulamada tüm favorileri çekmek yerine, 
        // sayfadaki soruların favori olup olmadığını kontrol etmek daha performanslıdır.
        // Şimdilik client-side yönetiyoruz.
    }

    renderAllQuestions() {
        this.container.innerHTML = ''; // Temizle

        if (!this.questions || this.questions.length === 0) {
            this.container.innerHTML = '<div class="card"><p style="padding:20px; text-align:center;">Bu testte soru bulunmamaktadır.</p></div>';
            return;
        }

        this.questions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'card question-card'; // admin.css .card sınıfını kullanır
            card.id = `q-${q.id}`;
            card.style.marginBottom = "2rem"; // Kartlar arası boşluk

            // Soru Başlığı ve Araçlar
            const headerHtml = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                    <span class="badge" style="background:var(--bg-dark); color:var(--gold-primary);">Soru ${index + 1}</span>
                    <div class="question-tools">
                        <button class="btn-icon fav-btn" onclick="testEngine.toggleFavorite('${q.id}')" title="Favorilere Ekle">
                            ${this.favorites.has(q.id) ? '★' : '☆'}
                        </button>
                        <button class="btn-icon report-btn" onclick="testEngine.openReportModal('${q.id}')" title="Hata Bildir">
                            ⚠️
                        </button>
                    </div>
                </div>`;

            // Soru Metni
            const textHtml = `<div class="question-text" style="font-size:1.1rem; margin-bottom:20px; line-height:1.6;">${q.text}</div>`;

            // Şıklar
            let optionsHtml = '<div class="options-grid" style="display:grid; gap:10px;">';
            ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
                if (q.options && q.options[opt]) {
                    optionsHtml += `
                        <label class="option-label" id="opt-${q.id}-${opt}" style="
                            display:flex; align-items:center; padding:12px 15px; 
                            border:1px solid var(--border-color); border-radius:8px; 
                            cursor:pointer; transition:all 0.2s;">
                            
                            <input type="radio" name="q-${q.id}" value="${opt}" 
                                onchange="testEngine.handleAnswer('${q.id}', '${opt}')"
                                style="margin-right:10px; accent-color:var(--gold-primary);">
                            
                            <span style="font-weight:600; margin-right:10px; color:var(--gold-primary);">${opt})</span>
                            <span>${q.options[opt]}</span>
                        </label>`;
                }
            });
            optionsHtml += '</div>';

            // Çözüm Alanı (Başlangıçta Gizli)
            const solutionHtml = `
                <div id="sol-${q.id}" class="solution-box" style="display:none; margin-top:20px; padding:15px; background:rgba(16, 185, 129, 0.1); border-left:3px solid var(--color-success); border-radius:4px;">
                    <strong style="color:var(--color-success); display:block; margin-bottom:5px;">✅ Doğru Cevap: ${q.correctAnswer}</strong>
                    <p style="margin:0; font-size:0.95rem; color:var(--text-white);">${q.solution || 'Çözüm açıklaması mevcut değil.'}</p>
                </div>`;

            card.innerHTML = headerHtml + textHtml + optionsHtml + solutionHtml;
            this.container.appendChild(card);
        });
    }

    handleAnswer(questionId, selectedOpt) {
        // Eğer soru daha önce çözüldüyse işlem yapma (Opsiyonel)
        if (this.answers[questionId]) return;

        const q = this.questions.find(x => x.id === questionId);
        if (!q) return;

        this.answers[questionId] = selectedOpt;
        
        // UI Güncellemesi (Doğru/Yanlış Renklendirme)
        const selectedLabel = document.getElementById(`opt-${questionId}-${selectedOpt}`);
        const correctLabel = document.getElementById(`opt-${questionId}-${q.correctAnswer}`);
        const solutionBox = document.getElementById(`sol-${questionId}`);

        if (selectedOpt === q.correctAnswer) {
            // Doğru
            if(selectedLabel) {
                selectedLabel.style.background = "rgba(16, 185, 129, 0.2)";
                selectedLabel.style.borderColor = "var(--color-success)";
            }
        } else {
            // Yanlış
            if(selectedLabel) {
                selectedLabel.style.background = "rgba(239, 68, 68, 0.2)";
                selectedLabel.style.borderColor = "var(--color-danger)";
            }
            // Doğruyu göster
            if(correctLabel) {
                correctLabel.style.background = "rgba(16, 185, 129, 0.2)";
                correctLabel.style.borderColor = "var(--color-success)";
            }
        }

        // Çözümü Göster
        if(solutionBox) solutionBox.style.display = 'block';

        // İstatistikleri Güncelle
        this.updateCounters();
    }

    updateCounters() {
        let correct = 0;
        let wrong = 0;
        
        Object.keys(this.answers).forEach(qId => {
            const q = this.questions.find(x => x.id === qId);
            if (q) {
                if (this.answers[qId] === q.correctAnswer) correct++;
                else wrong++;
            }
        });

        const total = this.questions.length;
        const remaining = total - (correct + wrong);

        if(this.ui.trueVal) this.ui.trueVal.textContent = correct;
        if(this.ui.falseVal) this.ui.falseVal.textContent = wrong;
        if(this.ui.remainVal) this.ui.remainVal.textContent = remaining;
    }

    async finishTest() {
        if (!confirm("Testi bitirmek istediğinize emin misiniz?")) return;

        // Sonuç Hesapla
        const correct = parseInt(this.ui.trueVal?.textContent || 0);
        const wrong = parseInt(this.ui.falseVal?.textContent || 0);
        const score = Math.round((correct / this.questions.length) * 100);

        // Veritabanına Kaydet (Sadece giriş yapmışsa)
        if (auth.currentUser) {
            try {
                await addDoc(collection(db, `users/${auth.currentUser.uid}/exam_results`), {
                    examId: this.examId || 'custom',
                    score: score,
                    correct: correct,
                    wrong: wrong,
                    total: this.questions.length,
                    completedAt: serverTimestamp()
                });
                console.log("Sonuç kaydedildi.");
            } catch (e) {
                console.error("Sonuç kaydetme hatası:", e);
            }
        }

        alert(`Test Bitti!\nPuanınız: ${score}\nDoğru: ${correct} - Yanlış: ${wrong}`);
        // İstenirse burada modal açılabilir veya yönlendirme yapılabilir
        // window.location.href = '/pages/dashboard.html';
    }

    // --- FAVORİ & REPORT İŞLEMLERİ ---

    async toggleFavorite(questionId) {
        if (!auth.currentUser) return alert("Bu işlem için giriş yapmalısınız.");
        
        const btn = document.querySelector(`#q-${questionId} .fav-btn`);
        const userFavRef = doc(db, `users/${auth.currentUser.uid}/favorites/${questionId}`);

        try {
            if (this.favorites.has(questionId)) {
                // Favoriden Çıkar
                this.favorites.delete(questionId);
                if(btn) btn.innerText = '☆';
                await deleteDoc(userFavRef);
            } else {
                // Favoriye Ekle
                this.favorites.add(questionId);
                if(btn) btn.innerText = '★';
                
                const q = this.questions.find(x => x.id === questionId);
                await setDoc(userFavRef, {
                    questionId: q.id,
                    text: q.text.substring(0, 100) + "...",
                    category: q.category || "Genel",
                    addedAt: serverTimestamp()
                });
            }
        } catch (e) {
            console.error("Favori işlemi hatası:", e);
            alert("İşlem sırasında bir hata oluştu.");
        }
    }

    openReportModal(questionId) {
        const desc = prompt("Hata veya düzeltme öneriniz nedir?");
        if (desc && auth.currentUser) {
            addDoc(collection(db, "reports"), {
                questionId: questionId,
                userId: auth.currentUser.uid,
                description: desc,
                status: 'pending',
                createdAt: serverTimestamp()
            }).then(() => alert("Bildiriminiz alındı, teşekkürler."))
              .catch(() => alert("Bildirim gönderilemedi."));
        }
    }
}

// Global scope'a ekle (HTML'den erişebilmek için)
window.TestEngine = TestEngine;