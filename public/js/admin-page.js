import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { auth, db } from "/js/firebase-config.js";
import { initLayout } from "/js/ui-loader.js";
import { protectPage } from "/js/role-guard.js";

const pendingListEl = document.getElementById("pendingList");
const emptyStateEl = document.getElementById("emptyState");
const statusBox = document.getElementById("adminStatus");
const refreshBtn = document.getElementById("refreshPending");
const roleModal = document.getElementById("roleModal");
const roleOptionsEl = document.getElementById("roleOptions");
const saveRoleBtn = document.getElementById("saveRoleBtn");
const roleModalStatus = document.getElementById("roleModalStatus");
const roleModalTitle = document.getElementById("roleModalTitle");
const roleModalEyebrow = document.getElementById("roleModalEyebrow");
const roleModalDescription = document.getElementById("roleModalDescription");

const functions = getFunctions(auth.app);
const setUserRoleFn = httpsCallable(functions, "setUserRole");
const pendingCache = new Map();
let activeRoleTarget = null;
const ROLE_OPTIONS = [
  { value: "student", label: "Öğrenci" },
  { value: "editor", label: "Editör" },
  { value: "admin", label: "Admin" },
];

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

  handleMemberAction(uid, action, button);
});

roleModal?.addEventListener("click", (event) => {
  if (event.target === roleModal) {
    closeRoleModal();
  }
});

document.querySelectorAll("[data-role-modal-close]").forEach((btn) =>
  btn.addEventListener("click", closeRoleModal)
);

saveRoleBtn?.addEventListener("click", saveRoleSelection);

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
  pendingListEl.dataset.loading = "true";

  pendingListEl.innerHTML = "<li class='pending-card'>Bekleyen üyeler yükleniyor...</li>";
  emptyStateEl.style.display = "none";
  hideStatus();

  try {
    const snapshot = await getDocs(
      query(collection(db, "users"), where("status", "==", "pending"))
    );

    pendingCache.clear();
    pendingListEl.innerHTML = "";

    if (snapshot.empty) {
      emptyStateEl.style.display = "block";
      return;
    }

    const fragment = document.createDocumentFragment();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      pendingCache.set(docSnap.id, data);
      fragment.appendChild(renderPendingCard(docSnap.id, data));
    });

    pendingListEl.appendChild(fragment);
  } catch (error) {
    console.error("Bekleyen kullanıcılar getirilirken hata oluştu", error);
    showStatus("Bekleyen kullanıcılar yüklenemedi. Lütfen tekrar deneyin.", true);
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
    </div>
    <p class="note">Onaylanan üyeler seçtiğiniz rolle aktif edilir ve Firestore güvenlik kurallarına uygun şekilde yetkilendirilir.</p>
    <div class="actions">
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

async function handleMemberAction(uid, action, button) {
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
  const selectedRole = roleSelect?.value || pendingCache.get(uid)?.role || "student";
  const newStatus = action === "approve" ? "active" : "rejected";
  const changedBy = { uid: currentUser.uid, email: currentUser.email || null };

  button.disabled = true;
  const originalText = button.innerText;
  button.innerText = action === "approve" ? "Onaylanıyor..." : "Reddediliyor...";
  hideStatus();

  try {
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

    showStatus(
      action === "approve"
        ? "Üye onaylandı ve rol ataması güncellendi."
        : "Başvuru reddedildi.",
      false
    );

    removeCard(uid);
  } catch (error) {
    console.error("Üye durumu güncellenemedi", error);
    showStatus("İşlem tamamlanamadı. Lütfen tekrar deneyin.", true);
  } finally {
    button.disabled = false;
    button.innerText = originalText;
  }
}

function removeCard(uid) {
  const card = pendingListEl?.querySelector(`li[data-uid='${uid}']`);
  if (card) {
    card.remove();
  }
  pendingCache.delete(uid);

  if (pendingListEl && pendingListEl.children.length === 0) {
    emptyStateEl.style.display = "block";
  }
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
