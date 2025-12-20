import { initLayout } from "/js/ui-loader.js";
import { auth, db } from "/js/firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { protectPage } from "/js/role-guard.js";
import {
  formatDate,
  statusLabel,
  showNotice,
  hideNotice,
  toggleButtons,
  ensureAdmin,
  setupLazyLoader,
} from "./utils.js";

const functions = getFunctions(auth.app);
const setUserRoleFn = httpsCallable(functions, "setUserRole");
const updateUserProfileFn = httpsCallable(functions, "updateUserProfile");
const deleteUserFn = httpsCallable(functions, "deleteUserAccount");

const tableBody = document.getElementById("userTableBody");
const refreshButton = document.getElementById("refreshUsers");
const loadMoreButton = document.getElementById("loadMoreUsers");
const lazyLoader = document.getElementById("userLazyLoader");
const noticeBox = document.getElementById("userNotice");
const searchInput = document.getElementById("userSearch");

const detailName = document.getElementById("detailName");
const detailStatus = document.getElementById("detailStatus");
const detailEmail = document.getElementById("detailEmail");
const detailUid = document.getElementById("detailUid");
const detailRoles = document.getElementById("detailRoles");
const detailLastLogin = document.getElementById("detailLastLogin");
const detailPlaceholder = document.getElementById("detailPlaceholder");
const detailContent = document.getElementById("detailContent");

const statusSelect = document.getElementById("statusSelect");
const primaryRoleSelect = document.getElementById("primaryRoleSelect");
const roleChips = document.getElementById("roleChips");
const saveProfileBtn = document.getElementById("saveProfile");
const refreshClaimsBtn = document.getElementById("refreshClaims");
const deleteUserBtn = document.getElementById("deleteUser");

const totalCount = document.getElementById("totalCount");
const activeCount = document.getElementById("activeCount");
const pendingCount = document.getElementById("pendingCount");
const rejectedCount = document.getElementById("rejectedCount");

const allowedRoles = ["student", "editor", "admin"];
const allowedStatus = ["pending", "active", "rejected", "suspended", "deleted"];
const PAGE_SIZE = 20;

const state = {
  users: new Map(),
  order: [],
  filtered: [],
  selectedUser: null,
  adminVerified: false,
  cursor: null,
  reachedEnd: false,
  loading: false,
  lazyObserver: null,
  totalCount: null,
};

initLayout("users");
protectPage(true);

refreshButton?.addEventListener("click", () => loadUsers(true));
loadMoreButton?.addEventListener("click", () => loadUsers());
searchInput?.addEventListener("input", () => {
  filterUsers(searchInput.value);
  renderTable();
});

saveProfileBtn?.addEventListener("click", saveProfile);
refreshClaimsBtn?.addEventListener("click", refreshClaims);
deleteUserBtn?.addEventListener("click", deleteUser);

ensureAdmin(auth, ensureAdminAccess).then((ok) => {
  if (ok) {
    loadUsers(true);
    if (!state.lazyObserver) {
      state.lazyObserver = setupLazyLoader(lazyLoader, () => {
        if (!state.loading && !state.reachedEnd) loadUsers();
      });
    }
  }
});

async function ensureAdminAccess(user) {
  if (!user) return false;
  if (state.adminVerified) return true;

  try {
    const token = await user.getIdTokenResult(true);
    const tokenRole = token.claims.role;
    const tokenIsAdmin = token.claims?.admin === true || tokenRole === "admin";

    if (tokenIsAdmin) {
      state.adminVerified = true;
      return true;
    }

    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.data();
    const firestoreIsAdmin =
      profile?.role === "admin" || (Array.isArray(profile?.roles) && profile.roles.includes("admin"));

    if (firestoreIsAdmin) {
      state.adminVerified = true;
      return true;
    }

    showNotice(noticeBox, "Bu alan için admin yetkisi gerekir.", true);
  } catch (error) {
    console.error("Admin kontrolü hatası", error);
    showNotice(noticeBox, "Yetki doğrulanamadı. Lütfen tekrar deneyin.", true);
  }

  return false;
}

