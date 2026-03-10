import { db, auth } from "./firebase-config.js";
import { showConfirm, showToast } from "./notifications.js";
import { CacheManager } from "./cache-manager.js";
import { initLayout } from "./ui-loader.js";
import { collection, getDocs, deleteDoc, doc, where, documentId, query, limit, startAfter, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const CUSTOM_TEST_LIMIT = 30;
const state = {
    favorites: [],
    filtered: [],
    categories: new Map(),
    lastVisible: null,
    isLoading: false,
    hasMore: true,
    PAGE_SIZE: 20
};

let ui = null;
let favorilerPageInitialized = false;
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
        list: document.getElementById("favoritesList"),
        categoryGrid: document.getElementById("favoritesCategoryGrid"),
        totalFavorites: document.getElementById("totalFavorites"),
        totalCategories: document.getElementById("totalCategories"),
        filteredCount: document.getElementById("filteredCount"),
        categorySelect: document.getElementById("categorySelect"),
        searchInput: document.getElementById("searchInput"),
        clearFilters: document.getElementById("btnClearFilters"),
        btnSolveAllExam: document.getElementById("btnSolveAllExam"),
        btnSolveAllPractice: document.getElementById("btnSolveAllPractice")
    };
}

function bindUiEvents() {
    if (!ui?.categorySelect) return;

    ui.categorySelect.addEventListener("change", () => applyFilters());
    ui.searchInput?.addEventListener("input", () => applyFilters());
    ui.clearFilters?.addEventListener("click", () => {
        ui.categorySelect.value = "all";
        if (ui.searchInput) ui.searchInput.value = "";
        applyFilters();
    });

    ui.btnSolveAllExam?.addEventListener("click", () => {
        startCustomTest(state.favorites.map((item) => item.questionId), "Favoriler - Karma Test", "exam", true);
    });

    ui.btnSolveAllPractice?.addEventListener("click", () => {
        startCustomTest(state.favorites.map((item) => item.questionId), "Favoriler - Karma Öğrenme", "practice", true);
    });

    ui.categoryGrid?.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-category]");
        if (!button) return;

        const category = button.dataset.category;
        const action = button.dataset.action;

        if (action === "view") {
            ui.categorySelect.value = category;
            applyFilters();
            ui.list?.scrollIntoView({ behavior: "smooth" });
            return;
        }

        const ids = state.favorites
            .filter((item) => item.category === category)
            .map((item) => item.questionId);
        const title = `Favoriler - ${category}`;
        const mode = action === "exam" ? "exam" : "practice";
        startCustomTest(ids, title, mode, true);
    });

    ui.list?.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) return;
        if ("disabled" in target && target.disabled) return;

        const action = target.dataset.action;
        const id = target.dataset.id;

        if (action === "load-more") {
            if (auth.currentUser?.uid) {
                void loadFavorites(auth.currentUser.uid, false);
            }
            return;
        }
        if (action === "solve") {
            startCustomTest([id], "Favoriler - Tek Soru", "practice");
            return;
        }
        if (action === "toggle") {
            const card = target.closest(".fav-card");
            const details = card?.querySelector(".fav-details");
            if (!details) return;
            details.classList.toggle("is-open");
            target.textContent = details.classList.contains("is-open") ? "Detayı Gizle" : "Detayı Gör";
            return;
        }
        if (action === "remove" && id) {
            void removeFavorite(id);
        }
    });
}

function bindAuth() {
    if (authBound) return;
    authBound = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        await loadFavorites(user.uid, true);
        document.body.style.visibility = "visible";
    });
    addSubscription(unsubscribe);
}

