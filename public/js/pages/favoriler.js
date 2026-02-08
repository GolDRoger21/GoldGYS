import { auth } from '../firebase-config.js';
import { showToast, showConfirm } from '../notifications.js';
import { db } from '../firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc, documentId } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { CacheManager } from "../modules/cache-manager.js";

const INITIAL_STATE = {
    allFavorites: [],
    filtered: [],
    categories: new Map(),
    visibleCount: 0,
    isLoading: false,
    hasMore: true,
    PAGE_SIZE: 20
};

let state = { ...INITIAL_STATE, isMounted: true };
let ui = {};
let unsubscribeAuth = null;
const CUSTOM_TEST_LIMIT = 30;

export async function init() {
    console.log('Favoriler sayfası başlatılıyor...');

    // 1. State ve UI'ı Sıfırla
    resetState();
    state.isMounted = true;
    ui = {};

    // UI referanslarını güncelle
    ui = {
        list: document.getElementById('favoritesList'),
        categoryGrid: document.getElementById('favoritesCategoryGrid'),
        totalFavorites: document.getElementById('totalFavorites'),
        totalCategories: document.getElementById('totalCategories'),
        filteredCount: document.getElementById('filteredCount'),
        categorySelect: document.getElementById('categorySelect'),
        searchInput: document.getElementById('searchInput'),
        clearFilters: document.getElementById('btnClearFilters'),
        btnSolveAllExam: document.getElementById('btnSolveAllExam'),
        btnSolveAllPractice: document.getElementById('btnSolveAllPractice'),
        loadMoreBtn: null,
        favoritesList: document.getElementById('favoritesList')
    };

    attachEventListeners();

    if (unsubscribeAuth) {
        unsubscribeAuth();
    }

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (!state.isMounted) return;
        if (user) {
            await loadFavorites(user.uid);
            if (state.isMounted && document.body) document.body.style.visibility = 'visible';
        } else {
            resetState();
            state.isMounted = true;

            if (!state.isMounted) return;

            if (ui.list) ui.list.innerHTML = '<div class="empty-state">Favorileri görmek için giriş yapmalısınız.</div>';
            if (ui.totalFavorites) ui.totalFavorites.textContent = '0';
            if (ui.totalCategories) ui.totalCategories.textContent = '0';
            if (ui.filteredCount) ui.filteredCount.textContent = '0';
            if (ui.categoryGrid) ui.categoryGrid.innerHTML = '';
            populateCategorySelect();
            setSolveButtonsEnabled(false);
            if (document.body) document.body.style.visibility = 'visible';
        }
    });

    if (auth.currentUser) {
        // Already handled by listener
    }
}

export function cleanup() {
    state.isMounted = false;
    if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
    }
    resetState();
    ui = {};
}

function resetState() {
    state = {
        ...INITIAL_STATE,
        categories: new Map(),
        isMounted: false // Default to false until re-init
    };
}

function attachEventListeners() {
    if (ui.categorySelect) ui.categorySelect.addEventListener('change', () => applyFilters(true));
    if (ui.searchInput) ui.searchInput.addEventListener('input', () => applyFilters(true));
    if (ui.clearFilters) {
        ui.clearFilters.addEventListener('click', () => {
            if (ui.categorySelect) ui.categorySelect.value = 'all';
            if (ui.searchInput) ui.searchInput.value = '';
            applyFilters(true);
        });
    }

    if (ui.btnSolveAllExam) {
        ui.btnSolveAllExam.addEventListener('click', () => {
            startCustomTest(state.filtered.map(item => item.id), 'Favoriler - Karma Test', 'exam', true);
        });
    }

    if (ui.btnSolveAllPractice) {
        ui.btnSolveAllPractice.addEventListener('click', () => {
            startCustomTest(state.filtered.map(item => item.id), 'Favoriler - Karma Öğrenme', 'practice', true);
        });
    }

    if (ui.categoryGrid) {
        ui.categoryGrid.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-category]');
            if (!button) return;
            const category = button.dataset.category;
            const action = button.dataset.action;

            if (action === 'view') {
                if (ui.categorySelect) ui.categorySelect.value = category;
                applyFilters(true);
                if (ui.list) ui.list.scrollIntoView({ behavior: 'smooth' });
                return;
            }

            const ids = state.allFavorites.filter(item => item.category === category).map(item => item.id);
            const title = `Favoriler - ${category}`;
            const mode = action === 'exam' ? 'exam' : 'practice';
            startCustomTest(ids, title, mode, true);
        });
    }

    if (ui.list) {
        ui.list.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action]');
            if (!actionEl) return;
            if (actionEl.matches('button') && actionEl.disabled) return;
            const action = actionEl.dataset.action;
            const id = actionEl.dataset.id;
            const favoriteDocId = actionEl.dataset.favdocid;

            if (action === 'load-more') {
                loadMoreFavorites();
                return;
            }

            if (action === 'solve') {
                startCustomTest([id], 'Favoriler - Tek Soru', 'practice');
            }
            if (action === 'toggle') {
                const details = document.querySelector(`#fav-${id} .fav-details`);
                if (!details) return;
                details.classList.toggle('is-open');
                if (actionEl) actionEl.textContent = details.classList.contains('is-open') ? 'Detayı Gizle' : 'Detayı Gör';
            }
            if (action === 'remove') {
                if (favoriteDocId) {
                    removeFavorite(favoriteDocId, id);
                } else {
                    console.error("Favori doküman ID'si bulunamadı.");
                    showToast('Favori kaldırılamadı: Doküman ID eksik.', 'error');
                }
            }
        });
    }
}

