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

function extractQuestionId(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.id || value.questionId || null;
}

async function createSnapshots() {
    const examsSnap = await db.collection('exams').get();

    if (examsSnap.empty) {
        console.log('⚠️ Exam kaydı bulunamadı.');
        return;
    }

    let updated = 0;

    for (const examDoc of examsSnap.docs) {
        const data = examDoc.data();

        if (Array.isArray(data.questionsSnapshot) && data.questionsSnapshot.length > 0) {
            continue;
        }

        const rawQuestions = data.questions || [];
        const questionIds = rawQuestions.map(extractQuestionId).filter(Boolean);
        if (questionIds.length === 0) {
            continue;
        }

        const questionRefs = questionIds.map(id => db.collection('questions').doc(id));
        const questionDocs = await db.getAll(...questionRefs);
        const snapshot = questionDocs
            .filter(docSnap => docSnap.exists)
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

        await examDoc.ref.set({
            questionsSnapshot: snapshot,
            totalQuestions: snapshot.length,
            snapshotUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        updated += 1;
        console.log(`✅ ${examDoc.id} güncellendi. (${snapshot.length} soru)`);
    }

    console.log(`🎯 Tamamlandı. Güncellenen deneme sayısı: ${updated}`);
}

createSnapshots()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Snapshot oluşturma hatası:", error);
        process.exit(1);
    });
