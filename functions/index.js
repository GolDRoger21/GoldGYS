const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// Rol atama (HTTPS callable)
// Sadece mevcut admin kullanıcıları çalıştırabilir (caller admin olmalı)
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError("permission-denied", "Admin yetkisi gerekli.");
  }

  const uid = data.uid;
  const role = data.role;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid gerekli.");
  }

  if (!role || typeof role !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "role parametresi gereklidir."
    );
  }

  const normalizedRole = role.trim();
  if (!normalizedRole) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "role boş olamaz."
    );
  }
  const isAdmin = normalizedRole === "admin";

  await admin
    .auth()
    .setCustomUserClaims(uid, { role: normalizedRole, admin: isAdmin });

  return { ok: true, uid, role: normalizedRole, admin: isAdmin };
});
