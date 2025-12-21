import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
  const tokenResult = await user.getIdTokenResult?.(true).catch((tErr) => {
    console.warn('ID token refresh failed (ignored):', tErr?.message || tErr);
    return null;
  });

  const tokenClaims = tokenResult?.claims || {};
  let snap;
  let readError = null;

  try {
    snap = await getDoc(userRef);
  } catch (error) {
    const code = error?.code || '';
    if (code === 'permission-denied' && typeof user.getIdTokenResult === 'function') {
      try {
        await user.getIdTokenResult(true);
        snap = await getDoc(userRef);
      } catch (retryErr) {
        readError = retryErr;
      }
    } else {
      readError = error;
    }
  }

  const readPermissionDenied = readError?.code === 'permission-denied';
  if (readError && !readPermissionDenied) {
    console.error("Kullanıcı dokümanı alınamadı", readError);
    throw Object.assign(new Error("profile-read-failed"), {
      code: readError?.code || "profile-read-failed",
      original: readError,
    });
  }

  const isNewUser = snap ? !snap.exists() : true;
  const existingData = snap?.exists() ? snap.data() : {};

  const roles = collectRoles(existingData, tokenClaims);
  const primaryRole = roles[0] || "student";

  let currentStatus = existingData.status;
  if (!currentStatus) {
      if (tokenClaims.status) {
        currentStatus = tokenClaims.status;
      } else if (tokenClaims.admin) {
        currentStatus = "active";
      } else {
        currentStatus = isNewUser ? "pending" : "active";
      }
  }

  if (readPermissionDenied) {
    console.warn('Profil Firestore erişimi reddedildi, claim bilgileriyle ilerleniyor.');
    return { roles, role: primaryRole, status: currentStatus };
  }

  // --- DÜZELTME BURADA ---
  // createdAt alanı sadece yeni kullanıcılarda eklenmeli, eskilerde bozulmamalı
  const updatePayload = {
    uid: user.uid,
    displayName: user.displayName || existingData.displayName || "",
    email: user.email || existingData.email || "",
    photoURL: user.photoURL || existingData.photoURL || "",
    roles,
    role: primaryRole,
    status: currentStatus,
    lastLoginAt: serverTimestamp() // Tarihi sunucu zamanı yapıyoruz
  };

  // Eğer kullanıcı yeniyse veya createdAt alanı yoksa ekle
  if (isNewUser || !existingData.createdAt) {
      updatePayload.createdAt = serverTimestamp(); 
  }

  try {
    await setDoc(userRef, updatePayload, { merge: true });
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.warn('Profil yazma izni reddedildi, claim profiliyle devam ediliyor.');
      return { roles, role: primaryRole, status: currentStatus };
    }

    console.error("Kullanıcı dokümanı yazılamadı", error);
    throw Object.assign(new Error("profile-write-failed"), {
      code: error?.code || "profile-write-failed",
      original: error,
    });
  }

  return { roles, role: primaryRole, status: currentStatus };
}