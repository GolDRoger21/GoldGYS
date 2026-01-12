import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Kullanıcı veritabanında var mı kontrol eder, yoksa oluşturur.
 * Varsa son giriş zamanını ve Google bilgilerini günceller.
 */
export async function ensureUserDocument(user) {
    if (!user) throw new Error("Kullanıcı bilgisi bulunamadı");

    const userRef = doc(db, "users", user.uid);
    
    try {
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            // Kullanıcı varsa: Sadece izin verilen alanları güncelle
            // Firestore kuralları: displayName, photoURL, email, lastLoginAt
            await updateDoc(userRef, {
                lastLoginAt: serverTimestamp(),
                displayName: user.displayName || null,
                photoURL: user.photoURL || null,
                email: user.email || null
            });
            return userSnap.data();
        } else {
            // Kullanıcı yoksa: Yeni kayıt oluştur (Varsayılan: role='user', status='pending')
            const newUserData = {
                uid: user.uid,
                email: user.email || null,
                displayName: user.displayName || null,
                photoURL: user.photoURL || null,
                role: 'user',        // Zorunlu (Rules)
                status: 'pending',   // Zorunlu (Rules)
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

    // 1. ADIM: Önbelleği Kontrol Et (BEDAVA)
    try {
        const cachedData = sessionStorage.getItem(CACHE_KEY);
        if (cachedData) {
            // Veri var! Parse et ve döndür. Veritabanına gitmeye gerek yok.
            // console.log("Veri önbellekten çekildi (Maliyet: 0)");
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.warn("Önbellek okuma hatası:", e);
    }
    
    // 2. ADIM: Önbellekte yoksa Firestore'dan çek (Maliyet: 1 Okuma)
    try {
        const userRef = doc(db, "users", uid);
        const docSnap = await getDoc(userRef);
        
        if (docSnap.exists()) {
            const userData = docSnap.data();

            // Tarih objelerini string'e çevirmemiz lazım ki storage'a kaydedebilelim
            // (Firestore Timestamp objeleri JSON.stringify ile bozulabilir, basit tutuyoruz)
            const cacheableData = {
                ...userData,
                createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate().toISOString() : userData.createdAt,
                lastLoginAt: userData.lastLoginAt?.toDate ? userData.lastLoginAt.toDate().toISOString() : userData.lastLoginAt
            };

            // 3. ADIM: Veriyi Önbelleğe Yaz
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheableData));
            
            return userData;
        } else {
            console.warn("Kullanıcı profili bulunamadı:", uid);
            return null;
        }
    } catch (error) {
        console.error("Profil verisi alınırken hata:", error);
        throw error;
    }
}

/**
 * Profil güncellendiğinde önbelleği de günceller.
 * Böylece kullanıcı eski veriyi görmez.
 */
export function updateUserCache(uid, newData) {
    const CACHE_KEY = `user_profile_${uid}`;
    
    // Mevcut önbelleği al
    const cachedRaw = sessionStorage.getItem(CACHE_KEY);
    let currentData = cachedRaw ? JSON.parse(cachedRaw) : {};

    // Yeni veri ile birleştir
    const updatedData = { ...currentData, ...newData };

    // Tekrar kaydet
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));
}

/**
 * Çıkış yaparken önbelleği temizler.
 */
export function clearUserCache(uid) {
    if(uid) sessionStorage.removeItem(`user_profile_${uid}`);
    sessionStorage.clear(); // Veya komple temizle
}