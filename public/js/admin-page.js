import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  deleteDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { auth, db } from "/js/firebase-config.js";
import { initLayout } from "/js/ui-loader.js";
import { protectPage } from "/js/role-guard.js";

const pendingListEl = document.getElementById("pendingList");
const emptyStateEl = document.getElementById("emptyState");
const errorStateEl = document.getElementById("errorState");
const statusBox = document.getElementById("adminStatus");
const refreshBtn = document.getElementById("refreshPending");
const loadMoreBtn = document.getElementById("loadMore");
const searchInput = document.getElementById("pendingSearch");
const statusFilter = document.getElementById("statusFilter");
const roleFilter = document.getElementById("roleFilter");
const roleModal = document.getElementById("roleModal");
const roleOptionsEl = document.getElementById("roleOptions");
const saveRoleBtn = document.getElementById("saveRoleBtn");
const roleModalStatus = document.getElementById("roleModalStatus");
const roleModalTitle = document.getElementById("roleModalTitle");
const roleModalEyebrow = document.getElementById("roleModalEyebrow");
const roleModalDescription = document.getElementById("roleModalDescription");
const detailModal = document.getElementById("detailModal");
const detailModalStatus = document.getElementById("detailModalStatus");
const detailModalTitle = document.getElementById("detailModalTitle");
const detailModalEyebrow = document.getElementById("detailModalEyebrow");
const detailSkeleton = document.getElementById("detailSkeleton");
const detailContent = document.getElementById("detailContent");
const detailEmail = document.getElementById("detailEmail");
const detailUid = document.getElementById("detailUid");
const detailCreatedAt = document.getElementById("detailCreatedAt");
const detailClaims = document.getElementById("detailClaims");
const toastContainer = document.getElementById("toastContainer");
const detailNameInput = document.getElementById("detailNameInput");
const detailRoleSelect = document.getElementById("detailRoleSelect");
const detailStatusSelect = document.getElementById("detailStatusSelect");
const detailUpdateBtn = document.getElementById("detailUpdateBtn");
const detailSuspendBtn = document.getElementById("detailSuspendBtn");
const detailDeleteBtn = document.getElementById("detailDeleteBtn");
const topicCountEl = document.getElementById("topicCount");
const testCountEl = document.getElementById("testCount");
const attemptCountEl = document.getElementById("attemptCount");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const tabMetaCount = document.getElementById("tabMetaCount");
const tabMetaUpdated = document.getElementById("tabMetaUpdated");
const tabMetaSuccess = document.getElementById("tabMetaSuccess");
const contentSkeleton = document.getElementById("contentSkeleton");
const contentTables = {
  topics: document.getElementById("topicsTableBody"),
  tests: document.getElementById("testsTableBody"),
  attempts: document.getElementById("attemptsTableBody"),
};
const contentEmptyStates = {
  topics: document.getElementById("topicsEmpty"),
  tests: document.getElementById("testsEmpty"),
  attempts: document.getElementById("attemptsEmpty"),
};
const searchInputs = {
  topics: document.getElementById("topicsSearch"),
  tests: document.getElementById("testsSearch"),
  attempts: document.getElementById("attemptsSearch"),
};
const statusSelects = {
  topics: document.getElementById("topicsStatus"),
  tests: document.getElementById("testsStatus"),
  attempts: document.getElementById("attemptsStatus"),
};
const paginationControls = {
  topics: {
    prev: document.getElementById("topicsPrev"),
    next: document.getElementById("topicsNext"),
    info: document.getElementById("topicsPageInfo"),
  },
  tests: {
    prev: document.getElementById("testsPrev"),
    next: document.getElementById("testsNext"),
    info: document.getElementById("testsPageInfo"),
  },
  attempts: {
    prev: document.getElementById("attemptsPrev"),
    next: document.getElementById("attemptsNext"),
    info: document.getElementById("attemptsPageInfo"),
  },
};
const contentEditModal = document.getElementById("contentEditModal");
const contentEditEyebrow = document.getElementById("contentEditEyebrow");
const contentEditTitle = document.getElementById("contentEditTitle");
const contentTitleInput = document.getElementById("contentTitleInput");
const contentStatusSelect = document.getElementById("contentStatusSelect");
const contentEditStatus = document.getElementById("contentEditStatus");
const contentSaveBtn = document.getElementById("contentSaveBtn");

const functions = getFunctions(auth.app);
const setUserRoleFn = httpsCallable(functions, "setUserRole");
const getUserClaimsFn = httpsCallable(functions, "getUserClaims");
const updateUserProfileFn = httpsCallable(functions, "updateUserProfile");
const deleteUserFn = httpsCallable(functions, "deleteUserAccount");
const getUserContentSummaryFn = httpsCallable(functions, "getUserContentSummary");
const pendingCache = new Map();
const paginationState = { cursor: null, pageSize: 10, reachedEnd: false };
const filterState = { search: "", status: "pending", role: "all" };
let debounceTimer = null;
let activeRoleTarget = null;
let activeDetailTarget = null;
let activeDetailData = null;
let contentSummary = getEmptyContentSummary();
const ROLE_OPTIONS = [
  { value: "student", label: "Öğrenci" },
  { value: "editor", label: "Editör" },
  { value: "admin", label: "Admin" },
];
const STATUS_OPTIONS = ["pending", "active", "rejected", "suspended", "deleted"];
const SECTION_CONFIGS = {
  topics: {
    collectionPath: (uid) => ["topics"],
    filters: [
      { field: "ownerId", value: (uid) => uid },
      { field: "createdBy", value: (uid) => uid },
    ],
    statusField: "status",
    orderBy: { field: "updatedAt", direction: "desc" },
  },
  tests: {
    collectionPath: (uid) => ["tests"],
    filters: [
      { field: "ownerId", value: (uid) => uid },
      { field: "createdBy", value: (uid) => uid },
    ],
    statusField: "status",
    orderBy: { field: "updatedAt", direction: "desc" },
  },
  attempts: {
    collectionPath: (uid) => ["users", uid, "examResults"],
    filters: [],
    statusField: "result",
    orderBy: { field: "createdAt", direction: "desc" },
  },
};
const sectionManagers = {};
let activeContentEdit = null;
const SECTION_PAGE_SIZE = 6;

