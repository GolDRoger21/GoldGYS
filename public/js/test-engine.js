import { db } from "./firebase-config.js";
// Şimdilik soruları buraya manuel ekliyoruz.
// 2. Faz'da burayı "db.collection('questions').get()" ile değiştireceğiz.
const questions = [
    {
        id: 1,
        type: "standard",
        text: "CMK'ya göre mahkeme, iddianamenin kabulü kararından sonra duruşma gününü belirler...",
        options: [
            { id: "A", text: "Sanığın kaçak olması durumunda" },
            { id: "B", text: "Suçun şikayete bağlı olması durumunda" },
            { id: "C", text: "Mahkûmiyet dışında bir karar verilmesi gerektiği kanısına varılırsa" },
            { id: "D", text: "Sanığın yurt dışında olması durumunda" }
        ],
        correct: "C",
        solution: {
            dayanak: "CMK m.193/2",
            analiz: "Kural olarak sanık sorgulanmadan hüküm verilemez...",
            tuzak: "Sanığın kaçak olması yetmez...",
            hap: "Beraat verilecekse sanık sorgulanmadan dava biter."
        }
    },
    // ... (Diğer soruların buraya eklenecek, örnek amaçlı 1 tane koydum)
];

// STATE YÖNETİMİ
let correctCount = 0;
let wrongCount = 0;

// DOM ELEMENTLERİ
const quizContainer = document.getElementById('quizContainer');
const trueVal = document.getElementById('trueVal');
const falseVal = document.getElementById('falseVal');
const remainVal = document.getElementById('remainVal');

// BAŞLAT
function initQuiz() {
    quizContainer.innerHTML = '';
    document.getElementById("testTitle").innerText = "Bölüm 5: CMK Test 1"; // Dinamik olacak
    
    questions.forEach((q, index) => {
        const cardHTML = createQuestionCard(q, index);
        quizContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
    updateCounters();
}

// HTML OLUŞTURUCU (Senin tasarımını basan fonksiyon)
function createQuestionCard(q, index) {
    let optionsHTML = q.options.map(opt => `
        <button class="sik-btn" onclick="window.checkAnswer(this, '${opt.id}', '${q.correct}')">
            <div class="sik-harf">${opt.id}</div>
            ${opt.text}
        </button>
    `).join('');

    return `
    <article class="soru-kart" data-id="${q.id}" data-answered="false">
        <div class="kart-header">
            <span class="soru-no">SORU ${index + 1}</span>
        </div>
        <div class="soru-metni">
            ${q.text}
        </div>
        <div class="siklar-alani">
            ${optionsHTML}
        </div>
        <div class="cozum-container">
            <div class="cozum-header">💡 Detaylı Konu Özeti & Analiz</div>
            <p><strong>Dayanak:</strong> ${q.solution.dayanak}</p>
            <p><strong>Analiz:</strong> ${q.solution.analiz}</p>
            ${q.solution.tuzak ? `<div class="tuzak-kutu"><strong>⚠️ Sınav Tuzağı:</strong> ${q.solution.tuzak}</div>` : ''}
            ${q.solution.hap ? `<div class="hap-kutu"><strong>💊 Hap Bilgi:</strong> ${q.solution.hap}</div>` : ''}
        </div>
    </article>
    `;
}

// CEVAP KONTROLÜ (Global scope'a ekliyoruz ki HTML onclick çalışsın)
window.checkAnswer = function(btn, selectedId, correctId) {
    const card = btn.closest('.soru-kart');
    if (card.getAttribute('data-answered') === 'true') return;

    card.setAttribute('data-answered', 'true');
    const allBtns = card.querySelectorAll('.sik-btn');
    const cozum = card.querySelector('.cozum-container');

    if (selectedId === correctId) {
        btn.classList.add('correct');
        correctCount++;
    } else {
        btn.classList.add('wrong');
        wrongCount++;
        // Doğru şıkkı göster
        allBtns.forEach(b => {
            if(b.querySelector('.sik-harf').innerText === correctId) b.classList.add('correct');
        });
    }

    allBtns.forEach(b => b.classList.add('disabled')); // Şıkları kilitle
    cozum.style.display = 'block'; // Çözümü göster
    updateCounters();
}

function updateCounters() {
    trueVal.innerText = correctCount;
    falseVal.innerText = wrongCount;
    remainVal.innerText = questions.length - (correctCount + wrongCount);
}

// Sayfa Yüklendiğinde
document.addEventListener("DOMContentLoaded", initQuiz);