import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, addDoc, collection, getDocs, limit, orderBy, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

            return userSnap.data();
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
            return newUserData;
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
export async function getUserProfile(uid) {
    if (!uid) return null;

    const CACHE_KEY = `user_profile_${uid}`;

    // 1. ADIM: Önbelleği Kontrol Et
    try {
        const cachedData = sessionStorage.getItem(CACHE_KEY);
        if (cachedData) {
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.warn("Önbellek okuma hatası:", e);
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

            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheableData));
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
    const CACHE_KEY = `user_profile_${uid}`;
    try {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY);
        let currentData = cachedRaw ? JSON.parse(cachedRaw) : {};
        const updatedData = { ...currentData, ...newData };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));
    } catch (e) {
        console.warn("Cache update hatası:", e);
    }
}

/**
 * Çıkış yaparken önbelleği temizler.
 */
export function clearUserCache(uid) {
    if (uid) sessionStorage.removeItem(`user_profile_${uid}`);
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

    } catch (e) {
        console.warn("Aktivite kaydedilemedi:", e);
    }
}

/**
 * Kullanıcının son aktivitesini getirir.
 */
export async function getLastActivity(uid) {
    try {
        const docRef = doc(db, `users/${uid}/activity/last_access`);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    } catch (e) {
        return null;
    }
}

/**
 * Kullanıcının son aktivitelerini getirir.
 */
export async function getRecentActivities(uid, limitCount = 3) {
    if (!uid) return [];
    try {
        const activityRef = collection(db, `users/${uid}/activity_history`);
        const q = query(activityRef, orderBy("timestamp", "desc"), limit(limitCount));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(docSnap => docSnap.data());
    } catch (e) {
        return [];
    }
}
