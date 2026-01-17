import admin from "firebase-admin";
import { createRequire } from "module";
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

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

async function migrateSubTopics() {
    console.log("🚀 Veri göçü başlıyor...");

    const topicsSnap = await db.collection("topics").get();
    let count = 0;

    for (const doc of topicsSnap.docs) {
        const data = doc.data();

        // Eğer eski subTopics dizisi varsa ve içi doluysa
        if (data.subTopics && Array.isArray(data.subTopics) && data.subTopics.length > 0) {
            console.log(`📦 ${data.title} için alt konular taşınıyor...`);

            const batch = db.batch();
            const lessonsRef = doc.ref.collection("lessons");

            data.subTopics.forEach((sub, index) => {
                // Yeni lesson dokümanı oluştur
                const newLessonRef = lessonsRef.doc(); // Otomatik ID
                batch.set(newLessonRef, {
                    title: sub.title,
                    description: sub.description || '',
                    order: index + 1,
                    isActive: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    materials: [] // Boş materyal listesi ile başlat
                });
            });

            // Eski subTopics alanını sil (Temizlik)
            batch.update(doc.ref, {
                subTopics: admin.firestore.FieldValue.delete(),
                lessonCount: data.subTopics.length // Sayaç ekle
            });

            await batch.commit();
            count++;
        }
    }

    console.log(`✅ Toplam ${count} konunun alt başlıkları yeni yapıya taşındı.`);
    process.exit(0);
}

migrateSubTopics();
