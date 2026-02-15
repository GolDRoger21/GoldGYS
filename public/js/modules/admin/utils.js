import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase-config.js";

export function formatDate(value) {
  if (!value) return "-";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function statusLabel(status) {
  const labels = {
    active: "Aktif",
    pending: "Beklemede",
    rejected: "Reddedildi",
    suspended: "Askıda",
    deleted: "Silindi",
    draft: "Taslak",
    inactive: "Pasif",
  };
  return labels[status] || status || "-";
}

export function showNotice(box, message, isError = false) {
  if (!box) return;
  box.style.display = "block";
  box.className = isError ? "alert alert-danger" : "alert alert-success";
  box.innerText = message;
}

export function hideNotice(box) {
  if (!box) return;
  box.style.display = "none";
}

export function toggleButtons(buttons, disabled, loadingText) {
  buttons.forEach((btn) => {
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

export function ensureAdmin(auth, check) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) return resolve(false);
      try {
        const hasAdmin = await check(user);
        resolve(hasAdmin);
      } catch (error) {
        console.error("Admin doğrulaması başarısız", error);
        resolve(false);
      }
    });
  });
}

export function setupLazyLoader(triggerEl, callback) {
  if (!triggerEl || typeof IntersectionObserver === "undefined") return null;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        callback();
      }
    });
  });
  observer.observe(triggerEl);
  return observer;
}

export async function getConfigPublic() {
  try {
    const snapshot = await getDoc(doc(db, "config", "public"));
    return snapshot.data() || {};
  } catch (error) {
    console.error("Config fetch error:", error);
    return {};
  }
}