async function loadFavorites(uid) {
    if (!state.isMounted) return;
    if (state.isLoading) return;
    state.isLoading = true;

    if (ui.favoritesList) ui.favoritesList.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Favoriler yükleniyor...</div></div>';

    try {
        const cacheKey = `favorites_${uid}`;
        let favoritesData = CacheManager.get(cacheKey);

        if (!favoritesData) {
            const q = query(collection(db, `users/${uid}/favorites`));
            const snapshot = await getDocs(q);

            if (!state.isMounted) return;

            if (snapshot.empty) {
                renderEmptyState();
                state.isLoading = false;
                return;
            }

            const rawFavorites = snapshot.docs.map(docSnap => ({
                favDocId: docSnap.id,
                questionId: docSnap.data().questionId || docSnap.id,
                data: docSnap.data()
            }));

            const activeQuestions = await fetchActiveQuestionsEfficiently(rawFavorites.map(fav => fav.questionId));

            if (!state.isMounted) return;

            favoritesData = rawFavorites.map(fav => {
                const question = activeQuestions.get(fav.questionId) || {};
                const fallback = fav.data || {};
                return {
                    favDocId: fav.favDocId,
                    id: fav.questionId,
                    category: question.category || fallback.category || 'Genel',
                    text: question.text || fallback.text || 'Soru metni yüklenemedi.',
                    questionRoot: question.questionRoot || fallback.questionRoot || null,
                    onculler: question.onculler || fallback.onculler || [],
                    options: question.options || fallback.options || [],
                    correctOption: question.correctOption || fallback.correctOption || null,
                    solution: question.solution || fallback.solution || {}
                };
            });

            CacheManager.set(cacheKey, favoritesData, 5 * 60 * 1000);
        } else {
            console.log("Favorites loaded from cache");
        }

        if (!state.isMounted) return;

        state.allFavorites = favoritesData;
        state.filtered = [...state.allFavorites];
        state.visibleCount = Math.min(state.PAGE_SIZE, state.filtered.length);
        state.hasMore = state.filtered.length > state.visibleCount;

        buildCategoryData();
        populateCategorySelect();
        renderCategoryCards();
        applyFilters();
        setSolveButtonsEnabled(state.allFavorites.length > 0);
        state.isLoading = false;

    } catch (error) {
        if (!state.isMounted) return;
        console.error("Favoriler yüklenirken hata:", error);
        if (ui.favoritesList) ui.favoritesList.innerHTML = `<div class="text-danger p-3">Veriler alınamadı: ${error.message}</div>`;
        state.isLoading = false;
    }
}

async function loadMoreFavorites() {
    if (!state.isMounted) return;
    if (state.isLoading || !state.hasMore) return;
    state.isLoading = true;

    const existingBtn = document.getElementById('btnLoadMore');
    if (existingBtn) existingBtn.textContent = 'Yükleniyor...';

    const nextVisibleCount = state.visibleCount + state.PAGE_SIZE;
    state.visibleCount = Math.min(nextVisibleCount, state.filtered.length);
    state.hasMore = state.filtered.length > state.visibleCount;

    applyFilters(false);
    state.isLoading = false;
}

async function fetchActiveQuestionsEfficiently(ids) {
    const questionMap = new Map();
    const missingIds = [];

    for (const id of ids) {
        if (!state.isMounted) break; // Check
        const cachedQ = await CacheManager.getQuestion(id);
        if (cachedQ) {
            questionMap.set(id, cachedQ);
        } else {
            missingIds.push(id);
        }
    }

    if (missingIds.length > 0 && state.isMounted) {
        const remoteMap = await fetchActiveQuestionsMap(missingIds);
        if (state.isMounted) {
            remoteMap.forEach((val, key) => {
                questionMap.set(key, val);
                CacheManager.saveQuestion(val);
            });
        }
    }

    return questionMap;
}

