import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Kullanıcı sisteme giriş yaptığında veritabanında kaydı olup olmadığını kontrol eder.
 * Kayıt yoksa varsayılan (pending) statüsünde oluşturur.
 * @param {object} user - Firebase Auth User objesi
 * @returns {Promise<object>} - Kullanıcı verisi (statüs, rol vb.)
 */
export async function ensureUserDocument(user) {
    if (!user) throw new Error("Kullanıcı bulunamadı");

    const userRef = doc(db, "users", user.uid);
    
    try {
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            // Kullanıcı zaten var, son giriş tarihini güncelle
            const userData = userSnap.data();
            try {
                await updateDoc(userRef, {
                    lastLoginAt: serverTimestamp()
                });
            } catch (e) {
                console.warn("Son giriş tarihi güncellenemedi, önemsiz.", e);
            }
            return userData;
        } else {
            // --- YENİ KULLANICI OLUŞTURMA ---
            // İlk kez giren kullanıcıyı veritabanına kaydediyoruz.
            // Kurallara uygun olarak 'role: user' ve 'status: pending' gönderiyoruz.
            
            const newUserData = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL || null,
                role: 'user',        // Varsayılan rol
                status: 'pending',   // Varsayılan durum: Onay Bekliyor
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
            };

            await setDoc(userRef, newUserData);
            console.log("Yeni kullanıcı kaydı oluşturuldu:", user.uid);
            
            return newUserData;
        }
    } catch (error) {
        console.error("ensureUserDocument Hatası:", error);
        // Hata detayını yukarı fırlat ki auth.js yakalasın
        throw error;
    }
}

/**
 * Belirtilen kullanıcının profil bilgilerini getirir.
 * Dashboard ve profil sayfalarında salt okunur işlemler için kullanılır.
 * @param {string} uid - Kullanıcı ID
 * @returns {Promise<object|null>}
 */
export async function getUserProfile(uid) {
    if (!uid) return null;
    
    try {
        const userRef = doc(db, "users", uid);
        const docSnap = await getDoc(userRef);
        
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            console.warn("Kullanıcı profili bulunamadı:", uid);
            return null;
        }
    } catch (error) {
        console.error("Profil verisi alınırken hata:", error);
        throw error;
    }
}