// Tarayıcı için CDN bağlantılarını kullanıyoruz
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Senin Proje Ayarların
export const firebaseConfig = {
  apiKey: "AIzaSyAJu46NYwa0NH_iWIlJbsXQddOmXs7H0L0",
  authDomain: "goldgys.firebaseapp.com",
  projectId: "goldgys",
  storageBucket: "goldgys.appspot.com",
  messagingSenderId: "631874020828",
  appId: "1:631874020828:web:976ae1de5e7bc246909b19",
};

// Firebase'i Başlat
export const app = initializeApp(firebaseConfig);

// Servisleri Dışa Aktar (Diğer dosyalar bunları kullanacak)
export const auth = getAuth(app);
export const db = getFirestore(app);
