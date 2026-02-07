import { db } from "../firebase-config.js";
import { initLayout } from '../ui-loader.js'; // Imported but mostly handled by ui-loader itself
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const state = {
    exams: []
};

let abortController = null;

export async function init() {
    console.log('Denemeler sayfası başlatılıyor...');

    // Auth check event listeners or initial load
    // Assuming framework handles auth wait before calling init if possible,
    // or we just trigger loadExams and let it handle empty/loading states.

    abortController = new AbortController();
    const signal = abortController.signal;

    // Event listeners
    attachEventListeners(signal);

    await loadExams();
}

function attachEventListeners(signal) {
    const searchInput = document.getElementById('examSearch');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters, { signal });
    }

    const roleFilter = document.getElementById('roleFilter');
    if (roleFilter) {
        roleFilter.addEventListener('change', applyFilters, { signal });
    }
}

const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
};

const formatNumber = (value) => new Intl.NumberFormat('tr-TR').format(value);

const renderStats = (exams) => {
    const totalExams = exams.length;
    const totalQuestions = exams.reduce((sum, exam) => sum + (exam.totalQuestions || 0), 0);
    const avgDuration = totalExams ? Math.round(exams.reduce((sum, exam) => sum + (exam.duration || 0), 0) / totalExams) : 0;
    const latestExam = exams[0];

    updateElement('statExamCount', totalExams);
    updateElement('statQuestionCount', formatNumber(totalQuestions || 0));
    updateElement('statAvgDuration', avgDuration ? `${avgDuration} dk` : "-");
    updateElement('statLastUpdate', latestExam ? formatDate(latestExam.createdAt) : "-");
};

function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

const updateRoleFilter = (exams) => {
    const roleFilter = document.getElementById('roleFilter');
    if (!roleFilter) return;

    const roles = [...new Set(exams.map((exam) => exam.role).filter(Boolean))];
    roleFilter.innerHTML = '<option value="all">Tümü</option>' + roles.map((role) => `<option value="${role}">${role}</option>`).join('');
};

const renderExams = (exams) => {
    const grid = document.getElementById('examsGrid');
    const countNote = document.getElementById('examCountNote');
    if (!grid) return;

    grid.innerHTML = '';

    if (!exams.length) {
        if (countNote) countNote.textContent = "0 deneme gösteriliyor";
        grid.innerHTML = `
            <div class="empty-state">
                Henüz eşleşen bir deneme bulunamadı. Filtreleri temizleyip tekrar deneyin.
            </div>
        `;
        return;
    }

    if (countNote) countNote.textContent = `${exams.length} deneme gösteriliyor`;

    exams.forEach((exam, index) => {
        const card = document.createElement('div');
        card.className = `exam-card ${index === 0 ? 'exam-highlight' : ''}`;
        card.innerHTML = `
            <div class="exam-card-header">
                <span class="badge bg-light text-dark">${exam.role || 'Genel'}</span>
                <span class="small text-muted">${formatDate(exam.createdAt)}</span>
            </div>
            <div>
                <h3>${exam.title}</h3>
                <p class="text-muted small">${exam.description || 'Mevzuat dağılımına uygun, otomatik seçilmiş sorularla hazırlandı.'}</p>
            </div>
            <div class="exam-meta">
                <span>🧩 ${exam.totalQuestions || 0} Soru</span>
                <span>⏱️ ${exam.duration || 0} dk</span>
                <span>🎯 Puan: %0-100</span>
            </div>
            <div class="exam-card-actions">
                <a href="/deneme/${encodeURIComponent(exam.id)}" class="btn btn-outline-primary w-100">Sınava Başla</a>
            </div>
        `;
        grid.appendChild(card);
    });
};

const applyFilters = () => {
    const searchInput = document.getElementById('examSearch');
    const roleFilter = document.getElementById('roleFilter');

    const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const roleValue = roleFilter ? roleFilter.value : 'all';

    const filtered = state.exams.filter((exam) => {
        const matchesSearch = !searchValue || exam.title?.toLowerCase().includes(searchValue);
        const matchesRole = roleValue === 'all' || exam.role === roleValue;
        return matchesSearch && matchesRole;
    });

    renderExams(filtered);
};

const showEmptyExamsState = () => {
    const grid = document.getElementById('examsGrid');
    const countNote = document.getElementById('examCountNote');
    if (countNote) countNote.textContent = "0 deneme gösteriliyor";
    if (grid) {
        grid.innerHTML = `
            <div class="empty-state">
                Şu anda yayınlanmış deneme sınavı bulunmuyor. Admin panelinde deneme yayınlandığında burada listelenecek.
            </div>
        `;
    }
};

const loadExams = async () => {
    const grid = document.getElementById('examsGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
        `;
    }

    try {
        const q = query(
            collection(db, "exams"),
            where("isActive", "==", true),
            orderBy("createdAt", "desc")
        );

        const snapshot = await Promise.race([
            getDocs(q),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Denemeler yüklenirken zaman aşımı oluştu.")), 5000))
        ]);

        if (snapshot.empty) {
            state.exams = [];
            renderStats(state.exams);
            updateRoleFilter(state.exams);
            showEmptyExamsState();
            return;
        }

        state.exams = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        renderStats(state.exams);
        updateRoleFilter(state.exams);
        renderExams(state.exams);
    } catch (error) {
        console.error("Hata:", error);
        if (grid) grid.innerHTML = `<div class="empty-state">Bağlantı hatası: ${error.message}</div>`;
    }
};

export function cleanup() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
}