function buildCategoryData() {
    if (!state.isMounted) return;
    const categoryMap = new Map();
    state.allFavorites.forEach(item => {
        const category = item.category || 'Genel';
        if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
        }
        categoryMap.get(category).push(item);
    });
    state.categories = categoryMap;
    if (ui.totalFavorites) ui.totalFavorites.textContent = state.allFavorites.length;
    if (ui.totalCategories) ui.totalCategories.textContent = categoryMap.size;
}

function populateCategorySelect() {
    if (!state.isMounted) return;
    if (!ui.categorySelect) return;
    const currentVal = ui.categorySelect.value;
    const categories = Array.from(state.categories.keys()).sort((a, b) => a.localeCompare(b, 'tr'));
    ui.categorySelect.innerHTML = '<option value="all">Tüm Konular</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        ui.categorySelect.appendChild(option);
    });
    ui.categorySelect.value = currentVal;
}

function renderCategoryCards() {
    if (!state.isMounted) return;
    if (!ui.categorySelect || !ui.categoryGrid) return;
    if (ui.categorySelect.value !== 'all') return;

    if (state.categories.size === 0) {
        ui.categoryGrid.innerHTML = '<div class="empty-state">Favori konu bulunamadı.</div>';
        return;
    }

    const cards = Array.from(state.categories.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'tr'))
        .map(([category, items]) => {
            return `
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
          `;
        }).join('');

    ui.categoryGrid.innerHTML = cards;
}

function applyFilters(resetPagination = true) {
    if (!state.isMounted) return;
    if (!ui.categorySelect || !ui.searchInput) return;
    const category = ui.categorySelect.value;
    const search = ui.searchInput.value.trim().toLowerCase();

    state.filtered = state.allFavorites.filter(item => {
        const categoryMatch = category === 'all' || item.category === category;
        const searchMatch = !search || item.text.toLowerCase().includes(search);
        return categoryMatch && searchMatch;
    });

    if (ui.filteredCount) ui.filteredCount.textContent = state.filtered.length;
    if (resetPagination) {
        state.visibleCount = Math.min(state.PAGE_SIZE, state.filtered.length);
    }
    state.hasMore = state.filtered.length > state.visibleCount;
    renderFavoritesList();
    setSolveButtonsEnabled(state.filtered.length > 0);
}

function renderFavoritesList() {
    if (!state.isMounted) return;
    if (!ui.list) return;
    if (state.filtered.length === 0) {
        ui.list.innerHTML = '<div class="empty-state">Bu filtreye uygun favori soru bulunamadı.</div>';
        return;
    }

    const visibleItems = state.filtered.slice(0, state.visibleCount);
    const listHtml = visibleItems.map(item => {
        const optionsHtml = renderOptions(item.options);
        const oncullerHtml = renderOnculler(item.onculler);
        const solutionHtml = renderSolution(item.solution, item.correctOption);

        return `
          <div class="fav-card" id="fav-${item.questionId}">
            <div class="fav-icon" title="Favoriden kaldır" data-action="remove" data-id="${item.id}" data-favdocid="${item.favDocId}">★</div>
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
              ${item.questionRoot ? `<div class="fav-detail-block"><div class="fav-detail-title">Soru Kökü</div><div class="fav-detail-content"><p>${item.questionRoot}</p></div></div>` : ''}
              ${oncullerHtml}
              ${optionsHtml}
              ${solutionHtml}
            </div>
          </div>
        `;
    }).join('');

    ui.list.innerHTML = listHtml;

    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    if (!state.isMounted) return;
    if (!ui.list || !ui.categorySelect || !ui.searchInput) return;
    const isFiltering = ui.categorySelect.value !== 'all' || ui.searchInput.value.trim().length > 0;

    if (state.hasMore && !isFiltering) {
        const btnDiv = document.createElement('div');
        btnDiv.className = 'text-center mt-3';
        btnDiv.innerHTML = `<button id="btnLoadMore" class="btn btn-outline-secondary" data-action="load-more">Daha Fazla Yükle</button>`;
        ui.list.appendChild(btnDiv);
    }
}

function renderOnculler(onculler) {
    if (!onculler || onculler.length === 0) return '';
    const items = onculler.map(item => `<li>${item}</li>`).join('');
    return `
        <div class="fav-detail-block">
          <div class="fav-detail-title">Öncüller</div>
          <div class="fav-detail-content"><ol>${items}</ol></div>
        </div>
      `;
}

