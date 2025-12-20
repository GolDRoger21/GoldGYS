import { initLayout } from "/js/ui-loader.js";
import { auth, db } from "/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { protectPage } from "/js/role-guard.js";

const functions = getFunctions(auth.app);
const setUserRoleFn = httpsCallable(functions, "setUserRole");

const tableBody = document.getElementById("userTableBody");
const refreshButton = document.getElementById("refreshUsers");
const noticeBox = document.getElementById("userNotice");

const allowedRoles = ["student", "editor", "admin"];

initLayout("users");
protectPage(true);

refreshButton?.addEventListener("click", loadUsers);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const token = await user.getIdTokenResult(true);
  if (token.claims.admin) {
    loadUsers();
  }
});

async function loadUsers() {
  const user = auth.currentUser;

  if (!user) {
    showNotice("Giriş yapmanız gerekiyor.", true);
    return;
  }

  const token = await user.getIdTokenResult();
  if (!token.claims.admin) {
    showNotice("Bu alan için yetkiniz yok.", true);
    return;
  }

  tableBody.innerHTML = `<tr><td colspan="4">Kullanıcılar getiriliyor...</td></tr>`;
  hideNotice();

  try {
    const snapshot = await getDocs(collection(db, "users"));
    if (snapshot.empty) {
      tableBody.innerHTML = `<tr><td colspan="4">Kayıtlı kullanıcı bulunamadı.</td></tr>`;
      return;
    }

    tableBody.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${data.displayName || "-"}</td>
        <td>${data.email || "-"}</td>
        <td>
          <select data-uid="${docSnap.id}" class="select-role">
            ${allowedRoles
              .map((r) => `<option value="${r}" ${data.role === r ? "selected" : ""}>${r}</option>`)
              .join("")}
          </select>
        </td>
        <td><button class="btn-gold" data-action="save" data-uid="${docSnap.id}">Kaydet</button></td>
      `;

      tableBody.appendChild(row);
    });

    bindRowActions();
  } catch (error) {
    showNotice("Kullanıcılar yüklenirken hata oluştu.", true);
    console.error("User load error", error);
  }
}

function bindRowActions() {
  tableBody.querySelectorAll("button[data-action='save']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const uid = e.currentTarget.getAttribute("data-uid");
      const select = tableBody.querySelector(`select[data-uid='${uid}']`);
      const role = select?.value;

      if (!allowedRoles.includes(role)) {
        showNotice("Geçersiz rol seçimi.", true);
        return;
      }

      await updateUserRole(uid, role, e.currentTarget);
    });
  });
}

async function updateUserRole(uid, role, buttonEl) {
  buttonEl.disabled = true;
  buttonEl.innerText = "Kaydediliyor...";
  hideNotice();

  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { role });
    await setUserRoleFn({ uid, role });

    showNotice("Rol güncellendi ve yetkiler yenilendi.");
  } catch (error) {
    console.error("Role update error", error);
    showNotice("Rol güncellenirken hata oluştu.", true);
  } finally {
    buttonEl.disabled = false;
    buttonEl.innerText = "Kaydet";
  }
}

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
