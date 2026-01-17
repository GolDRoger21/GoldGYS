import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Service Account
let serviceAccount;
try {
    serviceAccount = require("./serviceAccountKey.json");
} catch (e) {
    try { serviceAccount = require("../serviceAccountKey.json"); } catch (e2) { process.exit(1); }
}

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const DEMO_MATERIALS = [
    {
        id: "demo_video_1",
        type: "video",
        title: "Konu Anlatım Videosu",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Örnek video
        desc: "Bu videoda konunun temel kavramları anlatılmaktadır."
    },
    {
        id: "demo_pdf_1",
        type: "pdf",
        title: "Ders Notları (PDF)",
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", // Örnek PDF
        desc: "İndirilebilir ders notları."
    },
    {
        id: "demo_html_1",
        type: "html",
        title: "Özet Bilgi",
        url: "<h3>Önemli Noktalar</h3><ul><li>Madde 1: Devletin şekli Cumhuriyettir.</li><li>Madde 2: Demokratik, laik ve sosyal bir hukuk devletidir.</li></ul>",
        desc: "Hızlı tekrar notları."
    }
];

async function seedContent() {
    console.log("🚀 İçerik tohumlama başlıyor...");

    const topicsSnap = await db.collection("topics").get();
    let count = 0;

    for (const doc of topicsSnap.docs) {
        const topicRef = doc.ref;

        // 1. Konuyu Aktif Yap
        await topicRef.update({ isActive: true });

        // 2. Ders Kontrolü
        const lessonsSnap = await topicRef.collection("lessons").get();

        if (lessonsSnap.empty) {
            console.log(`➕ ${doc.data().title} için demo dersler ekleniyor...`);

            // Ders 1: Giriş
            await topicRef.collection("lessons").add({
                title: "Giriş ve Temel Kavramlar",
                order: 1,
                isActive: true,
                materials: [DEMO_MATERIALS[0], DEMO_MATERIALS[2]], // Video + Not
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Ders 2: Detaylı İnceleme
            await topicRef.collection("lessons").add({
                title: "Detaylı İnceleme ve Mevzuat",
                order: 2,
                isActive: true,
                materials: [DEMO_MATERIALS[1]], // PDF
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            count++;
        }
    }

    console.log(`✅ İşlem tamamlandı. ${count} konuya içerik eklendi.`);
    process.exit(0);
}

seedContent();