protectPage({ requireRole: "admin" });
initLayout("admin");

refreshBtn?.addEventListener("click", () => loadPendingMembers(true));
pendingListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const uid = button.getAttribute("data-uid");
  const action = button.getAttribute("data-action");
  if (action === "edit-role") {
    openRoleModal(uid);
    return;
  }

  if (action === "detail") {
    openDetailModal(uid);
    return;
  }

  handleMemberAction(uid, action, button);
});

loadMoreBtn?.addEventListener("click", () => loadPendingMembers());

searchInput?.addEventListener("input", () => debounceFilters());
statusFilter?.addEventListener("change", () => debounceFilters());
roleFilter?.addEventListener("change", () => debounceFilters());

roleModal?.addEventListener("click", (event) => {
  if (event.target === roleModal) {
    closeRoleModal();
  }
});

document.querySelectorAll("[data-role-modal-close]").forEach((btn) =>
  btn.addEventListener("click", closeRoleModal)
);

saveRoleBtn?.addEventListener("click", saveRoleSelection);

document
  .querySelectorAll("[data-detail-modal-close]")
  .forEach((btn) => btn.addEventListener("click", closeDetailModal));

detailModal?.addEventListener("click", (event) => {
  if (event.target === detailModal) {
    closeDetailModal();
  }
});

detailStatusSelect?.addEventListener("change", (event) => {
  const value = event.target?.value;
  syncSuspendButton(value);
});

detailUpdateBtn?.addEventListener("click", () => {
  if (!activeDetailTarget) return;
  handleMemberAction(activeDetailTarget, "update", detailUpdateBtn, getDetailFormValues());
});

detailSuspendBtn?.addEventListener("click", () => {
  if (!activeDetailTarget) return;
  const nextAction = detailStatusSelect?.value === "suspended" ? "unsuspend" : "suspend";
  handleMemberAction(activeDetailTarget, nextAction, detailSuspendBtn);
});

detailDeleteBtn?.addEventListener("click", () => {
  if (!activeDetailTarget) return;
  const confirmed = window.confirm("Bu kullanıcıyı silmek istediğinizden emin misiniz?");
  if (!confirmed) return;

  const hardDelete = window.confirm(
    "Kalıcı silme yapılsın mı? Onaylarsanız hesap ve ilgili içerik geri alınamaz."
  );

  handleMemberAction(activeDetailTarget, "delete", detailDeleteBtn, { hardDelete });
});

bindContentTabs();
initContentSections();
document.querySelectorAll("[data-content-modal-close]").forEach((btn) =>
  btn.addEventListener("click", closeContentEditModal)
);
contentSaveBtn?.addEventListener("click", saveContentEdit);

function debounceFilters() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => loadPendingMembers(true), 350);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const token = await user.getIdTokenResult(true);
  const hasAdminRole = token.claims.admin || token.claims.role === "admin";

  if (!hasAdminRole) {
    showStatus("Bu sayfa yalnızca admin rolüne sahip hesaplar içindir.", true);
    return;
  }

  loadPendingMembers();
});

async function loadPendingMembers(forceReload = false) {
  if (!pendingListEl || !emptyStateEl) return;

  if (!forceReload && pendingListEl.dataset.loading === "true") return;
  if (paginationState.reachedEnd && !forceReload) return;

  pendingListEl.dataset.loading = "true";
  hideStatus();
  hideErrorState();
  emptyStateEl.style.display = "none";

  if (forceReload) {
    paginationState.cursor = null;
    paginationState.reachedEnd = false;
    pendingListEl.innerHTML = "";
    pendingCache.clear();
  }

  if (!pendingListEl.childElementCount) {
    pendingListEl.innerHTML = "<li class='pending-card'>Bekleyen üyeler yükleniyor...</li>";
  }

  filterState.search = (searchInput?.value || "").trim().toLowerCase();
  filterState.status = statusFilter?.value || filterState.status;
  filterState.role = roleFilter?.value || filterState.role;

  const constraints = [collection(db, "users")];
  if (filterState.status !== "all") {
    constraints.push(where("status", "==", filterState.status));
  }
  if (filterState.role !== "all") {
    constraints.push(where("role", "==", filterState.role));
  }

  constraints.push(orderBy("createdAt", "desc"), limit(paginationState.pageSize));

  if (paginationState.cursor && !forceReload) {
    constraints.push(startAfter(paginationState.cursor));
  }

  try {
    const snapshot = await getDocs(query(...constraints));

    if (forceReload) {
      pendingListEl.innerHTML = "";
    }

    if (snapshot.empty) {
      paginationState.reachedEnd = true;
      toggleLoadMore(false);
      if (!pendingListEl.childElementCount) {
        emptyStateEl.style.display = "block";
      }
      return;
    }

    const fragment = document.createDocumentFragment();
    let added = false;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      pendingCache.set(docSnap.id, data);
      const matchesSearch = filterState.search
        ? (data.displayName || "").toLowerCase().includes(filterState.search) ||
          (data.email || "").toLowerCase().includes(filterState.search)
        : true;
      if (matchesSearch) {
        fragment.appendChild(renderPendingCard(docSnap.id, data));
        added = true;
      }
    });

    if (added) {
      pendingListEl.appendChild(fragment);
    }

    if (!added && !pendingListEl.childElementCount) {
      emptyStateEl.style.display = "block";
    }

    paginationState.cursor = snapshot.docs[snapshot.docs.length - 1];
    paginationState.reachedEnd = snapshot.size < paginationState.pageSize;
    toggleLoadMore(!paginationState.reachedEnd);
  } catch (error) {
    console.error("Bekleyen kullanıcılar getirilirken hata oluştu", error);
    showStatus("Bekleyen kullanıcılar yüklenemedi. Lütfen tekrar deneyin.", true);
    showErrorState("Liste yüklenemedi: " + (error?.message || "Bilinmeyen hata"));
  } finally {
    pendingListEl.dataset.loading = "false";
  }
}