function normalizeUser(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    displayName: data.displayName || "-",
    email: data.email || "-",
    role: data.role || "student",
    roles: Array.isArray(data.roles) ? data.roles : [],
    status: data.status || "pending",
    lastLoginAt: data.lastLoginAt,
    raw: data,
  };
}

async function fetchTotalCount() {
  try {
    const snap = await getCountFromServer(collection(db, "users"));
    state.totalCount = snap.data().count || null;
  } catch (error) {
    console.warn("Toplam kullanıcı sayısı alınamadı", error);
  }
}

async function loadUsers(reset = false) {
  if (state.loading) return;
  if (state.reachedEnd && !reset) return;

  state.loading = true;
  hideNotice(noticeBox);

  if (reset) {
    state.cursor = null;
    state.reachedEnd = false;
    state.order = [];
    state.users.clear();
    tableBody.innerHTML = "";
    fetchTotalCount();
  }

  if (!tableBody.childElementCount) {
    tableBody.innerHTML = `<tr aria-busy="true"><td colspan="6">Kullanıcılar getiriliyor...</td></tr>`;
  }

  try {
    const constraints = [collection(db, "users"), orderBy("createdAt", "desc"), limit(PAGE_SIZE)];
    if (state.cursor && !reset) {
      constraints.push(startAfter(state.cursor));
    }

    const snapshot = await getDocs(query(...constraints));

    if (snapshot.empty) {
      state.reachedEnd = true;
      toggleLoadMore();
      return;
    }

    snapshot.forEach((docSnap) => {
      const user = normalizeUser(docSnap);
      state.users.set(user.id, user);
      if (!state.order.includes(user.id)) {
        state.order.push(user.id);
      }
    });

    filterUsers(searchInput?.value || "");
    renderOverview();
    renderTable();

    state.cursor = snapshot.docs[snapshot.docs.length - 1];
    state.reachedEnd = snapshot.size < PAGE_SIZE;
    toggleLoadMore();
  } catch (error) {
    console.error("Kullanıcılar yüklenirken hata oluştu", error);
    showNotice(noticeBox, "Kullanıcılar yüklenemedi. Lütfen tekrar deneyin.", true);
  } finally {
    state.loading = false;
  }
}

function toggleLoadMore() {
  if (loadMoreButton) {
    loadMoreButton.style.display = state.reachedEnd ? "none" : "inline-flex";
    loadMoreButton.disabled = state.loading;
  }
  if (lazyLoader) {
    lazyLoader.style.display = state.reachedEnd ? "none" : "block";
  }
}

function filterUsers(queryText = "") {
  const text = queryText.toLowerCase();
  state.filtered = state.order
    .map((id) => state.users.get(id))
    .filter((u) => {
      if (!u) return false;
      if (!text) return true;
      return (
        u.displayName.toLowerCase().includes(text) ||
        u.email.toLowerCase().includes(text) ||
        u.status.toLowerCase().includes(text) ||
        u.role.toLowerCase().includes(text)
      );
    });
}

function renderOverview() {
  const users = Array.from(state.users.values());
  const total = state.totalCount ?? users.length;
  totalCount.textContent = total;
  activeCount.textContent = users.filter((u) => u.status === "active").length;
  pendingCount.textContent = users.filter((u) => u.status === "pending").length;
  rejectedCount.textContent = users.filter((u) => u.status === "rejected" || u.status === "suspended").length;
}

function renderTable() {
  if (!state.filtered.length) {
    tableBody.innerHTML = `<tr><td colspan="6">Kayıtlı kullanıcı bulunamadı.</td></tr>`;
    return;
  }

  tableBody.innerHTML = "";
  state.filtered.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.displayName}</td>
      <td>${user.email}</td>
      <td><span class="status-chip status-${user.status}">${statusLabel(user.status)}</span></td>
      <td>${user.role}</td>
      <td>${formatDate(user.lastLoginAt)}</td>
      <td>
        <button class="btn-secondary" data-action="view" data-uid="${user.id}">Detay</button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  bindRowActions();
}

function bindRowActions() {
  tableBody.querySelectorAll("button[data-action='view']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const uid = e.currentTarget.getAttribute("data-uid");
      const selected = state.users.get(uid);
      selectUser(selected);
    });
  });
}

