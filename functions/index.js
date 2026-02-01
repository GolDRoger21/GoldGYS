const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const ALLOWED_ROLES = ["student", "editor", "admin"];
const ALLOWED_STATUS = ["pending", "active", "rejected", "suspended", "deleted"];
const ADMIN_AUDIT_COLLECTION = "adminAuditLogs";

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function pickSuccessValue(data) {
  if (!data) return null;
  if (typeof data.successRate === "number") return data.successRate;
  if (typeof data.averageScore === "number") return data.averageScore;
  if (typeof data.score === "number") return data.score;

  if (typeof data.correct === "number" && typeof data.total === "number" && data.total > 0) {
    return (data.correct / data.total) * 100;
  }

  if (typeof data.correctAnswers === "number" && typeof data.attemptedQuestions === "number" && data.attemptedQuestions > 0) {
    return (data.correctAnswers / data.attemptedQuestions) * 100;
  }

  if (typeof data.accuracy === "number") return data.accuracy;

  return null;
}

function ensureUniqueDocs(list) {
  const map = new Map();
  list.forEach((docSnap) => {
    if (!map.has(docSnap.id)) {
      map.set(docSnap.id, docSnap);
    }
  });
  return Array.from(map.values());
}

function extractQuestionId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.id === "string") return value.id;
  if (typeof value.questionId === "string") return value.questionId;
  return null;
}

function filterQuestionRefs(list, questionId) {
  if (!Array.isArray(list)) return { filtered: list, changed: false };
  const filtered = list.filter((item) => extractQuestionId(item) !== questionId);
  return { filtered, changed: filtered.length !== list.length };
}

async function deleteDocsInBatches(docSnaps) {
  if (!docSnaps.length) return;
  const db = admin.firestore();
  for (let i = 0; i < docSnaps.length; i += 450) {
    const batch = db.batch();
    docSnaps.slice(i, i + 450).forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
}

async function cleanupQuestionReferences(questionId) {
  const db = admin.firestore();
  const wrongsQuery = db.collectionGroup("wrongs").where("questionId", "==", questionId);
  const favoritesQuery = db.collectionGroup("favorites").where("questionId", "==", questionId);
  const lessonsQuery = db.collectionGroup("lessons").where("type", "==", "test");

  const [wrongsSnap, favoritesSnap, lessonsSnap] = await Promise.all([
    wrongsQuery.get(),
    favoritesQuery.get(),
    lessonsQuery.get(),
  ]);

  await deleteDocsInBatches([...wrongsSnap.docs, ...favoritesSnap.docs]);

  const lessonUpdates = [];
  lessonsSnap.forEach((lessonDoc) => {
    const data = lessonDoc.data();
    const { filtered, changed } = filterQuestionRefs(data.questions, questionId);
    if (changed) {
      lessonUpdates.push({
        ref: lessonDoc.ref,
        payload: {
          questions: filtered,
          qCount: filtered.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }
  });

  if (lessonUpdates.length) {
    for (let i = 0; i < lessonUpdates.length; i += 450) {
      const batch = db.batch();
      lessonUpdates.slice(i, i + 450).forEach((item) => batch.update(item.ref, item.payload));
      await batch.commit();
    }
  }
}

async function writeAdminAuditLog({ action, targetId, context, success, details = {} }) {
  try {
    const actor = context?.auth
      ? { uid: context.auth.uid, email: context.auth.token?.email || null }
      : null;

    await admin.firestore().collection(ADMIN_AUDIT_COLLECTION).add({
      action,
      targetId,
      actor,
      success,
      details,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn("Audit log yazılamadı", error.message || error);
  }
}

// Rol atama (HTTPS callable)
// Sadece mevcut admin kullanıcıları çalıştırabilir (caller admin olmalı)
function deriveClaimsFromProfile(profile) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  const primaryRole = profile?.role;
  const hasAdminRole = primaryRole === "admin" || roles.includes("admin");
  const hasEditorRole = hasAdminRole || primaryRole === "editor" || roles.includes("editor");

  if (!hasAdminRole && !hasEditorRole) return null;

  if (hasAdminRole) {
    return { admin: true, editor: true, role: "admin" };
  }

  return { editor: true, role: "editor" };
}

async function syncClaimsWithProfile(uid, profile, tokenClaims = {}) {
  const derivedClaims = deriveClaimsFromProfile(profile);
  if (!derivedClaims) return;

  const tokenAlreadyMatches = Object.entries(derivedClaims).every(
    ([key, value]) => tokenClaims[key] === value
  );

  if (tokenAlreadyMatches) return;

  try {
    const user = await admin.auth().getUser(uid);
    const existingClaims = user.customClaims || {};
    const updatedClaims = { ...existingClaims, ...derivedClaims };

    const hasDifferences = Object.entries(derivedClaims).some(
      ([key, value]) => existingClaims[key] !== value
    );

    if (hasDifferences) {
      await admin.auth().setCustomUserClaims(uid, updatedClaims);
    }
  } catch (error) {
    console.warn("Custom claim senkronizasyonu başarısız", error.message || error);
  }
}

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

  await syncClaimsWithProfile(caller.uid, callerData, caller.token || {});
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const uid = data.uid;
  const role = data.role;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid gerekli.");
  }
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    await writeAdminAuditLog({
      action: "setAdminClaim",
      targetId: uid,
      context,
      success: true,
      details: { role },
    });
    return { ok: true, uid };
  } catch (error) {
    await writeAdminAuditLog({
      action: "setAdminClaim",
      targetId: uid,
      context,
      success: false,
      details: { error: error?.message, role },
    });
    throw error;
  }
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

  try {
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

    await writeAdminAuditLog({
      action: "setUserRole",
      targetId: uid,
      context,
      success: true,
      details: { previousRole, newRole: role, actor: callerInfo },
    });

    return { ok: true, uid, role };
  } catch (error) {
    await writeAdminAuditLog({
      action: "setUserRole",
      targetId: uid,
      context,
      success: false,
      details: { error: error?.message, role },
    });
    throw error;
  }
});

exports.updateUserProfile = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const { uid, role, status, roles, displayName, photoURL } = data || {};

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Geçerli bir kullanıcı kimliği gerekli.");
  }

  const actorInfo = {
    uid: context.auth.uid,
    email: context.auth.token?.email || null,
  };

  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    changedBy: actorInfo,
  };

  if (displayName !== undefined) updates.displayName = displayName;
  if (photoURL !== undefined) updates.photoURL = photoURL;

  if (status) {
    if (!ALLOWED_STATUS.includes(status)) {
      throw new functions.https.HttpsError("invalid-argument", "Geçerli bir statü seçin.");
    }
    updates.status = status;

    if (status === "deleted") {
      updates.deletedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.deletedBy = actorInfo;
    }
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

  try {
    await admin.firestore().collection("users").doc(uid).set(updates, { merge: true });

    if (claimsToApply) {
      await admin.auth().setCustomUserClaims(uid, claimsToApply);
    }

    await writeAdminAuditLog({
      action: "updateUserProfile",
      targetId: uid,
      context,
      success: true,
      details: { role: role || null, status: status || null, roles: normalizedRoles, actor: actorInfo },
    });

    return { ok: true, uid, role: role || null, status: status || null, roles: normalizedRoles };
  } catch (error) {
    await writeAdminAuditLog({
      action: "updateUserProfile",
      targetId: uid,
      context,
      success: false,
      details: { error: error?.message, role: role || null, status: status || null },
    });
    throw error;
  }
});

