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
  const snap = await getDoc(userRef);
  const existingData = snap.exists() ? snap.data() : {};

  const token = await user.getIdTokenResult?.().catch(() => null);
  const roles = collectRoles(existingData, token?.claims || {});
  const primaryRole = roles[0] || "student";

  await setDoc(
    userRef,
    {
      uid: user.uid,
      displayName: user.displayName || existingData.displayName || "",
      email: user.email || existingData.email || "",
      photoURL: user.photoURL || existingData.photoURL || "",
      roles,
      role: primaryRole,
      status: existingData.status || "active",
    },
    { merge: true },
  );

  return { roles, role: primaryRole };
}