function renderPendingCard(uid, data) {
  const li = document.createElement("li");
  li.className = "pending-card";
  li.setAttribute("data-uid", uid);

  const preferredRole = data.role || "student";
  const currentRoles = Array.isArray(data.roles) ? data.roles.join(", ") : data.role || "student";
  const createdText = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : "-";

  li.innerHTML = `
    <div class="top">
      <div>
        <div class="title">${data.displayName || "İsimsiz Kullanıcı"}</div>
        <div class="email">${data.email || "E-posta belirtilmemiş"}</div>
      </div>
      <div class="pill">UID: ${uid}</div>
    </div>
    <div class="meta">
      <span>Mevcut rol: <strong>${data.role || "belirtilmemiş"}</strong></span>
      <span>Durum: <strong>${data.status || "-"}</strong></span>
      <span>Roller: <strong>${currentRoles}</strong></span>
      <span>Oluşturulma: <strong>${createdText}</strong></span>
    </div>
    <p class="note">Onaylanan üyeler seçtiğiniz rolle aktif edilir ve Firestore güvenlik kurallarına uygun şekilde yetkilendirilir.</p>
    <div class="actions">
      <button type="button" class="btn-navy" data-action="detail" data-uid="${uid}">Detay</button>
      <button type="button" class="btn-gold" data-action="edit-role" data-uid="${uid}">Rolü Düzenle</button>
      <label style="display: flex; align-items: center; gap: 8px; font-weight: 700;">
        Rol:
        <select data-uid="${uid}">
          ${ROLE_OPTIONS
            .map((opt) => `<option value="${opt.value}" ${opt.value === preferredRole ? "selected" : ""}>${opt.label}</option>`)
            .join("")}
        </select>
      </label>
      <button type="button" class="btn-navy" data-action="approve" data-uid="${uid}">Onayla</button>
      <button type="button" class="btn-gold" data-action="reject" data-uid="${uid}" style="background: #fee2e2; color: #991b1b; border: 1px solid rgba(153,27,27,0.2); box-shadow: none;">Reddet</button>
    </div>
  `;

  return li;
}

function renderRoleOptions(selectedRole) {
  if (!roleOptionsEl) return;
  roleOptionsEl.innerHTML = ROLE_OPTIONS.map(
    (opt) => `
      <label class="role-option">
        <input type="radio" name="roleOption" value="${opt.value}" ${
          opt.value === selectedRole ? "checked" : ""
        } />
        <span>${opt.label}</span>
      </label>
    `
  ).join("");
}

function openRoleModal(uid) {
  const data = pendingCache.get(uid);
  if (!data || !roleModal) return;

  activeRoleTarget = uid;
  const selectedRole = data.role || data.preferredRole || "student";
  renderRoleOptions(selectedRole);

  if (roleModalStatus) roleModalStatus.style.display = "none";
  if (roleModalTitle) roleModalTitle.textContent = data.displayName || "Rol Güncelle";
  if (roleModalEyebrow) roleModalEyebrow.textContent = `UID: ${uid}`;
  if (roleModalDescription)
    roleModalDescription.textContent = data.email
      ? `${data.email} için rol seçimi yapın.`
      : "Kullanıcı için bir rol belirleyin.";

  roleModal.classList.add("open");
  roleModal.setAttribute("aria-hidden", "false");
}

function closeRoleModal() {
  if (!roleModal) return;
  activeRoleTarget = null;
  roleModal.classList.remove("open");
  roleModal.setAttribute("aria-hidden", "true");
  if (roleModalStatus) roleModalStatus.style.display = "none";
  toggleRoleModalLoading(false);
}

function toggleRoleModalLoading(isLoading) {
  if (!saveRoleBtn) return;
  saveRoleBtn.disabled = isLoading;
  if (isLoading) {
    saveRoleBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Kaydediliyor...';
  } else {
    saveRoleBtn.innerHTML = "Kaydet";
  }
}

async function openDetailModal(uid) {
  if (!detailModal || !uid) return;

  resetDetailModal();
  detailModal.classList.add("open");
  detailModal.setAttribute("aria-hidden", "false");

  try {
    showContentSkeleton(true);

    const [profileSnap, claimsResult, summary] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      getUserClaimsFn({ uid }),
      fetchContentSummary(uid),
    ]);

    if (!profileSnap.exists()) {
      showContentSkeleton(false);
      setDetailStatus("Kullanıcı profili bulunamadı.", true);
      return;
    }

    const data = profileSnap.data();
    activeDetailTarget = uid;
    activeDetailData = data;

    detailModalTitle.textContent = data.displayName || "Kullanıcı Detayı";
    detailModalEyebrow.textContent = `UID: ${uid}`;
    detailEmail.textContent = data.email || "-";
    detailUid.textContent = uid;
    detailCreatedAt.textContent = formatDateValue(data.createdAt);

    if (detailNameInput) detailNameInput.value = data.displayName || "";
    if (detailRoleSelect) detailRoleSelect.value = data.role || "student";
    if (detailStatusSelect)
      detailStatusSelect.value = STATUS_OPTIONS.includes(data.status) ? data.status : "pending";
    syncSuspendButton(detailStatusSelect?.value || data.status);

    const claims = claimsResult?.data?.claims || {};
    detailClaims.textContent = Object.keys(claims).length
      ? Object.entries(claims)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ")
      : "Claim bulunamadı";

    const safeSummary = summary || getEmptyContentSummary();
    topicCountEl.textContent = safeSummary.topics.count;
    testCountEl.textContent = safeSummary.tests.count;
    attemptCountEl.textContent = safeSummary.attempts.count;

    renderContentSummary(safeSummary);
    loadSectionDataForUser();
    showContentSkeleton(false);
    detailSkeleton.style.display = "none";
    detailContent.style.display = "block";
  } catch (error) {
    console.error("Detay modal yüklenemedi", error);
    showContentSkeleton(false);
    setDetailStatus("Detaylar getirilemedi. Lütfen tekrar deneyin.", true);
  }
}

