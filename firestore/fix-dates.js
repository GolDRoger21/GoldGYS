import admin from "firebase-admin";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

// ES Module uyumluluğu
const require = createRequire(import.meta.url);

// Service Account anahtarını bul
let serviceAccount;
try {
  serviceAccount = require("./serviceAccountKey.json");
} catch (e) {
  try {
    serviceAccount = require("../serviceAccountKey.json");
  } catch (e2) {
    console.error("❌ HATA: 'serviceAccountKey.json' bulunamadı!");
    process.exit(1);
  }
}

// Firebase Başlat
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function fixMissingDates() {
  console.log("🔍 Veritabanı taranıyor...");
  
  try {
    const usersSnap = await db.collection("users").get();
    
    if (usersSnap.empty) {
      console.log("⚠️ Veritabanı boş.");
      return;
    }

    console.log(`📦 ${usersSnap.size} kullanıcı kontrol ediliyor...`);
    const batch = db.batch();
    let count = 0;

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      
      // Tarih zaten varsa dokunma
      if (data.createdAt) continue;

      console.log(`🛠️  Düzeltiliyor: ${data.displayName || doc.id}`);

      try {
        // Auth servisinden gerçek tarihi al
        const userRecord = await auth.getUser(doc.id);
        const realTime = new Date(userRecord.metadata.creationTime);
        
        batch.update(doc.ref, {
          createdAt: realTime,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          note: "Sistem tarafından onarıldı"
        });
        count++;
      } catch (err) {
        batch.update(doc.ref, {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          note: "Auth kaydı yok, manuel onarım"
        });
        count++;
      }
    }

    if (count > 0) {
      await batch.commit();
      console.log(`✅ Toplam ${count} kullanıcı düzeltildi.`);
    } else {
      console.log("✅ Herkesin tarihi tam, düzeltme gerekmedi.");
    }

  } catch (error) {
    console.error("🔥 Hata:", error);
  } finally {
    process.exit(0);
  }
}

fixMissingDates();