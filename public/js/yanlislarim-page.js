import { auth } from "./firebase-config.js";
import { showToast } from "./notifications.js";
import { WrongSummaryService } from "./wrong-summary-service.js";
import { initLayout } from "./ui-loader.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const CUSTOM_TEST_LIMIT = 30;
const state = {
    allMistakes: [],
    filteredMistakes: [],
    selectedCategory: "all",
    searchTerm: "",
    sort: "recent",
    isLoading: false,
    PAGE_SIZE: 20,
    visibleCount: 20
};

let ui = null;
let yanlislarimPageInitialized = false;
let authBound = false;
const subscriptions = [];

function addSubscription(unsubscribe) {
    if (typeof unsubscribe === "function") subscriptions.push(unsubscribe);
}

function clearSubscriptions() {
    while (subscriptions.length) {
        const unsubscribe = subscriptions.pop();
        try { unsubscribe(); } catch { /* noop */ }
    }
}

function initUiRefs() {
    ui = {
        totalMistakes: document.getElementById("totalMistakes"),
        totalMistakesHint: document.getElementById("totalMistakesHint"),
        totalCategories: document.getElementById("totalCategories"),
        lastAttempt: document.getElementById("lastAttempt"),
        categorySelect: document.getElementById("categorySelect"),
        searchInput: document.getElementById("searchInput"),
        sortSelect: document.getElementById("sortSelect"),
        categoryCards: document.getElementById("categoryCards"),
        mistakesList: document.getElementById("mistakesList"),
        filteredCount: document.getElementById("filteredCount"),
        btnSolveAllExam: document.getElementById("btnSolveAllExam"),
        btnSolveAllPractice: document.getElementById("btnSolveAllPractice"),
        btnClearFilters: document.getElementById("btnClearFilters")
    };
}

function bindUiEvents() {
    if (!ui) return;

    ui.categorySelect?.addEventListener("change", (event) => {
        state.selectedCategory = event.target.value;
        applyFilters();
    });

    ui.searchInput?.addEventListener("input", (event) => {
        state.searchTerm = event.target.value.trim().toLowerCase();
        applyFilters();
    });

    ui.sortSelect?.addEventListener("change", (event) => {
        state.sort = event.target.value;
        applyFilters();
    });

    ui.btnClearFilters?.addEventListener("click", () => {
        state.selectedCategory = "all";
        state.searchTerm = "";
        state.sort = "recent";
        if (ui.categorySelect) ui.categorySelect.value = "all";
        if (ui.searchInput) ui.searchInput.value = "";
        if (ui.sortSelect) ui.sortSelect.value = "recent";
        applyFilters();
    });

    ui.btnSolveAllExam?.addEventListener("click", () => {
        startCustomTest(state.allMistakes.map((m) => m.questionId), "Yanlışlarım - Karma Test", "exam");
    });

    ui.btnSolveAllPractice?.addEventListener("click", () => {
        startCustomTest(state.allMistakes.map((m) => m.questionId), "Yanlışlarım - Karma Öğrenme", "practice");
    });

    ui.mistakesList?.addEventListener("click", (event) => {
        if (event.target.id === "btnLoadMore") {
            state.visibleCount += state.PAGE_SIZE;
            renderMistakeList();
        }
    });
}

function bindAuth() {
    if (authBound) return;
    authBound = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        await loadMistakes(user.uid);
        document.body.style.visibility = "visible";
    });
    addSubscription(unsubscribe);
}

async function loadMistakes(uid) {
    if (state.isLoading || !ui?.mistakesList) return;
    state.isLoading = true;

    ui.mistakesList.innerHTML = "<div class=\"card p-4 text-center\">Hatalarınız analiz ediliyor...</div>";
    setSolveButtonsEnabled(false);
    state.allMistakes = [];

    try {
        const summary = await WrongSummaryService.getUserWrongSummary(uid);
        if (!summary.length) {
            renderEmptyState();
            state.isLoading = false;
            return;
        }

        state.allMistakes = summary.map((item) => ({
            id: item.questionId,
            questionId: item.questionId,
            text: truncateText(item.text || "Soru metni yüklenemedi..."),
            category: item.category || "Genel",
            count: item.count || 1,
            lastAttempt: item.lastAttempt || null
        }));
        state.visibleCount = state.PAGE_SIZE;

        populateCategorySelect();
        renderCategoryCards();
        applyFilters();
        updateSummary();
        setSolveButtonsEnabled(true);
    } catch (error) {
        console.error(error);
        ui.mistakesList.innerHTML = "<div class=\"text-danger\">Veriler alınamadı.</div>";
        setSolveButtonsEnabled(false);
    } finally {
        state.isLoading = false;
    }
}

