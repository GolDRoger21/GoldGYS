import { protectPage } from '../role-guard.js';
import { TestEngine } from '../test-engine.js';
import { db, auth } from '../firebase-config.js';
import { showConfirm, showToast } from '../notifications.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


export async function mount() {
    protectPage();

    console.log("Deneme page mount started");
    const urlParams = new URLSearchParams(window.location.search);
    let examId = urlParams.get('id');

    if (!examId) {
        const pathMatch = window.location.pathname.match(/^\/deneme\/([^/]+)$/);
        if (pathMatch) {
            examId = decodeURIComponent(pathMatch[1]);
        }
    }

    if (examId && !window.location.pathname.startsWith('/deneme/')) {
        window.history.replaceState({}, '', `/deneme/${encodeURIComponent(examId)}`);
    }

    if (!examId) {
        showToast("Deneme bilgisi bulunamadı. Lütfen listeye geri dönün.", "error");
        window.location.href = '/denemeler';
        return;
    }

    try {
        // 1. Sınav Verisini Çek
        const examRef = doc(db, "exams", examId);
        const examSnap = await getDoc(examRef);

        if (!examSnap.exists()) throw new Error("Sınav bulunamadı!");

        const examData = examSnap.data();

        // UI Güncelle
        const titleEl = document.getElementById('examTitle');
        const metaEl = document.getElementById('examMeta');

        if (titleEl) titleEl.innerText = examData.title;
        if (metaEl) metaEl.innerText = `Süre: ${examData.duration} dk | Soru: ${examData.totalQuestions}`;

        // 2. Test Motorunu Başlat (Sınav Modunda)
        // Not: Sorular 'questionsSnapshot' içinde saklı
        const engine = new TestEngine('quizContainer', examData.questionsSnapshot, {
            examId: examId,
            mode: 'exam', // Zorunlu Sınav Modu
            duration: examData.duration
        });

        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';

        // Bitir Butonu
        const btnFinish = document.getElementById('btnFinishExam');
        if (btnFinish) {
            // Remove old listeners using cloneNode
            const newBtn = btnFinish.cloneNode(true);
            btnFinish.parentNode.replaceChild(newBtn, btnFinish);

            newBtn.addEventListener('click', async () => {
                const shouldFinish = await showConfirm("Sınavı bitirmek ve sonuçları görmek istediğinize emin misiniz?", {
                    title: "Sınavı Bitir",
                    confirmText: "Sınavı Bitir",
                    cancelText: "Devam Et"
                });
                if (shouldFinish) {
                    engine.finishTest();
                }
            });
        }

    } catch (error) {
        console.error(error);
        showToast(`Bir hata oluştu: ${error.message}`, "error");
        window.location.href = '/denemeler';
    }
}

export function unmount() {

    // No specific cleanup needed as `init` handles listener removal via `cloneNode` hack.
    // TestEngine might need cleanup if it sets global timers?
    // TestEngine usually handles its own state, but if it sets `window.interval`, we might need reference.
    // Assuming TestEngine is self-contained or cleaned up by GC when DOM is removed (quizContainer).
}