function renderOptions(options) {
    if (!options || options.length === 0) return '';
    const list = options.map(option => {
        if (typeof option === 'string') {
            return `<div class="fav-option-item"><span>•</span><div>${option}</div></div>`;
        }
        return `<div class="fav-option-item"><span>${option.id || '•'}</span><div>${option.text || ''}</div></div>`;
    }).join('');
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
    if (!solution && !correctOption) return '';
    const parts = [];
    if (correctOption) {
        parts.push(`<p><strong>Doğru Cevap:</strong> ${correctOption}</p>`);
    }
    if (solution?.analiz) parts.push(`<p><strong>Analiz:</strong> ${solution.analiz}</p>`);
    if (solution?.dayanakText) parts.push(`<p><strong>Dayanak:</strong> ${solution.dayanakText}</p>`);
    if (solution?.tuzak) parts.push(`<p><strong>Tuzak:</strong> ${solution.tuzak}</p>`);
    if (solution?.hap) parts.push(`<p><strong>HAP Bilgi:</strong> ${solution.hap}</p>`);
    if (!parts.length) return '';
    return `
        <div class="fav-detail-block">
          <div class="fav-detail-title">Çözüm</div>
          <div class="fav-detail-content">${parts.join('')}</div>
        </div>
      `;
}

function renderEmptyState() {
    if (!state.isMounted) return;
    if (ui.list) ui.list.innerHTML = '<div class="empty-state">Henüz favori soru eklemediniz.</div>';
    if (ui.categoryGrid) ui.categoryGrid.innerHTML = '<div class="empty-state">Favori konu bulunamadı.</div>';
    if (ui.totalFavorites) ui.totalFavorites.textContent = '0';
    if (ui.totalCategories) ui.totalCategories.textContent = '0';
    if (ui.filteredCount) ui.filteredCount.textContent = '0';
    setSolveButtonsEnabled(false);
}

function setSolveButtonsEnabled(isEnabled) {
    if (!state.isMounted) return;
    [ui.btnSolveAllExam, ui.btnSolveAllPractice].forEach(btn => {
        if (!btn) return;
        btn.disabled = !isEnabled;
        btn.classList.toggle('disabled', !isEnabled);
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
        showToast('Çözülecek favori soru bulunamadı.', 'warning');
        return;
    }

    const shuffled = shouldShuffle ? shuffle(filteredIds) : filteredIds;
    const finalIds = shuffled.slice(0, CUSTOM_TEST_LIMIT);
    if (shuffled.length > CUSTOM_TEST_LIMIT) {
        showToast(`Test ${CUSTOM_TEST_LIMIT} soru ile sınırlandı.`, 'info');
    }
    localStorage.setItem('customTestQuestionIds', JSON.stringify(finalIds));
    localStorage.setItem('customTestTitle', title);
    localStorage.removeItem('customTestQuestions');
    const returnUrl = encodeURIComponent('/favoriler');
    window.location.href = `/test?mode=custom&source=local&testMode=${mode}&limit=${CUSTOM_TEST_LIMIT}&return=${returnUrl}`;
}

async function fetchActiveQuestionsMap(ids) {
    const activeQuestions = new Map();
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return activeQuestions;

    for (let i = 0; i < uniqueIds.length; i += 10) {
        if (!state.isMounted) break;
        const chunk = uniqueIds.slice(i, i + 10);
        const q = query(collection(db, "questions"), where(documentId(), "in", chunk));
        const snap = await getDocs(q);
        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data?.isDeleted || data?.isActive === false) return;
            activeQuestions.set(docSnap.id, { id: docSnap.id, ...data });
        });
    }

    return activeQuestions;
}

async function removeFavorite(favDocId, questionId) {
    const shouldRemove = await showConfirm("Bu soruyu favorilerinizden kaldırmak istediğinize emin misiniz?", {
        title: "Favoriden Kaldır",
        confirmText: "Kaldır",
        cancelText: "Vazgeç"
    });
    if (!shouldRemove) return;

    const uid = auth.currentUser.uid;

    // Optimistic Update
    const originalAll = [...state.allFavorites];
    const originalFiltered = [...state.filtered];

    state.allFavorites = state.allFavorites.filter(item => item.id !== questionId);

    if (!state.isMounted) return;

    buildCategoryData();
    populateCategorySelect();
    renderCategoryCards();
    applyFilters(true);

    try {
        await deleteDoc(doc(db, `users/${uid}/favorites`, favDocId));
        showToast("Soru favorilerden kaldırıldı.");
        CacheManager.remove(`favorites_${uid}`);
    } catch (error) {
        console.error(error);
        if (state.isMounted) {
            showToast("Hata oluştu, işlem geri alınıyor...", "error");
            state.allFavorites = originalAll;
            state.filtered = originalFiltered;
            buildCategoryData();
            populateCategorySelect();
            renderCategoryCards();
            applyFilters(true);
        }
    }
}
