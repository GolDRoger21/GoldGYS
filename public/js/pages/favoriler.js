import { db, auth } from '../firebase-config.js';
import { showConfirm, showToast } from '../notifications.js';
import { CacheManager } from '../cache-manager.js';
import { collection, getDocs, deleteDoc, doc, where, documentId, query, limit, startAfter, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let ui = {};

const state = {
    favorites: [],
    filtered: [],
    categories: new Map(),
    lastVisible: null,
    isLoading: false,
    hasMore: true,
    PAGE_SIZE: 20
};
const CUSTOM_TEST_LIMIT = 30;

export async function init() {
    console.log('Favoriler sayfası başlatılıyor...');

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
        loadMoreBtn: null
    };

    attachEventListeners();

    const user = auth.currentUser;
    if (user) {
        await loadFavorites(user.uid, true);
        document.body.style.visibility = 'visible';
    } else {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                await loadFavorites(user.uid, true);
                document.body.style.visibility = 'visible';
            }
        });
    }
}

function attachEventListeners() {
    if (ui.categorySelect) ui.categorySelect.addEventListener('change', () => applyFilters());
    if (ui.searchInput) ui.searchInput.addEventListener('input', () => applyFilters());
    if (ui.clearFilters) {
        ui.clearFilters.addEventListener('click', () => {
            if (ui.categorySelect) ui.categorySelect.value = 'all';
            if (ui.searchInput) ui.searchInput.value = '';
            applyFilters();
        });
    }

    if (ui.btnSolveAllExam) {
        ui.btnSolveAllExam.addEventListener('click', () => {
            startCustomTest(state.favorites.map(item => item.questionId), 'Favoriler - Karma Test', 'exam', true);
        });
    }

    if (ui.btnSolveAllPractice) {
        ui.btnSolveAllPractice.addEventListener('click', () => {
            startCustomTest(state.favorites.map(item => item.questionId), 'Favoriler - Karma Öğrenme', 'practice', true);
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
                applyFilters();
                if (ui.list) ui.list.scrollIntoView({ behavior: 'smooth' });
                return;
            }

            const ids = state.favorites.filter(item => item.category === category).map(item => item.questionId);
            const title = `Favoriler - ${category}`;
            const mode = action === 'exam' ? 'exam' : 'practice';
            startCustomTest(ids, title, mode, true);
        });
    }

    if (ui.list) {
        ui.list.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button || button.disabled) return;
            const action = button.dataset.action;
            const id = button.dataset.id;
            const questionId = button.dataset.id; // Some buttons use dataset.id for questionId, others use dataset.question (which is not consistent in original code, but 'solve' uses dataset.id -> questionId)
            // Correction based on original code analysis:
            // remove: dataset.id (favorite doc id?) No, remove needs id but originally `removeFavorite(id)` was called using `item.id`.
            // toggle: dataset.id (questionId)
            // solve: dataset.id (questionId)

            if (action === 'load-more') {
                loadFavorites(auth.currentUser.uid, false);
                return;
            }

            if (action === 'solve') {
                startCustomTest([id], 'Favoriler - Tek Soru', 'practice');
            }
            if (action === 'toggle') {
                const details = document.querySelector(`#fav-${id} .fav-details`);
                if (!details) return;
                details.classList.toggle('is-open');
                button.textContent = details.classList.contains('is-open') ? 'Detayı Gizle' : 'Detayı Gör';
            }
            if (action === 'remove') {
                removeFavorite(id);
            }
        });
    }
}

async function loadFavorites(uid, isInitial = false) {
    if (state.isLoading || (!state.hasMore && !isInitial)) return;
    state.isLoading = true;

    // Eğer ilk yüklemeyse UI'ı temizle
    if (isInitial) {
        if (ui.list) ui.list.innerHTML = '<div class="card p-4 text-center">Yükleniyor...</div>';
        state.favorites = [];
        state.categories.clear();
        state.lastVisible = null;
        state.hasMore = true;
    } else {
        // Yükleniyor butonu göster
        const existingBtn = document.getElementById('btnLoadMore');
        if (existingBtn) existingBtn.textContent = 'Yükleniyor...';
    }

    try {
        let q = query(
            collection(db, `users/${uid}/favorites`),
            // orderBy('addedAt', 'desc'), // Eğer addedAt varsa eklenmeli, şimdilik default
            limit(state.PAGE_SIZE)
        );

        if (state.lastVisible) {
            q = query(q, startAfter(state.lastVisible));
        }

        const snapshot = await Promise.race([
            getDocs(q),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Favoriler yüklenirken zaman aşımı oluştu.")), 8000))
        ]);

        if (snapshot.empty) {
            state.hasMore = false;
            if (isInitial) renderEmptyState();
            else updateLoadMoreButton(); // Butonu kaldır
            state.isLoading = false;
            return;
        }

        state.lastVisible = snapshot.docs[snapshot.docs.length - 1];

        const rawFavorites = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            questionId: docSnap.data().questionId || docSnap.id,
            data: docSnap.data()
        }));

        // Soruları Çek (Cache -> Firestore)
        const activeQuestions = await fetchActiveQuestionsEfficiently(rawFavorites.map(fav => fav.questionId));

        // Veriyi zenginleştir
        const newFavorites = rawFavorites.map(fav => {
            const question = activeQuestions.get(fav.questionId) || {};
            const fallback = fav.data || {};
            return {
                id: fav.id, // This is expected to be the favorite doc ID or questionID? Original code used removeFavorite(id) but dataset.id was item.id. Let's assume item.id is favorite doc ID.
                // Wait, removeFavorite logic: `deleteDoc(doc(db, users/${uid}/favorites, id))` -> so it needs favorite doc ID.
                questionId: fav.questionId,
                category: question.category || fallback.category || 'Genel',
                text: question.text || fallback.text || 'Soru metni yüklenemedi.',
                questionRoot: question.questionRoot || fallback.questionRoot || null,
                onculler: question.onculler || fallback.onculler || [],
                options: question.options || fallback.options || [],
                correctOption: question.correctOption || fallback.correctOption || null,
                solution: question.solution || fallback.solution || {}
            };
        });

        state.favorites = [...state.favorites, ...newFavorites];

        // Kategori verisini güncelle
        buildCategoryData();
        populateCategorySelect();
        renderCategoryCards();

        // Listeyi güncelle
        applyFilters();

        state.isLoading = false;
    } catch (error) {
        console.error("Favoriler yüklenirken hata:", error);
        if (ui.list) ui.list.innerHTML = '<div class="text-danger">Hata oluştu. Lütfen sayfayı yenileyin.</div>';
        state.isLoading = false;
    }
}

