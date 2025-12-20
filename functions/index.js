const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// Rol atama (HTTPS callable)
// Sadece mevcut admin kullanıcıları çalıştırabilir (caller admin olmalı)
async function ensureCallerIsAdmin(context) {
  const caller = context.auth;

  if (!caller) {
    throw new functions.https.HttpsError("permission-denied", "Oturum bulunamadı.");
  }

  // Özel claim'de admin veya rol=admin varsa doğrudan izin ver
  if (caller.token?.admin === true || caller.token?.role === "admin") {
    return;
  }

  // Bazı kullanıcılar admin rolünü yalnızca Firestore profilinde taşıyor olabilir
  const callerDoc = await admin.firestore().collection("users").doc(caller.uid).get();
  const callerData = callerDoc.data();
  const firestoreIsAdmin =
    callerData?.role === "admin" || (Array.isArray(callerData?.roles) && callerData.roles.includes("admin"));

  if (!firestoreIsAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin yetkisi gerekli.");
  }
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const uid = data.uid;
  const role = data.role;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid gerekli.");
  }
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  return { ok: true, uid };
});

exports.setUserRole = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const { uid, role } = data;
  const allowedRoles = ["student", "editor", "admin"];

  if (!uid || !role || !allowedRoles.includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Geçerli uid ve rol gereklidir.");
  }

  const claims = {
    role,
    admin: role === "admin",
    editor: role === "editor" || role === "admin",
  };

  await admin.auth().setCustomUserClaims(uid, claims);

  return { ok: true, uid, role };
});