async function loadFavorites(uid, isInitial = false) {
    if (state.isLoading || (!state.hasMore && !isInitial)) return;
    state.isLoading = true;

    if (isInitial) {
        if (ui.list) ui.list.innerHTML = "<div class=\"card p-4 text-center\">Yükleniyor...</div>";
        state.favorites = [];
        state.categories.clear();
        state.lastVisible = null;
        state.hasMore = true;
    } else {
        const existingBtn = document.getElementById("btnLoadMore");
        if (existingBtn) existingBtn.textContent = "Yükleniyor...";
    }

    try {
        const favCollection = collection(db, `users/${uid}/favorites`);
        const constraints = state.lastVisible
            ? [orderBy(documentId()), startAfter(state.lastVisible), limit(state.PAGE_SIZE)]
            : [orderBy(documentId()), limit(state.PAGE_SIZE)];
        const snapshot = await getDocs(query(favCollection, ...constraints));
        const pagedFavorites = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            questionId: docSnap.data().questionId || docSnap.id,
            data: docSnap.data()
        }));

        if (pagedFavorites.length === 0) {
            state.hasMore = false;
            if (isInitial) renderEmptyState();
            else updateLoadMoreButton();
            state.isLoading = false;
            return;
        }

        state.lastVisible = snapshot.docs[snapshot.docs.length - 1] || state.lastVisible;
        state.hasMore = snapshot.docs.length === state.PAGE_SIZE;

        const activeQuestions = await fetchActiveQuestionsEfficiently(pagedFavorites.map((fav) => fav.questionId));
        const newFavorites = pagedFavorites.map((fav) => {
            const question = activeQuestions.get(fav.questionId) || {};
            const fallback = fav.data || {};
            return {
                id: fav.id,
                questionId: fav.questionId,
                category: question.category || fallback.category || "Genel",
                text: question.text || fallback.text || "Soru metni yüklenemedi.",
                questionRoot: question.questionRoot || fallback.questionRoot || null,
                onculler: question.onculler || fallback.onculler || [],
                options: question.options || fallback.options || [],
                correctOption: question.correctOption || fallback.correctOption || null,
                solution: question.solution || fallback.solution || {}
            };
        });

        state.favorites = [...state.favorites, ...newFavorites];
        buildCategoryData();
        populateCategorySelect();
        renderCategoryCards();
        applyFilters();
    } catch (error) {
        console.error("Favoriler yüklenirken hata:", error);
        if (ui.list) {
            ui.list.innerHTML = "<div class=\"text-danger\">Hata oluştu. Lütfen sayfayı yenileyin.</div>";
        }
    } finally {
        state.isLoading = false;
    }
}

async function fetchActiveQuestionsEfficiently(ids) {
    const questionMap = new Map();
    const missingIds = [];

    for (const id of ids) {
        const cachedQ = await CacheManager.getQuestion(id);
        if (cachedQ) {
            questionMap.set(id, cachedQ);
        } else {
            missingIds.push(id);
        }
    }

    if (missingIds.length > 0) {
        const remoteMap = await fetchActiveQuestionsMap(missingIds);
        remoteMap.forEach((val, key) => {
            questionMap.set(key, val);
            CacheManager.saveQuestion(val);
        });
    }

    return questionMap;
}

function buildCategoryData() {
    const categoryMap = new Map();
    state.favorites.forEach((item) => {
        const category = item.category || "Genel";
        if (!categoryMap.has(category)) categoryMap.set(category, []);
        categoryMap.get(category).push(item);
    });

    state.categories = categoryMap;
    if (ui.totalFavorites) ui.totalFavorites.textContent = state.favorites.length;
    if (ui.totalCategories) ui.totalCategories.textContent = categoryMap.size;
}

function populateCategorySelect() {
    if (!ui.categorySelect) return;
    const currentVal = ui.categorySelect.value;
    const categories = Array.from(state.categories.keys()).sort((a, b) => a.localeCompare(b, "tr"));
    ui.categorySelect.innerHTML = "<option value=\"all\">Tüm Konular</option>";
    categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        ui.categorySelect.appendChild(option);
    });
    ui.categorySelect.value = currentVal;
}

function renderCategoryCards() {
    if (!ui.categoryGrid || !ui.categorySelect) return;
    if (ui.categorySelect.value !== "all") return;

    if (state.categories.size === 0) {
        ui.categoryGrid.innerHTML = "<div class=\"empty-state\">Favori konu bulunamadı.</div>";
        return;
    }

    const cards = Array.from(state.categories.entries())
        .sort(([a], [b]) => a.localeCompare(b, "tr"))
        .map(([category, items]) => `
            <div class="category-card">
              <div>
                <h4>${category}</h4>
                <div class="category-meta">
                  <span>${items.length} soru</span>
                  <span>Konu bazlı çalışma</span>
                </div>
              </div>
              <div class="category-actions">
                <button class="btn btn-outline-primary" data-category="${category}" data-action="view">Soruları Gör</button>
                <button class="btn btn-primary" data-category="${category}" data-action="practice">Konu Öğrenme</button>
                <button class="btn btn-secondary" data-category="${category}" data-action="exam">Konu Testi</button>
              </div>
            </div>
        `).join("");

    ui.categoryGrid.innerHTML = cards;
}

