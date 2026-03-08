import * as fsdk from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { trackFirestoreOp } from "./observability.js";

function mark(op, tag = 'unknown') {
  trackFirestoreOp(op, tag);
}

export const collection = fsdk.collection;
export const collectionGroup = fsdk.collectionGroup;
export const query = fsdk.query;
export const where = fsdk.where;
export const orderBy = fsdk.orderBy;
export const limit = fsdk.limit;
export const startAfter = fsdk.startAfter;
export const doc = fsdk.doc;
export const serverTimestamp = fsdk.serverTimestamp;
export const Timestamp = fsdk.Timestamp;
export const increment = fsdk.increment;
export const runTransaction = fsdk.runTransaction;
export const writeBatch = fsdk.writeBatch;

export async function getDoc(ref, tag = 'unknown') {
  mark('read', tag);
  return fsdk.getDoc(ref);
}

export async function getDocs(refOrQuery, tag = 'unknown') {
  mark('read', tag);
  return fsdk.getDocs(refOrQuery);
}

export async function addDoc(ref, data, tag = 'unknown') {
  mark('write', tag);
  return fsdk.addDoc(ref, data);
}

export async function setDoc(ref, data, options, tag = 'unknown') {
  mark('write', tag);
  return fsdk.setDoc(ref, data, options);
}

export async function updateDoc(ref, data, tag = 'unknown') {
  mark('write', tag);
  return fsdk.updateDoc(ref, data);
}

export async function deleteDoc(ref, tag = 'unknown') {
  mark('write', tag);
  return fsdk.deleteDoc(ref);
}

export function onSnapshot(refOrQuery, nextOrOptions, errorOrNext, completionOrError, tag = 'unknown') {
  const next = typeof nextOrOptions === 'function' ? nextOrOptions : errorOrNext;
  const options = typeof nextOrOptions === 'object' && nextOrOptions !== null ? nextOrOptions : undefined;
  const error = typeof nextOrOptions === 'function' ? errorOrNext : completionOrError;

  return fsdk.onSnapshot(
    refOrQuery,
    ...(options ? [options] : []),
    (snapshot) => {
      mark('listen', tag);
      if (typeof next === 'function') next(snapshot);
    },
    typeof error === 'function' ? error : undefined
  );
}
