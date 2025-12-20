import { auth, functions } from "/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const roleSection = document.getElementById("roleUpdateSection");
const roleForm = document.getElementById("roleUpdateForm");
const uidInput = document.getElementById("roleUpdateUid");
const roleSelect = document.getElementById("roleUpdateRole");
const statusEl = document.getElementById("roleUpdateStatus");

let setRoleCallable;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const tokenResult = await user.getIdTokenResult();
  const isAdmin = !!tokenResult.claims.admin;

  if (roleSection) {
    roleSection.style.display = isAdmin ? "block" : "none";
  }

  if (isAdmin) {
    setRoleCallable = httpsCallable(functions, "setAdminClaim");
  }
});

roleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!setRoleCallable) {
    statusEl.textContent = "Bu işlem için admin yetkisi gerekiyor.";
    return;
  }

  const uid = uidInput?.value.trim();
  const role = roleSelect?.value.trim();

  if (!uid || !role) {
    statusEl.textContent = "UID ve rol alanları gereklidir.";
    return;
  }

  statusEl.textContent = "Güncelleniyor...";
  const submitButton = roleForm.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const { data } = await setRoleCallable({ uid, role });
    await auth.currentUser?.getIdToken(true);
    statusEl.textContent = `Rol güncellendi: ${data.uid} → ${data.role}`;
  } catch (error) {
    const message = error?.message || "Rol güncellenemedi.";
    statusEl.textContent = message;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