// Cache Öncelikli Soru Çekme
async function fetchActiveQuestionsEfficiently(ids) {
    const questionMap = new Map();
    const missingIds = [];

    // 1. Önce Cache'e bak
    for (const id of ids) {
        const cachedQ = await CacheManager.getQuestion(id);
        if (cachedQ) {
            questionMap.set(id, cachedQ);
        } else {
            missingIds.push(id);
        }
    }

    // 2. Eksikleri Firestore'dan çek (Batch ile)
    if (missingIds.length > 0) {
        const remoteMap = await fetchActiveQuestionsMap(missingIds);
        remoteMap.forEach((val, key) => {
            questionMap.set(key, val);
            // Yeni geleni cachele
            CacheManager.saveQuestion(val);
        });
    }

    return questionMap;
}

function buildCategoryData() {
    const categoryMap = new Map();
    state.favorites.forEach(item => {
        const category = item.category || 'Genel';
        if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
        }
        categoryMap.get(category).push(item);
    });
    state.categories = categoryMap;
    if (ui.totalFavorites) ui.totalFavorites.textContent = state.favorites.length; // Toplam yüklenen
    if (ui.totalCategories) ui.totalCategories.textContent = categoryMap.size;
}

function populateCategorySelect() {
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
    ui.categorySelect.value = currentVal; // Seçimi koru
}

function renderCategoryCards() {
    if (!ui.categorySelect || !ui.categoryGrid) return;
    // Sadece 'all' seçiliyken kategori kartlarını güncellemek mantıklı olabilir
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

function applyFilters() {
    if (!ui.categorySelect || !ui.searchInput) return;
    const category = ui.categorySelect.value;
    const search = ui.searchInput.value.trim().toLowerCase();

    state.filtered = state.favorites.filter(item => {
        const categoryMatch = category === 'all' || item.category === category;
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
        ui.list.innerHTML = '<div class="empty-state">Bu filtreye uygun favori soru bulunamadı.</div>';
        return;
    }

    const listHtml = state.filtered.map(item => {
        const optionsHtml = renderOptions(item.options);
        const oncullerHtml = renderOnculler(item.onculler);
        const solutionHtml = renderSolution(item.solution, item.correctOption);

        return `
          <div class="fav-card" id="fav-${item.questionId}">
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
              ${item.questionRoot ? `<div class="fav-detail-block"><div class="fav-detail-title">Soru Kökü</div><div class="fav-detail-content"><p>${item.questionRoot}</p></div></div>` : ''}
              ${oncullerHtml}
              ${optionsHtml}
              ${solutionHtml}
            </div>
          </div>
        `;
    }).join('');

    ui.list.innerHTML = listHtml;

    // Load More Butonu
    updateLoadMoreButton();
}

function updateLoadMoreButton() {
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
    if (ui.list) ui.list.innerHTML = '<div class="empty-state">Henüz favori soru eklemediniz.</div>';
    if (ui.categoryGrid) ui.categoryGrid.innerHTML = '<div class="empty-state">Favori konu bulunamadı.</div>';
    if (ui.totalFavorites) ui.totalFavorites.textContent = '0';
    if (ui.totalCategories) ui.totalCategories.textContent = '0';
    if (ui.filteredCount) ui.filteredCount.textContent = '0';
    setSolveButtonsEnabled(false);
}

function setSolveButtonsEnabled(isEnabled) {
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
    const returnUrl = encodeURIComponent('/favoriler'); // Use relative path for SPA feel? Or stick with full
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
        snap.docs.forEach(docSnap => {
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

    const uid = auth.currentUser.uid;

    // Optimistic Update
    const originalFavorites = [...state.favorites];

    // UI'dan sil
    state.favorites = state.favorites.filter(item => item.id !== id);
    const deletedItem = originalFavorites.find(item => item.id === id);

    buildCategoryData();
    populateCategorySelect();
    renderCategoryCards();
    applyFilters();

    try {
        await deleteDoc(doc(db, `users/${uid}/favorites`, id));
        showToast("Soru favorilerden kaldırıldı.");
        // Cache'i temizlemeye gerek yok, favoriler listesi yenilendi
    } catch (error) {
        console.error(error);
        showToast("Hata oluştu, işlem geri alınıyor...", "error");
        state.favorites = originalFavorites;
        buildCategoryData();
        populateCategorySelect();
        renderCategoryCards();
        applyFilters();
    }
}
