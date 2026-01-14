// public/js/firebase-config.js

// Firebase modüllerini CDN üzerinden alıyoruz (Modular SDK)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Proje Ayarları
const firebaseConfig = {
  apiKey: "AIzaSyAJu46NYwa0NH_iWIlJbsXQddOmXs7H0L0",
  authDomain: "goldgys.firebaseapp.com",
  projectId: "goldgys",
  storageBucket: "goldgys.appspot.com",
  messagingSenderId: "631874020828",
  appId: "1:631874020828:web:976ae1de5e7bc246909b19",
};

// Uygulamayı Başlat (Singleton Pattern)
// Eğer uygulama daha önce başlatılmışsa onu kullan, yoksa yenisini başlat.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Servisleri Başlat
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Servisleri Dışa Aktar (Diğer dosyalar bunları kullanacak)
export { app, auth, db, functions };