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

const functions = getFunctions(auth.app);
const setUserRoleFn = httpsCallable(functions, "setUserRole");
const getUserClaimsFn = httpsCallable(functions, "getUserClaims");
const updateUserProfileFn = httpsCallable(functions, "updateUserProfile");
const deleteUserFn = httpsCallable(functions, "deleteUserAccount");
const pendingCache = new Map();
const paginationState = { cursor: null, pageSize: 10, reachedEnd: false };
const filterState = { search: "", status: "pending", role: "all" };
let debounceTimer = null;
let activeRoleTarget = null;
let activeDetailTarget = null;
let activeDetailData = null;
const ROLE_OPTIONS = [
  { value: "student", label: "Öğrenci" },
  { value: "editor", label: "Editör" },
  { value: "admin", label: "Admin" },
];
const STATUS_OPTIONS = ["pending", "active", "rejected", "suspended", "deleted"];

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
    const [profileSnap, claimsResult, counts] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      getUserClaimsFn({ uid }),
      fetchUserCounts(uid),
    ]);

    if (!profileSnap.exists()) {
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

    topicCountEl.textContent = counts.topics;
    testCountEl.textContent = counts.tests;
    attemptCountEl.textContent = counts.attempts;

    detailSkeleton.style.display = "none";
    detailContent.style.display = "block";
  } catch (error) {
    console.error("Detay modal yüklenemedi", error);
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
  if (detailNameInput) detailNameInput.value = "";
  if (detailRoleSelect) detailRoleSelect.value = "student";
  if (detailStatusSelect) detailStatusSelect.value = "pending";
  syncSuspendButton("active");
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