function resetDetailModal() {
  if (!detailModal) return;
  setDetailStatus("", false, true);
  detailSkeleton.style.display = "block";
  detailContent.style.display = "none";
  activeDetailTarget = null;
  activeDetailData = null;
  detailEmail.textContent = "-";
  detailUid.textContent = "-";
  detailCreatedAt.textContent = "-";
  detailClaims.textContent = "-";
  topicCountEl.textContent = "-";
  testCountEl.textContent = "-";
  attemptCountEl.textContent = "-";
  Object.values(contentTables).forEach((table) => table && (table.innerHTML = ""));
  Object.values(contentEmptyStates).forEach((state) => state && (state.style.display = "none"));
  if (detailNameInput) detailNameInput.value = "";
  if (detailRoleSelect) detailRoleSelect.value = "student";
  if (detailStatusSelect) detailStatusSelect.value = "pending";
  syncSuspendButton("active");
  contentSummary = getEmptyContentSummary();
  renderContentSummary(contentSummary);
  showContentSkeleton(false);
  setActiveTab("topics");
}

function closeDetailModal() {
  if (!detailModal) return;
  detailModal.classList.remove("open");
  detailModal.setAttribute("aria-hidden", "true");
}

function setDetailStatus(message, isError = false, hide = false) {
  if (!detailModalStatus) return;
  detailModalStatus.style.display = hide ? "none" : "block";
  detailModalStatus.className = `alert ${isError ? "error" : "success"}`;
  detailModalStatus.textContent = message;
}

function formatDateValue(value) {
  if (!value) return "-";
  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  }
  return String(value);
}

async function fetchUserCounts(uid) {
  const [topics, tests, attempts] = await Promise.all([
    countUserContent([
      query(collection(db, "topics"), where("ownerId", "==", uid)),
      query(collection(db, "topics"), where("createdBy", "==", uid)),
      collection(db, "users", uid, "topics"),
    ]),
    countUserContent([
      query(collection(db, "tests"), where("ownerId", "==", uid)),
      query(collection(db, "exams"), where("createdBy", "==", uid)),
      collection(db, "users", uid, "tests"),
    ]),
    countUserContent([
      collection(db, "users", uid, "examResults"),
      collection(db, "users", uid, "attempts"),
    ]),
  ]);

  return { topics, tests, attempts };
}

async function countUserContent(references) {
  for (const ref of references) {
    if (!ref) continue;
    try {
      const snap = await getCountFromServer(ref);
      const count = snap.data().count;
      if (typeof count === "number") {
        return count;
      }
    } catch (error) {
      console.warn("Sayım yapılırken hata", error);
    }
  }

  return 0;
}

function getEmptyContentSummary() {
  return {
    topics: { count: 0, lastUpdated: null, averageSuccess: null, items: [] },
    tests: { count: 0, lastUpdated: null, averageSuccess: null, items: [] },
    attempts: { count: 0, lastUpdated: null, averageSuccess: null, items: [] },
  };
}

function countsToSummary(counts = { topics: 0, tests: 0, attempts: 0 }) {
  return {
    topics: { count: counts.topics || 0, lastUpdated: null, averageSuccess: null, items: [] },
    tests: { count: counts.tests || 0, lastUpdated: null, averageSuccess: null, items: [] },
    attempts: { count: counts.attempts || 0, lastUpdated: null, averageSuccess: null, items: [] },
  };
}

function normalizeContentSummary(data) {
  const empty = getEmptyContentSummary();
  if (!data) return empty;

  const normalizeSection = (section, fallback) => {
    const safe = section || {};
    const numericCount = Number(safe.count);
    const countValue = Number.isFinite(numericCount) ? numericCount : fallback.count;

    let averageSuccess = fallback.averageSuccess;
    if (typeof safe.averageSuccess === "number") {
      averageSuccess = Number(safe.averageSuccess.toFixed(2));
    } else if (Number.isFinite(Number(safe.averageSuccess))) {
      averageSuccess = Number(Number(safe.averageSuccess).toFixed(2));
    }

    return {
      count: countValue,
      lastUpdated: safe.lastUpdated || fallback.lastUpdated,
      averageSuccess,
      items: Array.isArray(safe.items) ? safe.items : fallback.items,
    };
  };

  return {
    topics: normalizeSection(data.topics, empty.topics),
    tests: normalizeSection(data.tests, empty.tests),
    attempts: normalizeSection(data.attempts, empty.attempts),
  };
}

async function fetchContentSummary(uid) {
  try {
    const callableResult = await getUserContentSummaryFn({ uid });
    return normalizeContentSummary(callableResult?.data);
  } catch (error) {
    console.warn("Sunucu tarafı içerik özeti alınamadı", error);
    try {
      const counts = await fetchUserCounts(uid);
      return countsToSummary(counts);
    } catch (fallbackError) {
      console.error("İçerik sayıları alınamadı", fallbackError);
      return getEmptyContentSummary();
    }
  }
}

function renderContentSummary(summary) {
  contentSummary = summary || getEmptyContentSummary();

  topicCountEl.textContent = contentSummary.topics.count ?? "-";
  testCountEl.textContent = contentSummary.tests.count ?? "-";
  attemptCountEl.textContent = contentSummary.attempts.count ?? "-";

  const activeKey = document.querySelector(".tab-button.active")?.dataset.tabTarget || "topics";
  updateTabMeta(activeKey);
}

function updateTabMeta(key) {
  const section = contentSummary[key] || {};
  if (tabMetaCount) tabMetaCount.textContent = section.count ?? "-";
  if (tabMetaUpdated) tabMetaUpdated.textContent = section.lastUpdated ? formatDateValue(section.lastUpdated) : "-";
  if (tabMetaSuccess) tabMetaSuccess.textContent = formatSuccess(section.averageSuccess);
}