function selectUser(user) {
  state.selectedUser = user;

  if (!user) {
    detailPlaceholder.style.display = "block";
    detailContent.style.display = "none";
    detailStatus.textContent = "-";
    return;
  }

  detailPlaceholder.style.display = "none";
  detailContent.style.display = "block";

  detailName.textContent = user.displayName || "-";
  detailStatus.textContent = statusLabel(user.status);
  detailStatus.className = `status-chip status-${user.status}`;
  detailEmail.textContent = user.email || "-";
  detailUid.textContent = user.id;
  detailRoles.textContent = user.roles?.length ? user.roles.join(", ") : "-";
  detailLastLogin.textContent = formatDate(user.lastLoginAt);

  statusSelect.value = allowedStatus.includes(user.status) ? user.status : "pending";
  primaryRoleSelect.value = allowedRoles.includes(user.role) ? user.role : "student";

  roleChips?.querySelectorAll("input[type='checkbox']")?.forEach((input) => {
    input.checked = user.roles?.includes(input.value) || user.role === input.value;
  });
}

async function saveProfile() {
  if (!state.selectedUser) return;
  hideNotice(noticeBox);

  const uid = state.selectedUser.id;
  const role = primaryRoleSelect.value;
  const status = statusSelect.value;
  const roles = Array.from(roleChips.querySelectorAll("input[type='checkbox']:checked")).map((el) => el.value);

  if (!allowedRoles.includes(role)) {
    showNotice(noticeBox, "Geçerli bir rol seçin.", true);
    return;
  }

  if (!allowedStatus.includes(status)) {
    showNotice(noticeBox, "Geçerli bir statü seçin.", true);
    return;
  }

  toggleButtons([saveProfileBtn, refreshClaimsBtn, deleteUserBtn], true, "Kaydediliyor...");

  try {
    await updateUserProfileFn({ uid, role, status, roles });
    await updateDoc(doc(db, "users", uid), { role, status, roles });
    const updated = { ...state.selectedUser, role, status, roles };
    state.users.set(uid, updated);
    filterUsers(searchInput?.value || "");
    renderOverview();
    renderTable();
    selectUser(updated);
    showNotice(noticeBox, "Üye profili güncellendi.");
  } catch (error) {
    console.error("Profil güncellenemedi", error);
    showNotice(noticeBox, "Profil güncellenirken hata oluştu.", true);
  } finally {
    toggleButtons([saveProfileBtn, refreshClaimsBtn, deleteUserBtn], false);
  }
}

async function refreshClaims() {
  if (!state.selectedUser) return;

  const uid = state.selectedUser.id;
  const role = primaryRoleSelect.value;

  if (!allowedRoles.includes(role)) {
    showNotice(noticeBox, "Geçerli bir rol seçin.", true);
    return;
  }

  toggleButtons([refreshClaimsBtn], true, "Yetkiler güncelleniyor...");

  try {
    await setUserRoleFn({ uid, role });
    showNotice(noticeBox, "Yetkiler yenilendi ve oturum güncellendi.");
  } catch (error) {
    console.error("Yetki yenileme hatası", error);
    showNotice(noticeBox, "Yetkiler güncellenemedi.", true);
  } finally {
    toggleButtons([refreshClaimsBtn], false);
  }
}

async function deleteUser() {
  if (!state.selectedUser) return;

  const confirmed = window.confirm(`${state.selectedUser.displayName} kullanıcısını silmek istediğinize emin misiniz?`);
  if (!confirmed) return;

  toggleButtons([deleteUserBtn], true, "Siliniyor...");

  try {
    await deleteUserFn({ uid: state.selectedUser.id });
    state.users.delete(state.selectedUser.id);
    state.order = state.order.filter((id) => id !== state.selectedUser.id);
    filterUsers(searchInput?.value || "");
    renderOverview();
    renderTable();
    selectUser(null);
    showNotice(noticeBox, "Üyelik silindi.");
  } catch (error) {
    console.error("Silme hatası", error);
    showNotice(noticeBox, "Üyelik silinirken hata oluştu.", true);
  } finally {
    toggleButtons([deleteUserBtn], false);
  }
}