function applyFilters() {
    if (!ui.categorySelect || !ui.searchInput) return;
    const category = ui.categorySelect.value;
    const search = ui.searchInput.value.trim().toLowerCase();

    state.filtered = state.favorites.filter((item) => {
        const categoryMatch = category === "all" || item.category === category;
        const searchMatch = !search || item.text.toLowerCase().includes(search);
        return categoryMatch && searchMatch;
    });

    if (ui.filteredCount) ui.filteredCount.textContent = state.filtered.length;
    renderFavoritesList();
    setSolveButtonsEnabled(state.favorites.length > 0);
}

function renderFavoritesList() {
    if (!ui.list) return;
    if (state.filtered.length === 0) {
        ui.list.innerHTML = "<div class=\"empty-state\">Bu filtreye uygun favori soru bulunamadı.</div>";
        return;
    }

    const listHtml = state.filtered.map((item) => {
        const optionsHtml = renderOptions(item.options);
        const oncullerHtml = renderOnculler(item.onculler);
        const solutionHtml = renderSolution(item.solution, item.correctOption);

        return `
          <div class="fav-card" data-question-id="${item.questionId}">
            <div class="fav-icon" title="Favoriden kaldır" data-action="remove" data-id="${item.id}">★</div>
            <div class="fav-content">
              <div class="fav-meta">
                <span class="badge badge-secondary">${item.category}</span>
                <small class="text-muted">ID: ${item.questionId}</small>
              </div>
              <p>${item.text}</p>
            </div>
            <div class="fav-actions">
              <button class="btn btn-sm btn-primary" data-action="solve" data-id="${item.questionId}">Tek Soru Çöz</button>
              <button class="btn btn-sm btn-outline-primary" data-action="toggle" data-id="${item.questionId}">Detayı Gör</button>
            </div>
            <div class="fav-details">
              ${item.questionRoot ? `<div class="fav-detail-block"><div class="fav-detail-title">Soru Kökü</div><div class="fav-detail-content"><p>${item.questionRoot}</p></div></div>` : ""}
              ${oncullerHtml}
              ${optionsHtml}
              ${solutionHtml}
            </div>
          </div>
        `;
    }).join("");

    ui.list.innerHTML = listHtml;
    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    if (!ui.list || !ui.categorySelect || !ui.searchInput) return;
    const isFiltering = ui.categorySelect.value !== "all" || ui.searchInput.value.trim().length > 0;
    if (state.hasMore && !isFiltering) {
        const btnDiv = document.createElement("div");
        btnDiv.className = "text-center mt-3";
        btnDiv.innerHTML = "<button id=\"btnLoadMore\" class=\"btn btn-outline-secondary\" data-action=\"load-more\">Daha Fazla Yükle</button>";
        ui.list.appendChild(btnDiv);
    }
}

function renderOnculler(onculler) {
    if (!onculler || onculler.length === 0) return "";
    const items = onculler.map((item) => `<li>${item}</li>`).join("");
    return `
        <div class="fav-detail-block">
          <div class="fav-detail-title">Öncüller</div>
          <div class="fav-detail-content"><ol>${items}</ol></div>
        </div>
    `;
}

function renderOptions(options) {
    if (!options || options.length === 0) return "";
    const list = options.map((option) => {
        if (typeof option === "string") {
            return `<div class="fav-option-item"><span>•</span><div>${option}</div></div>`;
        }
        return `<div class="fav-option-item"><span>${option.id || "•"}</span><div>${option.text || ""}</div></div>`;
    }).join("");

    return `
        <div class="fav-detail-block">
          <div class="fav-detail-title">Şıklar</div>
          <div class="fav-detail-content">
            <div class="fav-options">${list}</div>
          </div>
        </div>
    `;
}