function updateTabMetaWithLiveData(key, stats) {
  if (!stats) return;
  if (tabMetaCount) tabMetaCount.textContent = stats.count ?? tabMetaCount.textContent;
  if (tabMetaUpdated) tabMetaUpdated.textContent = stats.lastUpdated ? formatDateValue(stats.lastUpdated) : tabMetaUpdated.textContent;
}

function buildUserContentQuery(config, uid, filters, cursor) {
  const path = typeof config.collectionPath === "function" ? config.collectionPath(uid) : [];
  const ref = collection(db, ...path);
  const constraints = [ref];

  const statusField = config.statusField;
  if (filters.status && filters.status !== "all" && statusField) {
    constraints.push(where(statusField, "==", filters.status));
  }

  if (Array.isArray(config.filters)) {
    const filter = config.filters.find((f) => f && typeof f.value === "function" && f.value(uid));
    if (filter) {
      constraints.push(where(filter.field, "==", filter.value(uid)));
    }
  }

  if (config.orderBy?.field) {
    constraints.push(orderBy(config.orderBy.field, config.orderBy.direction || "desc"));
  }

  constraints.push(limit(SECTION_PAGE_SIZE));
  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  return query(...constraints);
}

function docRefFromPath(path) {
  return doc(db, ...path.split("/"));
}

function openContentEditModal(item, sectionKey) {
  if (!contentEditModal || !item) return;
  activeContentEdit = { ...item, sectionKey };
  contentEditEyebrow.textContent = `ID: ${item.id}`;
  contentEditTitle.textContent = item.title || "Kayıt";
  if (contentTitleInput) contentTitleInput.value = item.title || "";
  if (contentStatusSelect) contentStatusSelect.value = (item.status || "active").toString();
  setContentEditStatus("", false, true);
  contentEditModal.classList.add("open");
  contentEditModal.setAttribute("aria-hidden", "false");
}

function closeContentEditModal() {
  if (!contentEditModal) return;
  activeContentEdit = null;
  contentEditModal.classList.remove("open");
  contentEditModal.setAttribute("aria-hidden", "true");
  toggleContentSaveLoading(false);
}

async function saveContentEdit() {
  if (!activeContentEdit) return;
  const title = contentTitleInput?.value?.trim();
  const status = contentStatusSelect?.value;

  if (!title) {
    setContentEditStatus("Başlık zorunludur.", true);
    return;
  }

  toggleContentSaveLoading(true);
  const ref = docRefFromPath(activeContentEdit.path);
  const sectionKey = activeContentEdit.sectionKey;
  try {
    await updateDoc(ref, {
      title,
      status,
      isActive: status === "active",
      updatedAt: serverTimestamp(),
    });
    showToast("İçerik güncellendi", "success");
    setContentEditStatus("Kaydedildi", false);
    closeContentEditModal();
    sectionManagers[sectionKey]?.load(true);
  } catch (error) {
    console.error("İçerik kaydedilemedi", error);
    setContentEditStatus("Değişiklik kaydedilemedi.", true);
  } finally {
    toggleContentSaveLoading(false);
  }
}

function setContentEditStatus(message, isError = false, hide = false) {
  if (!contentEditStatus) return;
  contentEditStatus.style.display = hide ? "none" : "block";
  contentEditStatus.className = `alert ${isError ? "error" : "success"}`;
  contentEditStatus.textContent = message;
}

function toggleContentSaveLoading(isLoading) {
  if (!contentSaveBtn) return;
  contentSaveBtn.disabled = isLoading;
  if (isLoading) {
    contentSaveBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Kaydediliyor...';
  } else {
    contentSaveBtn.innerHTML = "Kaydet";
  }
}

