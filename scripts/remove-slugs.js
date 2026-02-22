import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Resolve directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, '../serviceAccountKey.json'), 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    console.error('Firebase init error:', e.message);
    process.exit(1);
}

const db = admin.firestore();

async function run() {
    try {
        console.log("Konular getiriliyor...");
        const snapshot = await db.collection('topics').get();
        let updatedCount = 0;

        const batch = db.batch();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.slug !== undefined) {
                // Remove the slug field entirely
                batch.update(doc.ref, {
                    slug: admin.firestore.FieldValue.delete()
                });
                console.log(`🧹 Slug siliniyor: ${data.title} (slug: ${data.slug})`);
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            await batch.commit();
            console.log(`✅ İşlem Tamamlandı! Toplam ${updatedCount} konunun eski slug verisi temizlendi.`);
        } else {
            console.log("Herhangi bir slug verisi bulunamadı, sistem zaten temiz!");
        }

        process.exit(0);

    } catch (e) {
        console.error("Hata:", e);
        process.exit(1);
    }
}

run();