async function deleteCollectionDocs(collectionRef, field, value) {
  const querySnap = await collectionRef.where(field, "==", value).get();
  const deletions = querySnap.docs.map((docSnap) => docSnap.ref.delete());
  await Promise.all(deletions);
}

async function deleteUserSubcollections(uid) {
  const userRef = admin.firestore().collection("users").doc(uid);
  const subCollections = await userRef.listCollections();
  for (const sub of subCollections) {
    const subDocs = await sub.listDocuments();
    if (subDocs.length) {
      await Promise.all(subDocs.map((d) => d.delete()));
    }
  }
}

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const uid = data?.uid;
  const hard = data?.hard === true;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Silinecek kullanıcı kimliği gerekli.");
  }

  const actorInfo = {
    uid: context.auth.uid,
    email: context.auth.token?.email || null,
  };

  const userRef = admin.firestore().collection("users").doc(uid);

  try {
    if (!hard) {
      await userRef.set(
        {
          status: "deleted",
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          deletedBy: actorInfo,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          changedBy: actorInfo,
        },
        { merge: true }
      );

      await writeAdminAuditLog({
        action: "deleteUserAccount",
        targetId: uid,
        context,
        success: true,
        details: { hard, actor: actorInfo },
      });

      return { ok: true, uid, deleted: true };
    }

    await deleteUserSubcollections(uid).catch((err) => {
      console.warn("Alt koleksiyonlar silinirken hata", err.message || err);
    });

    await Promise.allSettled([
      deleteCollectionDocs(admin.firestore().collection("topics"), "ownerId", uid),
      deleteCollectionDocs(admin.firestore().collection("tests"), "ownerId", uid),
      deleteCollectionDocs(admin.firestore().collection("exams"), "createdBy", uid),
    ]);

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

    await writeAdminAuditLog({
      action: "deleteUserAccount",
      targetId: uid,
      context,
      success: true,
      details: { hard, actor: actorInfo },
    });

    return { ok: true, uid, hardDeleted: true };
  } catch (error) {
    await writeAdminAuditLog({
      action: "deleteUserAccount",
      targetId: uid,
      context,
      success: false,
      details: { error: error?.message, hard, actor: actorInfo },
    });
    throw error;
  }
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
    await writeAdminAuditLog({
      action: "getUserClaims",
      targetId: uid,
      context,
      success: true,
    });
    return { ok: true, uid, claims: user.customClaims || {} };
  } catch (error) {
    console.error("Claim bilgisi alınamadı", error);
    await writeAdminAuditLog({
      action: "getUserClaims",
      targetId: uid,
      context,
      success: false,
      details: { error: error?.message },
    });
    throw new functions.https.HttpsError(
      error?.code === "auth/user-not-found" ? "not-found" : "internal",
      "Claim bilgisi alınamadı."
    );
  }
});