async function confirmAndDelete(item, sectionKey, trigger) {
  const confirmed = window.confirm("Bu kaydı silmek istediğinize emin misiniz?");
  if (!confirmed) return;

  if (trigger) trigger.disabled = true;
  try {
    await deleteDoc(docRefFromPath(item.path));
    showToast("Kayıt silindi", "success");
    sectionManagers[sectionKey]?.load(true);
  } catch (error) {
    console.error("Silme işlemi başarısız", error);
    showToast("Silme tamamlanamadı", "error");
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

async function toggleContentStatus(item, sectionKey, trigger) {
  const nextStatus = item.status === "active" ? "inactive" : "active";
  if (trigger) trigger.disabled = true;
  try {
    await updateDoc(docRefFromPath(item.path), {
      status: nextStatus,
      isActive: nextStatus === "active",
      updatedAt: serverTimestamp(),
    });
    showToast("Durum güncellendi", "success");
    sectionManagers[sectionKey]?.load(true);
  } catch (error) {
    console.error("Durum değiştirilemedi", error);
    showToast("Durum değiştirilemedi", "error");
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

function initContentSections() {
  Object.keys(SECTION_CONFIGS).forEach((key) => {
    sectionManagers[key] = new ContentSection(key, SECTION_CONFIGS[key]);
  });
}

function loadSectionDataForUser() {
  Object.values(sectionManagers).forEach((manager) => manager?.load(true));
}

class ContentSection {
  constructor(key, config) {
    this.key = key;
    this.config = config;
    this.tableBody = contentTables[key];
    this.emptyState = contentEmptyStates[key];
    this.searchInput = searchInputs[key];
    this.statusSelect = statusSelects[key];
    this.pagination = paginationControls[key];
    this.cache = new Map();
    this.state = { page: 1, anchors: [null], reachedEnd: false, loading: false };
    this.bindEvents();
  }

  bindEvents() {
    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => this.debounceLoad());
    }
    if (this.statusSelect) {
      this.statusSelect.addEventListener("change", () => this.load(true));
    }
    if (this.pagination?.next) {
      this.pagination.next.addEventListener("click", () => this.goToPage(1));
    }
    if (this.pagination?.prev) {
      this.pagination.prev.addEventListener("click", () => this.goToPage(-1));
    }
    if (this.tableBody) {
      this.tableBody.addEventListener("click", (event) => this.handleActionClick(event));
    }
  }

  debounceLoad() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.load(true), 300);
  }

  goToPage(delta) {
    const nextPage = this.state.page + delta;
    if (nextPage < 1) return;
    if (delta > 0 && this.state.reachedEnd) return;

    this.state.page = nextPage;
    this.load();
  }

  async load(reset = false) {
    if (!activeDetailTarget || !this.tableBody) return;
    if (this.state.loading) return;

    if (reset) {
      this.state = { page: 1, anchors: [null], reachedEnd: false, loading: false };
    }

    const cursor = this.state.anchors[this.state.page - 1] || null;
    const filters = {
      search: (this.searchInput?.value || "").trim().toLowerCase(),
      status: this.statusSelect?.value || "all",
    };

    const queryRef = buildUserContentQuery(this.config, activeDetailTarget, filters, cursor);

    try {
      this.state.loading = true;
      showContentSkeleton(true);
      const snapshot = await getDocs(queryRef);
      const rows = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || data.name || "(Başlıksız)",
          status: data[this.config.statusField] || data.status || "-",
          updatedAt: data.updatedAt || data.createdAt,
          successRate: data.successRate || data.averageScore || data.score,
          path: docSnap.ref.path,
        };
      });

      const filteredRows = rows.filter((row) => {
        const matchesSearch = filters.search
          ? row.title.toLowerCase().includes(filters.search)
          : true;
        const matchesStatus = filters.status === "all" || (row.status || "").toString() === filters.status;
        return matchesSearch && matchesStatus;
      });

      this.renderRows(filteredRows);
      this.cache.clear();
      filteredRows.forEach((row) => this.cache.set(row.id, row));

      this.state.reachedEnd = snapshot.size < SECTION_PAGE_SIZE;
      this.state.anchors[this.state.page] = snapshot.docs[snapshot.docs.length - 1] || null;
      this.updatePagination();
      updateTabMetaWithLiveData(this.key, { count: this.cache.size, lastUpdated: filteredRows[0]?.updatedAt });
    } catch (error) {
      console.error(`${this.key} listesi yüklenemedi`, error);
      setDetailStatus("İçerik listesi yüklenemedi.", true);
    } finally {
      this.state.loading = false;
      showContentSkeleton(false);
    }
  }

  renderRows(rows) {
    if (!this.tableBody || !this.emptyState) return;
    this.tableBody.innerHTML = "";

    if (!rows.length) {
      this.emptyState.style.display = "block";
      return;
    }

    this.emptyState.style.display = "none";

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.title}</td>
        <td><span class="badge-muted">${row.status || "-"}</span></td>
        <td>${formatDateValue(row.updatedAt)}</td>
        <td>${formatSuccess(row.successRate)}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-secondary" data-action="view" data-id="${row.id}">Görüntüle</button>
            <button type="button" class="btn-navy" data-action="edit" data-id="${row.id}">Düzenle</button>
            <button type="button" class="btn-danger" data-action="delete" data-id="${row.id}">Sil</button>
            <button type="button" class="btn-gold" data-action="toggle" data-id="${row.id}">Durum Değiştir</button>
          </div>
        </td>
      `;
      this.tableBody.appendChild(tr);
    });
  }

  updatePagination() {
    if (!this.pagination?.info) return;
    this.pagination.info.textContent = `${this.state.page} / ${this.state.reachedEnd && !this.state.anchors[this.state.page] ? this.state.page : this.state.page + 1}`;
    if (this.pagination.prev) this.pagination.prev.disabled = this.state.page === 1;
    if (this.pagination.next) this.pagination.next.disabled = this.state.reachedEnd;
  }

  handleActionClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.getAttribute("data-id");
    const item = this.cache.get(id);
    if (!item) return;

    const action = button.getAttribute("data-action");
    if (action === "view") {
      openRecordPath(item.path);
      return;
    }
    if (action === "edit") {
      openContentEditModal(item, this.key);
      return;
    }
    if (action === "delete") {
      confirmAndDelete(item, this.key, button);
      return;
    }
    if (action === "toggle") {
      toggleContentStatus(item, this.key, button);
    }
  }
}

function renderContentList(key, items = []) {
  const listEl = contentLists[key];
  const emptyEl = contentEmptyStates[key];
  if (!listEl || !emptyEl) return;

  listEl.innerHTML = "";
  if (!items.length) {
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";
  items.forEach((item) => listEl.appendChild(createContentItem(item, key)));
}

function createContentItem(item, key) {
  const li = document.createElement("li");
  li.className = "content-item";

  const head = document.createElement("div");
  head.className = "content-item-head";

  const info = document.createElement("div");
  const title = document.createElement("div");
  title.className = "content-title";
  title.textContent = item.title || "(Başlıksız)";
  const meta = document.createElement("div");
  meta.className = "content-meta";
  meta.innerHTML = `
    <span>Güncelleme: ${formatDateValue(item.updatedAt)}</span>
    <span>Başarı: ${formatSuccess(item.successRate)}</span>
    <span>Durum: ${item.status || "-"}</span>
  `;
  info.appendChild(title);
  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "content-actions";

  if (item.path) {
    const visitBtn = document.createElement("button");
    visitBtn.type = "button";
    visitBtn.className = "btn-ghost";
    visitBtn.textContent = "Kayda Git";
    visitBtn.addEventListener("click", () => openRecordPath(item.path));
    actions.appendChild(visitBtn);
  }

  let editor = null;
  if (key !== "attempts") {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-ghost";
    editBtn.textContent = "Düzenle";
    editBtn.addEventListener("click", () => {
      editor = editor || createInlineEditor(item, key, li);
      editor.style.display = editor.style.display === "grid" ? "none" : "grid";
    });
    actions.appendChild(editBtn);
  }

  head.appendChild(info);
  head.appendChild(actions);
  li.appendChild(head);

  if (key !== "attempts") {
    editor = editor || createInlineEditor(item, key, li);
    editor.style.display = "none";
    li.appendChild(editor);
  }

  return li;
}

function createInlineEditor(item, key, container) {
  const wrapper = document.createElement("div");
  wrapper.className = "inline-editor";

  const titleLabel = document.createElement("label");
  titleLabel.textContent = "Başlık";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = item.title || "";
  titleInput.setAttribute("data-field", "title");

  const statusLabel = document.createElement("label");
  statusLabel.textContent = "Durum";
  const statusSelect = document.createElement("select");
  statusSelect.setAttribute("data-field", "status");
  [
    { value: "active", label: "Aktif" },
    { value: "draft", label: "Taslak" },
    { value: "inactive", label: "Pasif" },
  ].forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if ((item.status || "").toString() === opt.value) option.selected = true;
    statusSelect.appendChild(option);
  });

  const actionRow = document.createElement("div");
  actionRow.className = "inline-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-navy";
  saveBtn.textContent = "Kaydet";
  saveBtn.addEventListener("click", () => saveInlineEdit(item, key, wrapper, saveBtn));

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-secondary";
  cancelBtn.textContent = "İptal";
  cancelBtn.addEventListener("click", () => {
    wrapper.style.display = "none";
  });

  actionRow.appendChild(saveBtn);
  actionRow.appendChild(cancelBtn);

  wrapper.appendChild(titleLabel);
  wrapper.appendChild(titleInput);
  wrapper.appendChild(statusLabel);
  wrapper.appendChild(statusSelect);
  wrapper.appendChild(actionRow);

  if (container) container.appendChild(wrapper);
  return wrapper;
}

async function saveInlineEdit(item, key, form, trigger) {
  if (!item?.path) return;

  const payload = { updatedAt: serverTimestamp() };
  const title = form.querySelector("[data-field='title']")?.value?.trim();
  const status = form.querySelector("[data-field='status']")?.value;

  if (title !== undefined) payload.title = title;
  if (status) {
    payload.status = status;
    payload.isActive = status === "active";
  }

  if (trigger) {
    trigger.disabled = true;
    trigger.dataset.originalText = trigger.textContent;
    trigger.textContent = "Kaydediliyor...";
  }

  try {
    await updateDoc(doc(db, item.path), payload);
    showToast("Kaydedildi", "success");
    item.title = payload.title || item.title;
    item.status = payload.status || item.status;
    item.updatedAt = new Date().toISOString();
    renderContentSummary(contentSummary);
    if (form) form.style.display = "none";
  } catch (error) {
    console.error("Inline güncelleme hatası", error);
    setDetailStatus("Değişiklik kaydedilemedi.", true);
  } finally {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = trigger.dataset.originalText || "Kaydet";
    }
  }
}

function openRecordPath(path) {
  if (!path) return;
  const encoded = path.split("/").map((p) => encodeURIComponent(p)).join("~2F");
  const url = `https://console.firebase.google.com/project/goldgys/firestore/data/~2F${encoded}`;
  window.open(url, "_blank", "noopener");
}

