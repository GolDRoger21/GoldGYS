import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, addDoc, collection, getDocs, limit, orderBy, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { readSessionCache, writeSessionCache, clearSessionByPrefix } from "./session-cache.js";
import { USER_CACHE_KEYS } from "./cache-keys.js";

const USER_PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;
const USER_ACTIVITY_CACHE_TTL_MS = 5 * 60 * 1000;

function readCachedUserProfile(cacheKey) {
    return readSessionCache(cacheKey, USER_PROFILE_CACHE_TTL_MS, {
        allowLegacy: true,
        onError: (e) => console.warn("Cache read error:", e)
    });
}

function writeCachedUserProfile(cacheKey, data) {
    writeSessionCache(cacheKey, data, {
        onError: (e) => console.warn("Cache write error:", e)
    });
}



function clearActivityCaches(uid) {
    if (!uid) return;
    sessionStorage.removeItem(`user_last_activity_${uid}`);
    clearSessionByPrefix(`user_recent_activities_${uid}_`);
}

/**
 * Kullanıcı veritabanında var mı kontrol eder, yoksa oluşturur.
 * Varsa son giriş zamanını ve Google bilgilerini günceller.
 * @param {object} user - Firebase Auth kullanıcısı
 */
export async function ensureUserDocument(user) {
    if (!user) throw new Error("Kullanıcı bilgisi bulunamadı");

    const userRef = doc(db, "users", user.uid);

    try {
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            // Kullanıcı varsa: Sadece izin verilen alanları güncelle
            await updateDoc(userRef, {
                lastLoginAt: serverTimestamp(),
                // Firestore kuralları bu alanlara izin vermeli
                displayName: user.displayName || null,
                photoURL: user.photoURL || null,
                email: user.email || null
            }).catch(err => console.warn("Profil güncelleme uyarısı (Önemsiz):", err));

            return { ...userSnap.data(), _isNew: false };
        } else {
            // Kullanıcı yoksa: Yeni kayıt oluştur
            const newUserData = {
                uid: user.uid,
                email: user.email || null,
                displayName: user.displayName || null,
                photoURL: user.photoURL || null,
                role: 'user',        // Varsayılan rol
                status: 'pending',   // Varsayılan durum (Onay Bekliyor)
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            await setDoc(userRef, newUserData);
            return { ...newUserData, _isNew: true };
        }
    } catch (error) {
        console.error("ensureUserDocument hatası:", error);
        throw error;
    }
}

/**
 * Kullanıcı profilini getirir.
 * ÖNCE SessionStorage'a bakar (Maliyet: 0), yoksa Firestore'dan çeker (Maliyet: 1).
 */
export async function getUserProfile(uid, options = {}) {
    if (!uid) return null;

    const CACHE_KEY = USER_CACHE_KEYS.userProfile(uid);
    const forceRefresh = Boolean(options?.forceRefresh || options?.force);

    // 1. ADIM: Cache control
    if (!forceRefresh) {
        const cachedData = readCachedUserProfile(CACHE_KEY);
        if (cachedData) {
            return cachedData;
        }
    }

    // 2. ADIM: Firestore'dan çek
    try {
        const userRef = doc(db, "users", uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            const userData = docSnap.data();

            // Tarihleri string'e çevirip önbelleğe al
            const cacheableData = {
                ...userData,
                createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate().toISOString() : userData.createdAt,
                lastLoginAt: userData.lastLoginAt?.toDate ? userData.lastLoginAt.toDate().toISOString() : userData.lastLoginAt
            };

            writeCachedUserProfile(CACHE_KEY, cacheableData);
            return userData;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Profil verisi alınırken hata:", error);
        throw error;
    }
}

/**
 * Profil güncellendiğinde önbelleği de günceller.
 */
export function updateUserCache(uid, newData) {
    const CACHE_KEY = USER_CACHE_KEYS.userProfile(uid);
    try {
        const currentData = readCachedUserProfile(CACHE_KEY) || {};
        const updatedData = { ...currentData, ...newData };
        writeCachedUserProfile(CACHE_KEY, updatedData);
    } catch (e) {
        console.warn("Cache update hatası:", e);
    }
}

/**
 * Çıkış yaparken önbelleği temizler.
 */
export function clearUserCache(uid) {
    if (uid) sessionStorage.removeItem(USER_CACHE_KEYS.userProfile(uid));
    sessionStorage.clear();
}

/**
 * Kullanıcının son eriştiği içeriği kaydeder.
 * @param {string} uid - Kullanıcı ID
 * @param {object} activity - { type: 'topic'|'test', id: string, title: string, progress: number }
 */
export async function saveUserActivity(uid, activity) {
    if (!uid || !activity) return;

    try {
        const activityRef = doc(db, `users/${uid}/activity/last_access`);
        await setDoc(activityRef, {
            ...activity,
            timestamp: serverTimestamp()
        }, { merge: true });

        // Ayrıca geçmişe de ekleyelim (History)
        const historyRef = collection(db, `users/${uid}/activity_history`);
        await addDoc(historyRef, {
            ...activity,
            timestamp: serverTimestamp()
        });

        clearActivityCaches(uid);

    } catch (e) {
        console.warn("Aktivite kaydedilemedi:", e);
    }
}

/**
 * Kullanıcının son aktivitesini getirir.
 */
export async function getLastActivity(uid) {
    if (!uid) return null;
    const cacheKey = `user_last_activity_${uid}`;
    const cached = readSessionCache(cacheKey, USER_ACTIVITY_CACHE_TTL_MS);
    if (cached) return cached;

    try {
        const docRef = doc(db, `users/${uid}/activity/last_access`);
        const docSnap = await getDoc(docRef);
        const data = docSnap.exists() ? docSnap.data() : null;
        writeSessionCache(cacheKey, data);
        return data;
    } catch (e) {
        return null;
    }
}

/**
 * Kullanıcının son aktivitelerini getirir.
 */
export async function getRecentActivities(uid, limitCount = 3) {
    if (!uid) return [];
    const cacheKey = `user_recent_activities_${uid}_${limitCount}`;
    const cached = readSessionCache(cacheKey, USER_ACTIVITY_CACHE_TTL_MS);
    if (cached) return cached;

    try {
        const activityRef = collection(db, `users/${uid}/activity_history`);
        const q = query(activityRef, orderBy("timestamp", "desc"), limit(limitCount));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(docSnap => docSnap.data());
        writeSessionCache(cacheKey, data);
        return data;
    } catch (e) {
        return [];
    }
}
