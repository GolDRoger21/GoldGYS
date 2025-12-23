import admin from "firebase-admin";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

// ES Module uyumluluğu için
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anahtar dosyasını bulmaya çalış (Önce scripts klasörüne, sonra ana klasöre bakar)
let serviceAccount;
try {
  // 1. Önce scripts klasörüne bak
  serviceAccount = require("./serviceAccountKey.json");
} catch (e) {
  try {
    // 2. Bulamazsa bir üst klasöre (GoldGYS ana dizine) bak
    serviceAccount = require("../serviceAccountKey.json");
  } catch (e2) {
    console.error("❌ HATA: 'serviceAccountKey.json' dosyası bulunamadı!");
    console.error("   Lütfen bu dosyayı 'scripts' klasörüne veya projenin ana klasörüne koyduğunuzdan emin olun.");
    process.exit(1);
  }
}

// Firebase Admin SDK'yı başlat
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

async function setupAdmin(input) {
  try {
    console.log(`⏳ İşlem başlatılıyor: ${input}`);
    let userRecord;

    // Girdinin e-posta mı yoksa UID mi olduğunu kontrol et
    if (input.includes("@")) {
      console.log("📧 E-posta adresi algılandı, kullanıcı aranıyor...");
      userRecord = await auth.getUserByEmail(input);
    } else {
      console.log("🔑 UID algılandı, kullanıcı aranıyor...");
      userRecord = await auth.getUser(input);
    }

    console.log(`✅ Kullanıcı bulundu: ${userRecord.uid} (${userRecord.email})`);

    // 1. Token'a Admin mührünü bas (Authentication)
    await auth.setCustomUserClaims(userRecord.uid, {
      admin: true,
      role: "admin",
      editor: true,
    });
    console.log(`✅ Auth Token yetkileri (Claims) güncellendi.`);

    // 2. Veritabanı kaydını güncelle (Firestore)
    const userDocRef = db.collection("users").doc(userRecord.uid);
    const docSnap = await userDocRef.get();
    
    const updateData = {
      role: "admin",
      roles: ["admin", "editor", "student"],
      status: "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!docSnap.exists) {
        updateData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.email = userRecord.email;
        updateData.displayName = userRecord.displayName || "Admin User";
    }

    await userDocRef.set(updateData, { merge: true });
    console.log(`✅ Firestore veritabanı kaydı güncellendi.`);
    console.log(`\n🎉 İŞLEM TAMAMLANDI!`);
    process.exit(0);

  } catch (error) {
    console.error(`❌ Hata:`, error.message);
    process.exit(1);
  }
}

const input = process.argv[2];
if (!input) {
  console.error("❌ Kullanım: node scripts/setup-admin.js <UID>");
  process.exit(1);
}

setupAdmin(input);