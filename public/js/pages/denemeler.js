import { db } from "../firebase-config.js";
import { initLayout } from '../ui-loader.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CacheManager } from "../modules/cache-manager.js";

const INITIAL_STATE = {
    exams: []
};
let state = { ...INITIAL_STATE };
let abortController = null;

export async function init() {
    console.log('Denemeler sayfası başlatılıyor...');

    // Reset state & Cleanup old controller if exists (though loader should have called cleanup)
    if (abortController) {
        abortController.abort();
    }
    state = { ...INITIAL_STATE };
    abortController = new AbortController();
    const signal = abortController.signal;

    // UI'yi temizle (skeleton gösterimi için)
    const grid = document.getElementById('examsGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
        `;
    }

    // Event listeners
    attachEventListeners(signal);

    await loadExams(signal);
}

export function cleanup() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    state = { ...INITIAL_STATE };
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

const loadExams = async (signal) => {
    const grid = document.getElementById('examsGrid');
    // Grid zaten init'te skeleton ile dolduruldu, burada tekrar yazmaya gerek yok
    // Ancak hata durumunda veya boş durumda güncellenecek

    try {
        let exams = CacheManager.get('exams_list');

        if (!exams) {
            console.log("Fetching exams locally...");
            const q = query(
                collection(db, "exams"),
                where("isActive", "==", true),
                orderBy("createdAt", "desc")
            );

            const snapshot = await getDocs(q); // getDocs doesn't natively support signal in v9 lite SDK easily but we can check signal after

            if (signal && signal.aborted) return;

            exams = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data()
            }));

            // Timestamp convert for caching (Firestore timestamps are objects, need serialization friendly format if deep)
            // But CacheManager stores as JSON. JSON.stringify handles basic objects. 
            // Firestore timestamps .toDate() might need handling if we rely on it later.
            // Our formatDate function handles seconds/nanoseconds.

            CacheManager.set('exams_list', exams, 5 * 60 * 1000);
        } else {
            console.log("Exams loaded from cache");
        }

        if (signal && signal.aborted) return;

        state.exams = exams;

        if (!state.exams.length) {
            renderStats(state.exams);
            updateRoleFilter(state.exams);
            showEmptyExamsState();
            return;
        }

        renderStats(state.exams);
        updateRoleFilter(state.exams);
        renderExams(state.exams);
    } catch (error) {
        if (signal && signal.aborted) return;
        console.error("Hata:", error);
        if (grid) grid.innerHTML = `<div class="empty-state">Bağlantı hatası: ${error.message}</div>`;
    }
};