function formatSuccess(value) {
  if (typeof value === "number") {
    return `%${value.toFixed(1)}`;
  }
  return "-";
}

function showContentSkeleton(visible) {
  if (!contentSkeleton) return;
  contentSkeleton.style.display = visible ? "grid" : "none";
  tabPanels.forEach((panel) => {
    panel.style.opacity = visible ? "0.6" : "1";
  });
}

function bindContentTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tabTarget;
      setActiveTab(target);
    });
  });

  setActiveTab("topics");
}

function setActiveTab(key) {
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tabTarget === key));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.tabPanel === key));
  updateTabMeta(key);
}

async function saveRoleSelection() {
  if (!activeRoleTarget || !saveRoleBtn) return;

  const selectedInput = roleOptionsEl?.querySelector("input[name='roleOption']:checked");
  const chosenRole = selectedInput?.value;

  if (!chosenRole) {
    showModalStatus("Lütfen bir rol seçin.", true);
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showModalStatus("Oturum bulunamadı.", true);
    return;
  }

  toggleRoleModalLoading(true);
  showModalStatus("", false, true);

  try {
    const userData = pendingCache.get(activeRoleTarget) || {};
    const updatedRoles = Array.from(new Set([...(userData.roles || []), chosenRole]));
    const changedBy = { uid: currentUser.uid, email: currentUser.email || null };

    await updateDoc(doc(db, "users", activeRoleTarget), {
      role: chosenRole,
      roles: updatedRoles,
      updatedAt: serverTimestamp(),
      changedBy,
    });

    await setUserRoleFn({ uid: activeRoleTarget, role: chosenRole });

    pendingCache.set(activeRoleTarget, { ...userData, role: chosenRole, roles: updatedRoles });
    updateCardRole(activeRoleTarget, chosenRole, updatedRoles);

    showModalStatus("Rol güncellendi.");
    setTimeout(closeRoleModal, 700);
  } catch (error) {
    console.error("Rol kaydedilirken hata oluştu", error);
    showModalStatus("Rol kaydedilemedi. Lütfen tekrar deneyin.", true);
  } finally {
    toggleRoleModalLoading(false);
  }
}

function showModalStatus(message, isError = false, hide = false) {
  if (!roleModalStatus) return;
  roleModalStatus.style.display = hide ? "none" : "block";
  roleModalStatus.className = `alert ${isError ? "error" : "success"}`;
  roleModalStatus.innerText = message;
}

function updateCardRole(uid, role, roles = []) {
  const card = pendingListEl?.querySelector(`li[data-uid='${uid}']`);
  if (!card) return;

  const roleLabel = card.querySelector(".meta span:nth-child(1) strong");
  const rolesLabel = card.querySelector(".meta span:nth-child(3) strong");
  const roleSelect = card.querySelector("select[data-uid]");

  if (roleLabel) roleLabel.innerText = role;
  if (rolesLabel) rolesLabel.innerText = Array.isArray(roles) ? roles.join(", ") : role;
  if (roleSelect) roleSelect.value = role;
}

