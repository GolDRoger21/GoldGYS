// Tarayıcı için CDN bağlantılarını kullanıyoruz
import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

// Senin Proje Ayarların
export const firebaseConfig = {
  apiKey: "AIzaSyAJu46NYwa0NH_iWIlJbsXQddOmXs7H0L0",
  authDomain: "goldgys.firebaseapp.com",
  projectId: "goldgys",
  storageBucket: "goldgys.appspot.com",
  messagingSenderId: "631874020828",
  appId: "1:631874020828:web:976ae1de5e7bc246909b19",
  measurementId: "G-FST8W9F1ZZ",
};

// Firebase'i Başlat (önceden başlatıldıysa mevcut uygulamayı kullan)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// App Check'i Başlat
let appCheckInitialized = false;
if (typeof window !== "undefined") {
  try {
    // Sadece localhost'ta debug token kullan
    if (window.location?.hostname === "localhost") {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider("6LeYSV0sAAAAAFywdWhzKf9Vw8_gtMa0JeMPjgD8"),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (error) {
    console.warn("App Check başlatılamadı, uygulama App Check olmadan devam ediyor.", error);
  }
}

// Servisleri Dışa Aktar (Diğer dosyalar bunları kullanacak)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
let analyticsInstance = null;
if (typeof window !== "undefined") {
  try {
    analyticsInstance = getAnalytics(app);
  } catch (error) {
    console.warn("Analytics başlatılamadı, uygulama Analytics olmadan devam ediyor.", error);
  }
}

export { analyticsInstance as analytics, appCheckInitialized };