function pickFirstDate(data, fields = []) {
  for (const field of fields) {
    const value = normalizeDate(data[field]);
    if (value) return value;
  }
  return null;
}

function mapContentItem(docSnap, dateFields = [], customTitleField) {
  const data = docSnap.data() || {};
  const updatedAt = pickFirstDate(data, dateFields);
  const title =
    (customTitleField && data[customTitleField]) || data.title || data.name || data.examId || docSnap.id;

  return {
    id: docSnap.id,
    title,
    updatedAt,
    successRate: pickSuccessValue(data),
    status: data.status || (data.isActive === false ? "inactive" : "active"),
    path: docSnap.ref.path,
  };
}

async function fetchOwnerCount(collectionName, ownerField, uid) {
  const ref = admin.firestore().collection(collectionName).where(ownerField, "==", uid);
  try {
    const snap = await ref.count().get();
    return snap.data().count || 0;
  } catch (error) {
    console.warn(`${collectionName} sayımı yapılamadı`, error.message || error);
    return 0;
  }
}

async function fetchOwnerSamples(collectionName, ownerField, uid, dateFields = [], limitSize = 5) {
  const ref = admin.firestore().collection(collectionName).where(ownerField, "==", uid);
  for (const field of dateFields) {
    try {
      const snap = await ref.orderBy(field, "desc").limit(limitSize).get();
      if (!snap.empty) {
        return snap.docs;
      }
    } catch (error) {
      console.warn(`${collectionName} örnekleri alınamadı`, error.message || error);
    }
  }
  const fallbackSnap = await ref.limit(limitSize).get();
  return fallbackSnap.docs;
}

function summarizeDocs(docs, dateFields = []) {
  const lastDate = docs.reduce((latest, docSnap) => {
    const candidate = pickFirstDate(docSnap.data() || {}, dateFields);
    const normalized = normalizeDate(candidate);
    if (normalized && (!latest || normalized > latest)) return normalized;
    return latest;
  }, null);

  const successValues = docs
    .map((docSnap) => pickSuccessValue(docSnap.data()))
    .filter((value) => typeof value === "number");

  const averageSuccess = successValues.length
    ? Number((successValues.reduce((sum, val) => sum + val, 0) / successValues.length).toFixed(2))
    : null;

  return { lastDate, averageSuccess };
}

async function summarizeOwnerCollection(collectionName, uid, options = {}) {
  const ownerFields = options.ownerFields || ["ownerId", "createdBy"];
  const dateFields = options.dateFields || ["updatedAt", "createdAt"];
  const sampleLimit = options.limit || 5;

  let totalCount = 0;
  let sampleDocs = [];

  for (const ownerField of ownerFields) {
    totalCount += await fetchOwnerCount(collectionName, ownerField, uid);
    sampleDocs = sampleDocs.concat(
      await fetchOwnerSamples(collectionName, ownerField, uid, dateFields, sampleLimit)
    );
  }

  const uniqueDocs = ensureUniqueDocs(sampleDocs).slice(0, sampleLimit);
  const { lastDate, averageSuccess } = summarizeDocs(uniqueDocs, dateFields);

  return {
    count: totalCount,
    lastUpdated: serializeDate(lastDate),
    averageSuccess,
    items: uniqueDocs.map((docSnap) => {
      const item = mapContentItem(docSnap, dateFields);
      return { ...item, updatedAt: serializeDate(item.updatedAt) };
    }),
  };
}

