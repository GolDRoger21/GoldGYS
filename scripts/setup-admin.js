#!/usr/bin/env node

/**
 * Admin Kullanıcı Kurulum Script'i
 * 
 * Bu script, belirtilen e-posta adresine sahip kullanıcıyı admin yetkisiyle ayarlar.
 * Kullanım: node setup-admin.js ercan21@gmail.com
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Firebase servis hesabını tanımla

// Firebase Admin SDK'yı başlat
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

async function setupAdmin(email) {
  try {
    console.log(`⏳ ${email} adresini admin olarak ayarlıyor...`);

    // Kullanıcıyı e-posta ile bul
    const userRecord = await auth.getUserByEmail(email);
    console.log(`✅ Kullanıcı bulundu: ${userRecord.uid}`);

    // Custom claims ayarla
    await auth.setCustomUserClaims(userRecord.uid, {
      admin: true,
      role: "admin",
      editor: true,
    });
    console.log(`✅ Admin claim'leri ayarlandı`);

    // Firestore'da da güncelle
    await db.collection("users").doc(userRecord.uid).set(
      {
        role: "admin",
        roles: ["admin", "editor", "student"],
        status: "active",
        isAdmin: true,
      },
      { merge: true }
    );
    console.log(`✅ Firestore dokümanı güncellendi`);

    console.log(`\n🎉 ${email} artık admin kullanıcısıdır!`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Hata oluştu:`, error.message);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error("❌ Kullanım: node setup-admin.js <email>");
  console.error("   Örnek: node setup-admin.js ercan21@gmail.com");
  process.exit(1);
}

setupAdmin(email);
