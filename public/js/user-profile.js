import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function collectRoles(existingData = {}, tokenClaims = {}) {
  const baseRoles = Array.isArray(existingData.roles)
    ? existingData.roles
    : (existingData.role ? [existingData.role] : []);

  const claimRoles = [
    tokenClaims.role,
    tokenClaims.admin ? "admin" : null,
    tokenClaims.editor ? "editor" : null,
  ].filter(Boolean);

  const roles = Array.from(new Set([...baseRoles, ...claimRoles]));
  return roles.length ? roles : ["student"];
}

export async function ensureUserDocument(user) {
  if (!user) return null;

  const userRef = doc(db, "users", user.uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    console.error("Kullanıcı dokümanı alınamadı", error);
    throw Object.assign(new Error("profile-read-failed"), {
      code: error?.code || "profile-read-failed",
      original: error,
    });
  }

  // Kullanıcı veritabanında var mı?
  const isNewUser = !snap.exists();
  const existingData = snap.exists() ? snap.data() : {};

  const token = await user.getIdTokenResult?.().catch(() => null);
  const roles = collectRoles(existingData, token?.claims || {});
  const primaryRole = roles[0] || "student";

  // --- KRİTİK DEĞİŞİKLİK ---
  // Eğer kullanıcı yeniyse statüsü 'pending' olsun.
  // Eğer kullanıcı eskiyse mevcut statüsünü korusun.
  // (Not: Adminler elle oluşturulursa veya eski kayıtsa varsayılan 'active' olabilir)
  let currentStatus = existingData.status;
  if (!currentStatus) {
      // Veritabanında statü yoksa, yeni kullanıcı mı diye bak:
      currentStatus = isNewUser ? "pending" : "active";
  }

  try {
    await setDoc(
      userRef,
      {
        uid: user.uid,
        displayName: user.displayName || existingData.displayName || "",
        email: user.email || existingData.email || "",
        photoURL: user.photoURL || existingData.photoURL || "",
        roles,
        role: primaryRole,
        status: currentStatus, // Belirlenen statüyü kaydet
        lastLoginAt: new Date() // Son giriş zamanını da tutalım
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Kullanıcı dokümanı yazılamadı", error);
    throw Object.assign(new Error("profile-write-failed"), {
      code: error?.code || "profile-write-failed",
      original: error,
    });
  }

  // Fonksiyondan statüyü de döndürelim ki auth.js'de kullanabilelim
  return { roles, role: primaryRole, status: currentStatus };
}