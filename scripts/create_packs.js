import admin from 'firebase-admin';
import { createRequire } from "module";

const require = createRequire(import.meta.url);

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
const PACK_SIZE = 50;

function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

async function createTopicPacks() {
    const topicsSnap = await db.collection('topics').get();
    const topicTitleToId = new Map();

    topicsSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data?.title) {
            topicTitleToId.set(data.title, docSnap.id);
        }
    });

    const questionsSnap = await db.collection('questions').get();

    const topicBuckets = new Map();

    questionsSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data?.isDeleted) return;
        if (data?.isActive === false) return;
        const topicTitle = data.category || 'Genel';
        const topicId = topicTitleToId.get(topicTitle);
        if (!topicId) return;

        const payload = { id: docSnap.id, ...data };
        if (!topicBuckets.has(topicId)) {
            topicBuckets.set(topicId, []);
        }
        topicBuckets.get(topicId).push(payload);
    });

    for (const [topicId, questions] of topicBuckets.entries()) {
        const packs = chunkArray(questions, PACK_SIZE);
        const batch = db.batch();

        packs.forEach((packQuestions, index) => {
            const packRef = db.collection('topic_packs').doc(`${topicId}_pack_${index}`);
            batch.set(packRef, {
                topicId,
                packIndex: index,
                questions: packQuestions,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        const metaRef = db.collection('topic_packs_meta').doc(topicId);
        batch.set(metaRef, {
            topicId,
            packCount: packs.length,
            questionCount: questions.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        console.log(`✅ ${topicId} için ${packs.length} paket oluşturuldu (${questions.length} soru).`);
    }

    console.log('🎯 Paket oluşturma tamamlandı.');
}

createTopicPacks()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Paket oluşturma hatası:', error);
        process.exit(1);
    });
