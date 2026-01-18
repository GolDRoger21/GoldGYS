import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
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

async function importFullSeed() {
    const seedPath = path.join(process.cwd(), 'scripts', 'firestore_seed_full.json');

    if (!fs.existsSync(seedPath)) {
        console.error('❌ Seed dosyası bulunamadı:', seedPath);
        process.exit(1);
    }

    const raw = fs.readFileSync(seedPath, 'utf-8');
    const data = JSON.parse(raw);

    console.log(`🚀 Import başlıyor... Toplam ${data.topics.length} ana konu.`);

    const batch = db.batch();
    let opCount = 0;

    for (const topic of data.topics) {
        // 1. Ana Konuyu Hazırla
        const topicRef = db.collection('topics').doc(topic.id);

        // Lessons dizisini ana dokümandan ayır
        const { lessons, ...topicData } = topic;

        // Ana konuyu batch'e ekle
        batch.set(topicRef, {
            ...topicData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        opCount++;

        // 2. Alt Dersleri (Lessons) Hazırla
        if (lessons && lessons.length > 0) {
            for (const lesson of lessons) {
                const lessonRef = topicRef.collection('lessons').doc(); // Auto ID
                batch.set(lessonRef, {
                    ...lesson,
                    isActive: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    materials: [] // Boş materyal dizisi
                });
                opCount++;
            }
        }
    }

    // Batch Commit
    await batch.commit();
    console.log(`✅ İşlem tamamlandı. Toplam ${opCount} doküman yazıldı.`);
    process.exit(0);
}

importFullSeed().catch(console.error);