function renderSolution(solution, correctOption) {
    if (!solution && !correctOption) return "";
    const parts = [];
    if (correctOption) parts.push(`<p><strong>Doğru Cevap:</strong> ${correctOption}</p>`);
    if (solution?.analiz) parts.push(`<p><strong>Analiz:</strong> ${solution.analiz}</p>`);
    if (solution?.dayanakText) parts.push(`<p><strong>Dayanak:</strong> ${solution.dayanakText}</p>`);
    if (solution?.tuzak) parts.push(`<p><strong>Tuzak:</strong> ${solution.tuzak}</p>`);
    if (solution?.hap) parts.push(`<p><strong>HAP Bilgi:</strong> ${solution.hap}</p>`);
    if (!parts.length) return "";

    return `
        <div class="fav-detail-block">
          <div class="fav-detail-title">Çözüm</div>
          <div class="fav-detail-content">${parts.join("")}</div>
        </div>
    `;
}

function renderEmptyState() {
    if (ui.list) ui.list.innerHTML = "<div class=\"empty-state\">Henüz favori soru eklemediniz.</div>";
    if (ui.categoryGrid) ui.categoryGrid.innerHTML = "<div class=\"empty-state\">Favori konu bulunamadı.</div>";
    if (ui.totalFavorites) ui.totalFavorites.textContent = "0";
    if (ui.totalCategories) ui.totalCategories.textContent = "0";
    if (ui.filteredCount) ui.filteredCount.textContent = "0";
    setSolveButtonsEnabled(false);
}

function setSolveButtonsEnabled(isEnabled) {
    [ui.btnSolveAllExam, ui.btnSolveAllPractice].forEach((btn) => {
        if (!btn) return;
        btn.disabled = !isEnabled;
        btn.classList.toggle("disabled", !isEnabled);
    });
}

function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function startCustomTest(ids, title, mode, shouldShuffle = false) {
    const filteredIds = ids.filter(Boolean);
    if (filteredIds.length === 0) {
        showToast("Çözülecek favori soru bulunamadı.", "warning");
        return;
    }

    const shuffled = shouldShuffle ? shuffle(filteredIds) : filteredIds;
    const finalIds = shuffled.slice(0, CUSTOM_TEST_LIMIT);
    if (shuffled.length > CUSTOM_TEST_LIMIT) {
        showToast(`Test ${CUSTOM_TEST_LIMIT} soru ile sınırlandı.`, "info");
    }
    localStorage.setItem("customTestQuestionIds", JSON.stringify(finalIds));
    localStorage.setItem("customTestTitle", title);
    localStorage.removeItem("customTestQuestions");
    const returnUrl = encodeURIComponent("/favoriler");
    window.location.href = `/test?mode=custom&source=local&testMode=${mode}&limit=${CUSTOM_TEST_LIMIT}&return=${returnUrl}`;
}

async function fetchActiveQuestionsMap(ids) {
    const activeQuestions = new Map();
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return activeQuestions;

    for (let i = 0; i < uniqueIds.length; i += 10) {
        const chunk = uniqueIds.slice(i, i + 10);
        const q = query(collection(db, "questions"), where(documentId(), "in", chunk));
        const snap = await getDocs(q);
        snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (data?.isDeleted || data?.isActive === false) return;
            activeQuestions.set(docSnap.id, { id: docSnap.id, ...data });
        });
    }

    return activeQuestions;
}

async function removeFavorite(id) {
    const shouldRemove = await showConfirm("Bu soruyu favorilerinizden kaldırmak istediğinize emin misiniz?", {
        title: "Favoriden Kaldır",
        confirmText: "Kaldır",
        cancelText: "Vazgeç"
    });
    if (!shouldRemove) return;
    if (!auth.currentUser?.uid) return;

    await deleteDoc(doc(db, `users/${auth.currentUser.uid}/favorites`, id));

    state.favorites = state.favorites.filter((item) => item.id !== id);
    buildCategoryData();
    populateCategorySelect();
    renderCategoryCards();
    applyFilters();
    showToast("Favori listesi güncellendi.", "success");
}

export async function initFavorilerPage(options = {}) {
    if (favorilerPageInitialized) return;
    favorilerPageInitialized = true;

    if (options.skipLayout !== true) {
        await initLayout();
    }

    initUiRefs();
    bindUiEvents();
    bindAuth();
}

export function disposeFavorilerPage() {
    clearSubscriptions();
    authBound = false;
    favorilerPageInitialized = false;
    ui = null;
}

document.addEventListener("DOMContentLoaded", () => {
    void initFavorilerPage();
});
