// public/js/auth.js

import { auth } from "./firebase-config.js";
import { ensureUserDocument } from "./user-profile.js";
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM Elementleri
const loginBtn = document.getElementById("googleLogin");
const errorMsg = document.getElementById("errorMessage");

// --- Giriş İşlemi ---
async function handleGoogleLogin() {
    if (!loginBtn) return;

    try {
        // 1. UI'ı Yükleniyor Moduna Al
        setLoadingState(true);
        errorMsg.style.display = 'none';

        // 2. Google ile Giriş Yap (Pop-up)
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        console.log("✅ Google girişi başarılı:", user.email);

        // 3. Veritabanı Kaydını Kontrol Et/Oluştur (KRİTİK ADIM)
        // Bu adım olmazsa "Profil Bulunamadı" hataları alırsınız.
        await ensureUserDocument(user);

        // 4. Yönlendirme
        console.log("🚀 Yönlendiriliyor...");
        window.location.href = '/pages/dashboard.html';

    } catch (error) {
        console.error("❌ Giriş Hatası:", error);
        
        // Kullanıcı pencereyi kapattıysa hata gösterme
        if (error.code === 'auth/popup-closed-by-user') {
            setLoadingState(false);
            return;
        }

        // Hata Mesajını Göster
        let message = "Giriş yapılamadı. Lütfen tekrar deneyin.";
        if (error.code === 'auth/network-request-failed') message = "İnternet bağlantınızı kontrol edin.";
        
        showError(message);
        setLoadingState(false);
    }
}

// --- Yardımcı Fonksiyonlar ---

function setLoadingState(isLoading) {
    if (isLoading) {
        loginBtn.style.opacity = "0.7";
        loginBtn.style.pointerEvents = "none";
        loginBtn.innerHTML = `
            <span class="spinner-border"></span>
            <span>Giriş yapılıyor...</span>
        `;
    } else {
        loginBtn.style.opacity = "1";
        loginBtn.style.pointerEvents = "auto";
        // Orijinal butonu geri getir (SVG ikonlu)
        loginBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google ile Giriş Yap
        `;
    }
}

function showError(msg) {
    if (errorMsg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    } else {
        alert(msg);
    }
}

// Olay Dinleyicisi
if (loginBtn) {
    loginBtn.addEventListener("click", handleGoogleLogin);
}