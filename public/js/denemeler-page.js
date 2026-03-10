import { initLayout } from "./ui-loader.js";
import { db } from "./firebase-config.js";
import { CacheManager } from "./cache-manager.js";
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const state = {
    exams: []
};

let denemelerPageInitialized = false;
let denemelerFiltersBound = false;
let denemelerSearchHandler = null;
let denemelerRoleHandler = null;

const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
};

const formaTümür = (value) => new Intl.NumberFormat("tr-TR").format(value);

const renderStats = (exams) => {
    const totalExams = exams.length;
    const totalQuestions = exams.reduce((sum, exam) => sum + (exam.totalQuestions || 0), 0);
    const avgDuration = totalExams ? Math.round(exams.reduce((sum, exam) => sum + (exam.duration || 0), 0) / totalExams) : 0;
    const latestExam = exams[0];

    const statExamCount = document.getElementById("statExamCount");
    const statQuestionCount = document.getElementById("statQuestionCount");
    const statAvgDuration = document.getElementById("statAvgDuration");
    const statLastUpdate = document.getElementById("statLastUpdate");

    if (statExamCount) statExamCount.textContent = totalExams;
    if (statQuestionCount) statQuestionCount.textContent = formaTümür(totalQuestions || 0);
    if (statAvgDuration) statAvgDuration.textContent = avgDuration ? `${avgDuration} dk` : "-";
    if (statLastUpdate) statLastUpdate.textContent = latestExam ? formatDate(latestExam.createdAt) : "-";
};

const updateRoleFilter = (exams) => {
    const roleFilter = document.getElementById("roleFilter");
    if (!roleFilter) return;
    const roles = [...new Set(exams.map((exam) => exam.role).filter(Boolean))];
    roleFilter.innerHTML = "<option value=\"all\">Tümü</option>" + roles.map((role) => `<option value="${role}">${role}</option>`).join("");
};

const renderExams = (exams) => {
    const grid = document.getElementById("examsGrid");
    const countNote = document.getElementById("examCountNote");
    if (!grid || !countNote) return;

    grid.innerHTML = "";

    if (!exams.length) {
        countNote.textContent = "0 deneme gösteriliyor";
        grid.innerHTML = `
            <div class="empty-state">
                Henüz eşleşen bir deneme bulunamadı. Filtreleri temizleyip tekrar deneyin.
            </div>
        `;
        return;
    }

    countNote.textContent = `${exams.length} deneme gösteriliyor`;

    exams.forEach((exam, index) => {
        const card = document.createElement("div");
        card.className = `exam-card ${index === 0 ? "exam-highlight" : ""}`;
        card.innerHTML = `
            <div class="exam-card-header">
                <span class="badge bg-light text-dark">${exam.role || "Genel"}</span>
                <span class="small text-muted">${formatDate(exam.createdAt)}</span>
            </div>
            <div>
                <h3>${exam.title}</h3>
                <p class="text-muted small">${exam.description || "Mevzuat dağılımına uygun, otomatik seçilmiş sorularla hazırlandı."}</p>
            </div>
            <div class="exam-meta">
                <span>${exam.totalQuestions || 0} Soru</span>
                <span>${exam.duration || 0} dk</span>
                <span>Puan: %0-100</span>
            </div>
            <div class="exam-card-actions">
                <a href="/deneme/${encodeURIComponent(exam.id)}" class="btn btn-outline-primary w-100">Sınava Başla</a>
            </div>
        `;
        grid.appendChild(card);
    });
};

const applyFilters = () => {
    const examSearch = document.getElementById("examSearch");
    const roleFilter = document.getElementById("roleFilter");
    if (!examSearch || !roleFilter) return;

    const searchValue = examSearch.value.toLowerCase().trim();
    const roleValue = roleFilter.value;

    const filtered = state.exams.filter((exam) => {
        const matchesSearch = !searchValue || exam.title?.toLowerCase().includes(searchValue);
        const matchesRole = roleValue === "all" || exam.role === roleValue;
        return matchesSearch && matchesRole;
    });

    renderExams(filtered);
};

const showEmptyExamsState = () => {
    const grid = document.getElementById("examsGrid");
    const countNote = document.getElementById("examCountNote");
    if (!grid || !countNote) return;

    countNote.textContent = "0 deneme gösteriliyor";
    grid.innerHTML = `
        <div class="empty-state">
            Şu anda yayınlanmış deneme sınavı bulunmuyor. Admin panelinde deneme yayınlandığında burada listelenecek.
        </div>
    `;
};

const loadExams = async () => {
    const grid = document.getElementById("examsGrid");
    if (!grid) return;

    grid.innerHTML = `
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
    `;

    try {
        const cacheKey = "global_active_exams";
        const cachedExams = await CacheManager.getData(cacheKey, 24 * 60 * 60 * 1000);

        if (cachedExams?.cached && cachedExams.data) {
            state.exams = cachedExams.data;
            console.log("[Cache] Deneme sınavları IndexedDB'den yüklendi.");
        } else {
            const examsQuery = query(
                collection(db, "exams"),
                where("isActive", "==", true),
                orderBy("createdAt", "desc")
            );

            const snapshot = await getDocs(examsQuery);

            if (snapshot.empty) {
                state.exams = [];
                await CacheManager.saveData(cacheKey, state.exams, 24 * 60 * 60 * 1000);
                renderStats(state.exams);
                updateRoleFilter(state.exams);
                showEmptyExamsState();
                return;
            }

            state.exams = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data()
            }));

            await CacheManager.saveData(cacheKey, state.exams, 24 * 60 * 60 * 1000);
            console.log("[Network] Deneme sınavları Firestore'dan çekildi.");
        }

        if (state.exams.length === 0) {
            showEmptyExamsState();
        } else {
            renderStats(state.exams);
            updateRoleFilter(state.exams);
            renderExams(state.exams);
        }
    } catch (error) {
        console.error("Hata:", error);
        grid.innerHTML = `<div class="empty-state">Bağlantı hatası: ${error.message}</div>`;
    }
};

function bindFilterEvents() {
    if (denemelerFiltersBound) return;
    const examSearch = document.getElementById("examSearch");
    const roleFilter = document.getElementById("roleFilter");
    if (!examSearch || !roleFilter) return;
    denemelerSearchHandler = () => applyFilters();
    denemelerRoleHandler = () => applyFilters();
    examSearch.addEventListener("input", denemelerSearchHandler);
    roleFilter.addEventListener("change", denemelerRoleHandler);
    denemelerFiltersBound = true;
}

export function disposeDenemelerPage() {
    const examSearch = document.getElementById("examSearch");
    const roleFilter = document.getElementById("roleFilter");
    if (examSearch && denemelerSearchHandler) {
        examSearch.removeEventListener("input", denemelerSearchHandler);
    }
    if (roleFilter && denemelerRoleHandler) {
        roleFilter.removeEventListener("change", denemelerRoleHandler);
    }
    denemelerSearchHandler = null;
    denemelerRoleHandler = null;
    denemelerFiltersBound = false;
    denemelerPageInitialized = false;
}

export async function initDenemelerPage(options = {}) {
    if (denemelerPageInitialized) return;
    denemelerPageInitialized = true;

    if (options.skipLayout !== true) {
        await initLayout();
    }

    await loadExams();
    bindFilterEvents();
}

document.addEventListener("DOMContentLoaded", () => {
    void initDenemelerPage();
});

