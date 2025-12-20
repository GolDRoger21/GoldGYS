#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ serviceAccountKey.json bulunamadı. Lütfen scripts klasörüne ekleyin.");
  process.exit(1);
}

if (!admin.apps.length) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const BATCH_LIMIT = 400;

async function commitBatch(batch, counter) {
  if (counter === 0) return 0;
  await batch.commit();
  return counter;
}

async function repairUsers() {
  console.log("🛠️ Kullanıcı verileri kontrol ediliyor...");
  try {
    const usersSnap = await db.collection("users").get();
    if (usersSnap.empty) {
      console.log("✨ Kullanıcı dokümanı bulunamadı.");
      return;
    }

    let batch = db.batch();
    let pendingWrites = 0;
    let updatedCount = 0;

    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data() || {};
      const updates = {};

      if (!data.createdAt) {
        updates.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }

      if (!data.role) {
        updates.role = "student";
      }

      if (!data.status) {
        updates.status = "active";
      }

      if (Object.keys(updates).length) {
        batch.update(docSnap.ref, updates);
        pendingWrites += 1;
        updatedCount += 1;
      }

      if (pendingWrites >= BATCH_LIMIT) {
        await commitBatch(batch, pendingWrites);
        batch = db.batch();
        pendingWrites = 0;
      }
    }

    await commitBatch(batch, pendingWrites);

    if (updatedCount > 0) {
      console.log(`✅ ${updatedCount} kullanıcı kaydı güncellendi.`);
    } else {
      console.log("✨ Tüm kullanıcı kayıtları zaten güncel görünüyor.");
    }
  } catch (error) {
    console.error("❌ Onarım sırasında hata oluştu:", error);
    process.exitCode = 1;
  }
}

repairUsers();
