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

const functions = getFunctions(auth.app);
const setUserRoleFn = httpsCallable(functions, "setUserRole");
const pendingCache = new Map();

protectPage({ requireRole: "admin" });
initLayout("admin");

refreshBtn?.addEventListener("click", () => loadPendingMembers(true));
pendingListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const uid = button.getAttribute("data-uid");
  const action = button.getAttribute("data-action");
  handleMemberAction(uid, action, button);
});

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
  const roleOptions = [
    { value: "student", label: "Öğrenci" },
    { value: "editor", label: "Editör" },
    { value: "admin", label: "Admin" },
  ];

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
      <label style="display: flex; align-items: center; gap: 8px; font-weight: 700;">
        Rol:
        <select data-uid="${uid}">
          ${roleOptions
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
      ...(action === "approve"
        ? {
            role: selectedRole,
            roles: updatedRoles,
          }
        : {}),
    });

    if (action === "approve") {
      await setUserRoleFn({ uid, role: selectedRole });
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
