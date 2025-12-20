const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const ALLOWED_ROLES = ["student", "editor", "admin"];
const ALLOWED_STATUS = ["pending", "active", "rejected", "suspended"];

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

  const { uid, role } = data || {};

  if (!uid || !role) {
    throw new functions.https.HttpsError("invalid-argument", "Geçerli uid ve rol gereklidir.");
  }

  if (!ALLOWED_ROLES.includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "İzin verilmeyen bir rol seçtiniz.");
  }

  const claims = {
    role,
    admin: role === "admin",
    editor: role === "editor" || role === "admin",
  };

  const callerInfo = {
    uid: context.auth.uid,
    email: context.auth.token?.email || null,
  };

  const userRef = admin.firestore().collection("users").doc(uid);
  const userSnap = await userRef.get();
  const previousRole = userSnap.exists ? userSnap.data().role || null : null;

  const updatedRoles = new Set();
  const existingRoles = Array.isArray(userSnap.data()?.roles) ? userSnap.data().roles : [];
  existingRoles.forEach((r) => ALLOWED_ROLES.includes(r) && updatedRoles.add(r));
  updatedRoles.add(role);

  await userRef.set(
    {
      role,
      roles: Array.from(updatedRoles),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      changedBy: callerInfo,
    },
    { merge: true }
  );

  await admin.auth().setCustomUserClaims(uid, claims);

  await admin.firestore().collection("roleAudit").add({
    targetUid: uid,
    previousRole,
    newRole: role,
    changedBy: callerInfo,
    changedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, uid, role };
});

exports.updateUserProfile = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const { uid, role, status, roles, displayName, photoURL } = data || {};

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Geçerli bir kullanıcı kimliği gerekli.");
  }

  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (displayName !== undefined) updates.displayName = displayName;
  if (photoURL !== undefined) updates.photoURL = photoURL;

  if (status) {
    if (!ALLOWED_STATUS.includes(status)) {
      throw new functions.https.HttpsError("invalid-argument", "Geçerli bir statü seçin.");
    }
    updates.status = status;
  }

  let claimsToApply = null;

  if (role) {
    if (!ALLOWED_ROLES.includes(role)) {
      throw new functions.https.HttpsError("invalid-argument", "Geçerli bir rol seçin.");
    }

    updates.role = role;
    claimsToApply = {
      role,
      admin: role === "admin",
      editor: role === "admin" || role === "editor",
    };
  }

  const normalizedRoles = Array.isArray(roles)
    ? Array.from(new Set(roles.filter(Boolean)))
    : [];

  if (role && !normalizedRoles.includes(role)) {
    normalizedRoles.unshift(role);
  }

  if (normalizedRoles.length) {
    updates.roles = normalizedRoles;
  }

  await admin.firestore().collection("users").doc(uid).set(updates, { merge: true });

  if (claimsToApply) {
    await admin.auth().setCustomUserClaims(uid, claimsToApply);
  }

  return { ok: true, uid, role: role || null, status: status || null, roles: normalizedRoles };
});

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const uid = data?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Silinecek kullanıcı kimliği gerekli.");
  }

  const userRef = admin.firestore().collection("users").doc(uid);

  await userRef.delete().catch((err) => {
    console.warn("Firestore kullanıcı silme hatası (devam ediliyor):", err.message || err);
  });

  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }
  }

  return { ok: true, uid };
});

// Admin kullanıcılar için özel claim bilgilerini getirir
exports.getUserClaims = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const uid = data?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Kullanıcı kimliği gerekli.");
  }

  try {
    const user = await admin.auth().getUser(uid);
    return { ok: true, uid, claims: user.customClaims || {} };
  } catch (error) {
    console.error("Claim bilgisi alınamadı", error);
    throw new functions.https.HttpsError(
      error?.code === "auth/user-not-found" ? "not-found" : "internal",
      "Claim bilgisi alınamadı."
    );
  }
});
