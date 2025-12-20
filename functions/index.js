const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// Admin claim atama (HTTPS callable)
// Sadece mevcut admin kullanıcıları çalıştırabilir (caller admin olmalı)
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError("permission-denied", "Admin yetkisi gerekli.");
  }
  const uid = data.uid;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid gerekli.");
  }
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  return { ok: true, uid };
});

exports.setUserRole = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError("permission-denied", "Admin yetkisi gerekli.");
  }

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
