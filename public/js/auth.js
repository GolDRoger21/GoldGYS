import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const loginForm = document.getElementById("loginForm");
if(loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("email").value;
        const pass = document.getElementById("password").value;
        
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            window.location.href = "/pages/dashboard.html";
        } catch (error) {
            let msg = "Giriş başarısız.";
            if(error.code === 'auth/invalid-credential') msg = "E-posta veya şifre hatalı.";
            if(error.code === 'auth/user-not-found') msg = "Kullanıcı bulunamadı.";
            document.getElementById("errorMessage").innerText = msg;
            document.getElementById("errorMessage").style.display = "block";
        }
    });
}