function renderEmptyState() {
    if (!ui) return;
    if (ui.totalMistakes) ui.totalMistakes.textContent = "0";
    if (ui.totalMistakesHint) ui.totalMistakesHint.textContent = "Harika! Şu an yanlışın yok.";
    if (ui.totalCategories) ui.totalCategories.textContent = "0";
    if (ui.lastAttempt) ui.lastAttempt.textContent = "-";
    if (ui.categoryCards) ui.categoryCards.innerHTML = "<div class=\"empty-state\">Hiç yanlış soru bulunamadı.</div>";
    if (ui.mistakesList) ui.mistakesList.innerHTML = "<div class=\"empty-state\">Yanlış yaptığın soru yok, böyle devam!</div>";
    if (ui.filteredCount) ui.filteredCount.textContent = "0 soru";
    setSolveButtonsEnabled(false);
}

function populateCategorySelect() {
    if (!ui?.categorySelect) return;
    const current = ui.categorySelect.value;
    const categories = ["all", ...new Set(state.allMistakes.map((m) => m.category))];
    ui.categorySelect.innerHTML = categories
        .map((cat) => `<option value=\"${cat}\">${cat === "all" ? "Tümü" : cat}</option>`)
        .join("");
    ui.categorySelect.value = current;
}

function updateSummary() {
    if (!ui) return;
    const questionCount = state.allMistakes.length;
    const totalWrongCount = state.allMistakes.reduce((sum, item) => sum + (item.count || 0), 0);
    const categoryCount = new Set(state.allMistakes.map((m) => m.category)).size;
    const latest = state.allMistakes.reduce((latestDate, item) => {
        if (!latestDate) return item.lastAttempt || null;
        return compareDate(item.lastAttempt, latestDate) > 0 ? item.lastAttempt : latestDate;
    }, null);

    if (ui.totalMistakes) ui.totalMistakes.textContent = String(totalWrongCount);
    if (ui.totalMistakesHint) {
        ui.totalMistakesHint.textContent = questionCount > 0
            ? `${questionCount} soruda tekrar fırsatın var.`
            : "Harika! Şu an yanlışın yok.";
    }
    if (ui.totalCategories) ui.totalCategories.textContent = String(categoryCount);
    if (ui.lastAttempt) ui.lastAttempt.textContent = latest ? formatDate(latest) : "-";
}

function renderCategoryCards() {
    if (!ui?.categoryCards || !ui.categorySelect) return;
    if (ui.categorySelect.value !== "all") return;

    if (state.allMistakes.length === 0) {
        ui.categoryCards.innerHTML = "<div class=\"empty-state\">Konu kartı oluşturulacak veri bulunamadı.</div>";
        return;
    }

    const categoryMap = new Map();
    state.allMistakes.forEach((item) => {
        const entry = categoryMap.get(item.category) || { total: 0, lastAttempt: null };
        entry.total += 1;
        if (!entry.lastAttempt || compareDate(item.lastAttempt, entry.lastAttempt) > 0) {
            entry.lastAttempt = item.lastAttempt;
        }
        categoryMap.set(item.category, entry);
    });

    ui.categoryCards.innerHTML = Array.from(categoryMap.entries()).map(([category, data]) => `
      <div class="category-card">
        <div>
          <h4>${category}</h4>
          <div class="category-meta">
            <span>${data.total} soru</span>
            <span>${data.lastAttempt ? formatDate(data.lastAttempt) : "-"}</span>
          </div>
        </div>
        <div class="category-actions">
          <button class="btn btn-outline-primary" data-category="${category}" data-mode="practice">📖 Öğrenme</button>
          <button class="btn btn-primary" data-category="${category}" data-mode="exam">🎯 Sınav</button>
        </div>
      </div>
    `).join("");

    ui.categoryCards.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
            const category = btn.dataset.category;
            const mode = btn.dataset.mode;
            const ids = state.allMistakes
                .filter((m) => m.category === category)
                .map((m) => m.questionId);
            startCustomTest(ids, `${category} - Yanlışlarım`, mode);
        });
    });
}

