import { initLayout } from "/js/ui-loader.js";
import { auth, db } from "/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { protectPage } from "/js/role-guard.js";

const functions = getFunctions(auth.app);
const setUserRoleFn = httpsCallable(functions, "setUserRole");
const updateUserProfileFn = httpsCallable(functions, "updateUserProfile");
const deleteUserFn = httpsCallable(functions, "deleteUserAccount");

const tableBody = document.getElementById("userTableBody");
const refreshButton = document.getElementById("refreshUsers");
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
const allowedStatus = ["pending", "active", "rejected", "suspended"];

const state = {
  users: [],
  filtered: [],
  selectedUser: null,
  adminVerified: false,
};

initLayout("users");
protectPage(true);

refreshButton?.addEventListener("click", loadUsers);
searchInput?.addEventListener("input", () => {
  filterUsers(searchInput.value);
  renderTable();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  if (await ensureAdminAccess(user)) {
    loadUsers();
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

    showNotice("Bu alan için admin yetkisi gerekir.", true);
  } catch (error) {
    console.error("Admin kontrolü hatası", error);
    showNotice("Yetki doğrulanamadı. Lütfen tekrar deneyin.", true);
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

async function loadUsers() {
  const user = auth.currentUser;

  if (!user) {
    showNotice("Giriş yapmanız gerekiyor.", true);
    return;
  }

  const isAdmin = await ensureAdminAccess(user);
  if (!isAdmin) {
    return;
  }

  tableBody.innerHTML = `<tr><td colspan="6">Kullanıcılar getiriliyor...</td></tr>`;
  hideNotice();

  try {
    const snapshot = await getDocs(collection(db, "users"));
    const currentSelectionId = state.selectedUser?.id;
    state.users = snapshot.docs.map(normalizeUser);
    filterUsers(searchInput?.value || "");
    renderOverview();
    renderTable();
    if (currentSelectionId) {
      const found = state.users.find((u) => u.id === currentSelectionId);
      selectUser(found || null);
    }
  } catch (error) {
    showNotice("Kullanıcılar yüklenirken hata oluştu.", true);
    console.error("User load error", error);
  }
}

function filterUsers(query = "") {
  const text = query.toLowerCase();
  state.filtered = state.users.filter((u) => {
    return (
      u.displayName.toLowerCase().includes(text) ||
      u.email.toLowerCase().includes(text) ||
      u.status.toLowerCase().includes(text) ||
      u.role.toLowerCase().includes(text)
    );
  });
}

function renderOverview() {
  totalCount.textContent = state.users.length;
  activeCount.textContent = state.users.filter((u) => u.status === "active").length;
  pendingCount.textContent = state.users.filter((u) => u.status === "pending").length;
  rejectedCount.textContent = state.users.filter((u) => u.status === "rejected" || u.status === "suspended").length;
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
      const selected = state.users.find((u) => u.id === uid);
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
  hideNotice();

  const uid = state.selectedUser.id;
  const role = primaryRoleSelect.value;
  const status = statusSelect.value;
  const roles = Array.from(roleChips.querySelectorAll("input[type='checkbox']:checked")).map((el) => el.value);

  if (!allowedRoles.includes(role)) {
    showNotice("Geçerli bir rol seçin.", true);
    return;
  }

  if (!allowedStatus.includes(status)) {
    showNotice("Geçerli bir statü seçin.", true);
    return;
  }

  toggleDetailButtons(true, "Kaydediliyor...");

  try {
    await updateUserProfileFn({ uid, role, status, roles });
    await updateDoc(doc(db, "users", uid), { role, status, roles });
    showNotice("Üye profili güncellendi.");
    await loadUsers();
    const updated = state.users.find((u) => u.id === uid);
    selectUser(updated);
  } catch (error) {
    console.error("Profil güncellenemedi", error);
    showNotice("Profil güncellenirken hata oluştu.", true);
  } finally {
    toggleDetailButtons(false);
  }
}

async function refreshClaims() {
  if (!state.selectedUser) return;

  const uid = state.selectedUser.id;
  const role = primaryRoleSelect.value;

  if (!allowedRoles.includes(role)) {
    showNotice("Geçerli bir rol seçin.", true);
    return;
  }

  toggleDetailButtons(true, "Yetkiler güncelleniyor...");

  try {
    await setUserRoleFn({ uid, role });
    showNotice("Yetkiler yenilendi ve oturum güncellendi.");
  } catch (error) {
    console.error("Yetki yenileme hatası", error);
    showNotice("Yetkiler güncellenemedi.", true);
  } finally {
    toggleDetailButtons(false);
  }
}

async function deleteUser() {
  if (!state.selectedUser) return;

  const confirmed = window.confirm(`${state.selectedUser.displayName} kullanıcısını silmek istediğinize emin misiniz?`);
  if (!confirmed) return;

  toggleDetailButtons(true, "Siliniyor...");

  try {
    await deleteUserFn({ uid: state.selectedUser.id });
    await loadUsers();
    state.selectedUser = null;
    selectUser(null);
    showNotice("Üyelik silindi.");
  } catch (error) {
    console.error("Silme hatası", error);
    showNotice("Üyelik silinirken hata oluştu.", true);
  } finally {
    toggleDetailButtons(false);
  }
}

function formatDate(dateValue) {
  if (!dateValue) return "-";
  const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status) {
  const labels = {
    active: "Aktif",
    pending: "Beklemede",
    rejected: "Reddedildi",
    suspended: "Askıda",
  };
  return labels[status] || status;
}

function toggleDetailButtons(disabled, loadingText) {
  [saveProfileBtn, refreshClaimsBtn, deleteUserBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = disabled;
    if (loadingText && disabled) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = loadingText;
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
      delete btn.dataset.originalText;
    }
  });
}

saveProfileBtn?.addEventListener("click", saveProfile);
refreshClaimsBtn?.addEventListener("click", refreshClaims);
deleteUserBtn?.addEventListener("click", deleteUser);

function showNotice(message, isError = false) {
  if (!noticeBox) return;
  noticeBox.style.display = "block";
  noticeBox.className = isError ? "alert alert-danger" : "alert alert-success";
  noticeBox.innerText = message;
}

function hideNotice() {
  if (!noticeBox) return;
  noticeBox.style.display = "none";
}
