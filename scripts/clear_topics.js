import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Service Account Kontrolü
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

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function deleteCollection(collectionPath, batchSize) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(db, query, resolve) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        // When there are no documents left, we are done
        resolve();
        return;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
        // Önce alt koleksiyonları (lessons) silmeye çalış
        const lessonsPath = `${doc.ref.path}/lessons`;
        await deleteCollection(lessonsPath, 50); // Alt koleksiyonu sil

        batch.delete(doc.ref); // Ana dokümanı sil
    }

    await batch.commit();

    // Recurse on the next process tick, to avoid
    // exploding the stack.
    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
    });
}

async function clearTopics() {
    console.log("🗑️ 'topics' koleksiyonu ve alt dersler temizleniyor...");
    try {
        await deleteCollection("topics", 50);
        console.log("✅ Temizlik tamamlandı. Veritabanı 'topics' için boş.");
    } catch (error) {
        console.error("❌ Silme hatası:", error);
    }
}

clearTopics();