function applyFilters() {
    let data = [...state.allMistakes];

    if (state.selectedCategory !== "all") {
        data = data.filter((item) => item.category === state.selectedCategory);
    }

    if (state.searchTerm) {
        data = data.filter((item) => (
            item.text.toLowerCase().includes(state.searchTerm)
            || item.category.toLowerCase().includes(state.searchTerm)
        ));
    }

    if (state.sort === "recent") {
        data.sort((a, b) => compareDate(b.lastAttempt, a.lastAttempt));
    } else if (state.sort === "oldest") {
        data.sort((a, b) => compareDate(a.lastAttempt, b.lastAttempt));
    } else if (state.sort === "count") {
        data.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else if (state.sort === "category") {
        data.sort((a, b) => a.category.localeCompare(b.category, "tr"));
    }

    state.filteredMistakes = data;
    state.visibleCount = state.PAGE_SIZE;
    renderMistakeList();
}

function renderMistakeList() {
    if (!ui?.mistakesList || !ui?.filteredCount) return;

    const data = state.filteredMistakes;
    const visibleItems = data.slice(0, state.visibleCount);
    ui.filteredCount.textContent = `${data.length} soru`;

    if (data.length === 0) {
        ui.mistakesList.innerHTML = "<div class=\"empty-state\">Bu filtrelerle eşleşen yanlış bulunamadı.</div>";
        return;
    }

    ui.mistakesList.innerHTML = visibleItems.map((item) => `
      <div class="mistake-card" id="mistake-${item.questionId}">
        <div class="mistake-card-header">
          <span class="badge-category">${item.category}</span>
          <span>${formatDate(item.lastAttempt)}</span>
        </div>
        <p>${item.text}</p>
        <div class="mistake-card-footer">
          <span>Yanlış sayısı: ${item.count}</span>
          <button class="btn btn-outline-primary" data-question="${item.questionId}">Tekrar Çöz</button>
        </div>
      </div>
    `).join("");

    updateLoadMoreButton();

    ui.mistakesList.querySelectorAll("button[data-question]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            const id = btn.dataset.question;
            startCustomTest([id], "Yanlışlarım - Tekrar Sorusu", "practice");
        });
    });
}

function updateLoadMoreButton() {
    if (!ui?.mistakesList) return;
    if (state.filteredMistakes.length <= state.visibleCount) return;

    const btnDiv = document.createElement("div");
    btnDiv.className = "text-center mt-3";
    btnDiv.innerHTML = "<button id=\"btnLoadMore\" class=\"btn btn-outline-secondary\" style=\"width: 200px;\">Daha Fazla Yükle</button>";
    ui.mistakesList.appendChild(btnDiv);
}

function startCustomTest(ids, title, mode) {
    const filteredIds = ids.filter(Boolean);
    if (filteredIds.length === 0) {
        showToast("Çözülecek yanlış soru bulunamadı.", "warning");
        return;
    }

    const finalIds = filteredIds.slice(0, CUSTOM_TEST_LIMIT);
    if (filteredIds.length > CUSTOM_TEST_LIMIT) {
        showToast(`Test ${CUSTOM_TEST_LIMIT} soru ile sınırlandı.`, "info");
    }

    localStorage.setItem("customTestQuestionIds", JSON.stringify(finalIds));
    localStorage.setItem("customTestTitle", title);
    localStorage.removeItem("customTestQuestions");
    const returnUrl = encodeURIComponent("/yanlislarim");
    window.location.href = `/test?mode=custom&source=local&testMode=${mode}&limit=${CUSTOM_TEST_LIMIT}&return=${returnUrl}`;
}

function setSolveButtonsEnabled(isEnabled) {
    [ui?.btnSolveAllExam, ui?.btnSolveAllPractice].forEach((btn) => {
        if (!btn) return;
        btn.disabled = !isEnabled;
        btn.classList.toggle("disabled", !isEnabled);
    });
}

function formatDate(timestamp) {
    if (!timestamp) return "-";
    if (timestamp instanceof Date) return timestamp.toLocaleDateString("tr-TR");
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString("tr-TR");
}

function compareDate(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const dateA = a instanceof Date ? a.getTime() : (a.seconds ? a.seconds * 1000 : new Date(a).getTime());
    const dateB = b instanceof Date ? b.getTime() : (b.seconds ? b.seconds * 1000 : new Date(b).getTime());
    return dateA - dateB;
}

function truncateText(text) {
    if (!text) return "Soru metni yüklenemedi...";
    return text.length > 150 ? `${text.substring(0, 150)}...` : text;
}

export async function initYanlislarimPage(options = {}) {
    if (yanlislarimPageInitialized) return;
    yanlislarimPageInitialized = true;

    if (options.skipLayout !== true) {
        await initLayout();
    }

    initUiRefs();
    bindUiEvents();
    bindAuth();
}

export function disposeYanlislarimPage() {
    clearSubscriptions();
    authBound = false;
    yanlislarimPageInitialized = false;
    ui = null;
}

document.addEventListener("DOMContentLoaded", () => {
    void initYanlislarimPage();
});