async function handleMemberAction(uid, action, button, payload = {}) {
  if (!uid || !action) return;

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showStatus("İşlem için oturum açmanız gerekiyor.", true);
    return;
  }

  const token = await currentUser.getIdTokenResult(true);
  const hasAdminRole = token.claims.admin || token.claims.role === "admin";
  if (!hasAdminRole) {
    showStatus("Bu işlem için admin yetkisi gerekiyor.", true);
    return;
  }

  const roleSelect = pendingListEl?.querySelector(`select[data-uid='${uid}']`);
  const selectedRole = payload.role || roleSelect?.value || pendingCache.get(uid)?.role || "student";
  const desiredStatus = payload.status;
  const changedBy = { uid: currentUser.uid, email: currentUser.email || null };
  const loadingLabels = {
    approve: "Onaylanıyor...",
    reject: "Reddediliyor...",
    update: "Güncelleniyor...",
    suspend: "Askıya alınıyor...",
    unsuspend: "Aktifleştiriliyor...",
    delete: payload.hardDelete ? "Kalıcı siliniyor..." : "Siliniyor...",
  };

  setButtonLoading(button, true, loadingLabels[action]);
  hideStatus();

  try {
    if (action === "approve" || action === "reject") {
      const newStatus = action === "approve" ? "active" : "rejected";
      const userData = pendingCache.get(uid) || {};
      const updatedRoles = Array.from(new Set([...(userData.roles || []), selectedRole]));

      await updateDoc(doc(db, "users", uid), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        changedBy,
        ...(action === "approve"
          ? {
              role: selectedRole,
              roles: updatedRoles,
            }
          : {}),
      });

      if (action === "approve") {
        await setUserRoleFn({ uid, role: selectedRole });
        pendingCache.set(uid, {
          ...(pendingCache.get(uid) || {}),
          role: selectedRole,
          roles: updatedRoles,
        });
      }

      showToast(
        action === "approve"
          ? "Üye onaylandı ve rol ataması güncellendi."
          : "Başvuru reddedildi.",
        "success"
      );
      removeCard(uid);
      return;
    }

    if (action === "update") {
      const roleToApply = selectedRole || payload.role;
      const statusToApply = STATUS_OPTIONS.includes(desiredStatus) ? desiredStatus : undefined;

      await updateUserProfileFn({
        uid,
        role: roleToApply,
        status: statusToApply,
        displayName: payload.displayName || undefined,
      });

      if (roleToApply) {
        await setUserRoleFn({ uid, role: roleToApply });
      }

      showToast("Üye bilgileri güncellendi.");
      await loadPendingMembers(true);
      await openDetailModal(uid);
      return;
    }

    if (action === "suspend" || action === "unsuspend") {
      const statusToApply = action === "suspend" ? "suspended" : "active";
      await updateUserProfileFn({ uid, status: statusToApply });
      showToast(
        statusToApply === "suspended" ? "Üye askıya alındı." : "Üye tekrar aktifleştirildi.",
        "success"
      );
      if (detailStatusSelect) detailStatusSelect.value = statusToApply;
      syncSuspendButton(statusToApply);
      await loadPendingMembers(true);
      await openDetailModal(uid);
      return;
    }

    if (action === "delete") {
      await deleteUserFn({ uid, hard: payload.hardDelete === true });
      showToast(
        payload.hardDelete ? "Hesap ve ilişkili veriler silindi." : "Üyelik silindi (soft delete).",
        "success"
      );
      removeCard(uid);
      await loadPendingMembers(true);
      closeDetailModal();
      return;
    }
  } catch (error) {
    console.error("Üye durumu güncellenemedi", error);
    showToast("İşlem tamamlanamadı. Lütfen tekrar deneyin.", "error");
    showStatus("İşlem tamamlanamadı. Lütfen tekrar deneyin.", true);
  } finally {
    setButtonLoading(button, false);
  }
}

function setButtonLoading(button, isLoading, label) {
  if (!button) return;
  if (isLoading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    const loadingText = label || button.innerText || "İşleniyor";
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${loadingText}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

function syncSuspendButton(status) {
  if (!detailSuspendBtn) return;
  const isSuspended = status === "suspended";
  detailSuspendBtn.textContent = isSuspended ? "Askıdan Çıkar" : "Askıya Al";
  detailSuspendBtn.dataset.suspended = isSuspended ? "true" : "false";
}

function getDetailFormValues() {
  return {
    displayName: detailNameInput?.value?.trim() || undefined,
    role: detailRoleSelect?.value || undefined,
    status: detailStatusSelect?.value || undefined,
  };
}

function removeCard(uid) {
  const card = pendingListEl?.querySelector(`li[data-uid='${uid}']`);
  if (card) {
    card.remove();
  }
  pendingCache.delete(uid);

  if (pendingListEl && pendingListEl.children.length === 0) {
    emptyStateEl.style.display = "block";
    toggleLoadMore(false);
  }
}

function showToast(message, type = "success", duration = 3200) {
  if (!toastContainer) {
    showStatus(message, type === "error");
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const textSpan = document.createElement("span");
  textSpan.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Kapat");
  closeBtn.textContent = "×";

  closeBtn.addEventListener("click", () => toast.remove());

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}

function showStatus(message, isError = false) {
  if (!statusBox) return;
  statusBox.style.display = "block";
  statusBox.className = `alert ${isError ? "error" : "success"}`;
  statusBox.innerText = message;
}

function hideStatus() {
  if (!statusBox) return;
  statusBox.style.display = "none";
}

function toggleLoadMore(shouldShow) {
  if (!loadMoreBtn) return;
  loadMoreBtn.style.display = shouldShow ? "inline-flex" : "none";
  loadMoreBtn.disabled = !shouldShow;
}

function showErrorState(message) {
  if (!errorStateEl) return;
  errorStateEl.style.display = "block";
  errorStateEl.textContent = message;
}

function hideErrorState() {
  if (!errorStateEl) return;
  errorStateEl.style.display = "none";
  errorStateEl.textContent = "";
}
