// public/js/user-profile.js
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Firestore'dan bir kullanıcının profil belgesini alır.
 * @param {string} uid Kullanıcının UID'si.
 * @returns {Promise<Object|null>} Kullanıcı profil verisini veya bulunamazsa null döner.
 */
export async function getUserProfile(uid) {
    if (!uid) return null;

    try {
        const userDocRef = doc(db, "users", uid);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            // Doküman bulundu, veriyi döndür
            return docSnap.data();
        } else {
            // Doküman bulunamadı
            console.warn(`Profil belgesi bulunamadı: users/${uid}`);
            return null;
        }
    } catch (error) {
        console.error("Kullanıcı profili alınırken hata oluştu:", error);
        return null; // Hata durumunda null döndür
    }
}
