import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Kullanıcı sisteme Google ile ilk kez giriyorsa veritabanına kaydeder.
 * Zaten varsa son giriş zamanını günceller.
 * @param {object} user - Firebase Auth kullanıcısı
 */
export async function ensureUserDocument(user) {
    if (!user) throw new Error("Kullanıcı bilgisi bulunamadı");

    const userRef = doc(db, "users", user.uid);
    
    try {
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            // Kullanıcı zaten var: Sadece son giriş zamanını güncelle
            await updateDoc(userRef, {
                lastLoginAt: serverTimestamp(),
                // Veriler güncel kalsın diye auth bilgisinden de besle
                email: user.email,
                photoURL: user.photoURL || null
            }).catch(err => console.warn("Son giriş zamanı güncellenemedi:", err));
            
            // Mevcut veriyi döndür
            return userSnap.data();
        } else {
            // Yeni Kullanıcı: Varsayılan verilerle oluştur
            const newUserData = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || "",
                photoURL: user.photoURL || null,
                role: 'user', // Varsayılan rol
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
                // Profil sayfası alanları (boş başlatıyoruz)
                ad: user.displayName ? user.displayName.split(' ')[0] : "",
                soyad: user.displayName && user.displayName.includes(' ') ? user.displayName.split(' ').slice(1).join(' ') : "",
                phone: "",
                title: "",
                targetExam: ""
            };

            await setDoc(userRef, newUserData);
            console.log("🆕 Yeni kullanıcı veritabanına kaydedildi.");
            return newUserData;
        }
    } catch (error) {
        console.error("ensureUserDocument Hatası:", error);
        throw error;
    }
}

/**
 * Kullanıcı profil verilerini getirir (Önbellek destekli).
 * @param {string} uid - Kullanıcı ID
 * @param {object} options - { force: boolean } önbelleği yoksaymak için
 */
export async function getUserProfile(uid, options = { force: false }) {
    if (!uid) return null;

    const CACHE_KEY = `user_profile_${uid}`;

    // 1. Önbellekten kontrol et (Force yoksa)
    if (!options.force) {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (e) {
                sessionStorage.removeItem(CACHE_KEY);
            }
        }
    }

    // 2. Firestore'dan çek
    const userRef = doc(db, "users", uid);
    try {
        const docSnap = await getDoc(userRef);
        
        if (docSnap.exists()) {
            const userData = docSnap.data();
            
            // Tarih nesnelerini string'e çevirip önbelleğe al (JSON hatasını önlemek için)
            const cacheableData = {
                ...userData,
                createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate().toISOString() : userData.createdAt,
                lastLoginAt: userData.lastLoginAt?.toDate ? userData.lastLoginAt.toDate().toISOString() : userData.lastLoginAt
            };

            // Önbelleğe yaz
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheableData));
            return userData;
        } else {
            console.warn("Kullanıcı profili bulunamadı.");
            return null;
        }
    } catch (error) {
        console.error("Profil verisi alınırken hata:", error);
        // Hata durumunda (internet yoksa vb.) önbellekteki eski veriyi döndürmeyi dene
        const cached = sessionStorage.getItem(CACHE_KEY);
        return cached ? JSON.parse(cached) : null;
    }
}

/**
 * Profil güncellendiğinde önbelleği de anında günceller.
 * (Böylece sayfa yenilemeye gerek kalmadan yeni ismi görürsün)
 */
export function updateUserCache(uid, newData) {
    const CACHE_KEY = `user_profile_${uid}`;
    try {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY);
        let currentData = cachedRaw ? JSON.parse(cachedRaw) : {};
        
        // Yeni verilerle eskileri birleştir
        const updatedData = { ...currentData, ...newData };
        
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));
        console.log("✅ Kullanıcı önbelleği güncellendi.");
    } catch (e) {
        console.warn("Cache update hatası:", e);
    }
}

/**
 * Çıkış yaparken önbelleği temizler.
 */
export function clearUserCache(uid) {
    if (uid) {
        sessionStorage.removeItem(`user_profile_${uid}`);
    }
    sessionStorage.clear(); // Garanti olsun diye hepsini temizle
}