async function summarizeSubCollection(colRef, options = {}) {
  const dateFields = options.dateFields || ["updatedAt", "completedAt", "createdAt"];
  const limitSize = options.limit || 5;
  const titleField = options.titleField;

  let count = 0;
  try {
    const countSnap = await colRef.count().get();
    count = countSnap.data().count || 0;
  } catch (error) {
    console.warn(`${colRef.path} sayımı yapılamadı`, error.message || error);
  }

  let docs = [];
  for (const field of dateFields) {
    try {
      const snap = await colRef.orderBy(field, "desc").limit(limitSize).get();
      if (!snap.empty) {
        docs = snap.docs;
        break;
      }
    } catch (error) {
      console.warn(`${colRef.path} örnekleri alınamadı`, error.message || error);
    }
  }

  if (!docs.length) {
    const fallback = await colRef.limit(limitSize).get();
    docs = fallback.docs;
  }

  const { lastDate, averageSuccess } = summarizeDocs(docs, dateFields);
  const items = docs.slice(0, limitSize).map((docSnap) => {
    const item = mapContentItem(docSnap, dateFields, titleField);
    return { ...item, updatedAt: serializeDate(item.updatedAt) };
  });

  return { count, lastDate, averageSuccess, items };
}

async function summarizeAttempts(uid) {
  const userRef = admin.firestore().collection("users").doc(uid);
  const [examResults, attempts] = await Promise.all([
    summarizeSubCollection(userRef.collection("examResults"), {
      dateFields: ["completedAt", "updatedAt", "createdAt"],
      titleField: "examId",
    }),
    summarizeSubCollection(userRef.collection("attempts"), {
      dateFields: ["updatedAt", "createdAt", "completedAt"],
      titleField: "title",
    }),
  ]);

  const combinedItems = [...(examResults.items || []), ...(attempts.items || [])];
  const combinedSuccessValues = combinedItems
    .map((item) => (typeof item.successRate === "number" ? item.successRate : null))
    .filter((val) => typeof val === "number");

  const averageSuccess = combinedSuccessValues.length
    ? Number((combinedSuccessValues.reduce((sum, val) => sum + val, 0) / combinedSuccessValues.length).toFixed(2))
    : null;

  const lastUpdated = [normalizeDate(examResults.lastDate), normalizeDate(attempts.lastDate)]
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  return {
    count: (examResults.count || 0) + (attempts.count || 0),
    lastUpdated: serializeDate(lastUpdated),
    averageSuccess,
    items: combinedItems.slice(0, 5),
  };
}

exports.getUserContentSummary = functions.https.onCall(async (data, context) => {
  await ensureCallerIsAdmin(context);

  const uid = data?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Kullanıcı kimliği gerekli.");
  }

  const [topics, tests, attempts] = await Promise.all([
    summarizeOwnerCollection("topics", uid, { ownerFields: ["ownerId", "createdBy"] }),
    summarizeOwnerCollection("tests", uid, { ownerFields: ["ownerId", "createdBy"] }),
    summarizeAttempts(uid),
  ]);

  return { ok: true, uid, topics, tests, attempts };
});

// --- İSTATİSTİK TETİKLEYİCİSİ (YENİ) ---
// Yeni bir kullanıcı kayıt olduğunda çalışır ve günlük sayacı artırır.
exports.onUserCreated = functions.firestore
  .document("users/{uid}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    let dateStr;

    // Tarihi belirle (createdAt varsa kullan, yoksa sunucu zamanını al)
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        dateStr = data.createdAt.toDate().toISOString().split('T')[0]; // YYYY-MM-DD
    } else {
        dateStr = new Date().toISOString().split('T')[0];
    }

    // 'stats/daily_users' dokümanını güncelle
    const statsRef = admin.firestore().collection('stats').doc('daily_users');
    
    try {
        // O günün sayacını atomik olarak +1 artır
        await statsRef.set({
            [dateStr]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
        console.log(`Yeni üye sayacı güncellendi: ${dateStr}`);
    } catch (error) {
        console.error("Sayaç güncelleme hatası:", error);
    }
});

exports.onQuestionDeleted = functions.firestore
  .document("questions/{questionId}")
  .onDelete(async (snap, context) => {
    const { questionId } = context.params;
    try {
      await cleanupQuestionReferences(questionId);
      console.log(`Soru silindi, ilişkili kayıtlar temizlendi: ${questionId}`);
    } catch (error) {
      console.error("Soru silme temizliği başarısız", error);
    }
  });

exports.onQuestionSoftDeleted = functions.firestore
  .document("questions/{questionId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!before?.isDeleted && after?.isDeleted) {
      const { questionId } = context.params;
      try {
        await cleanupQuestionReferences(questionId);
        console.log(`Soru çöp kutusuna taşındı, ilişkiler temizlendi: ${questionId}`);
      } catch (error) {
        console.error("Soru çöp kutusu temizliği başarısız", error);
      }
    }
  });
