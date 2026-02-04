import admin from 'firebase-admin';
import { createRequire } from "module";
import fs from 'fs';

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

async function inspectData() {
    console.log("🔍 Veritabanı Analizi Başlıyor...");
    let output = "🔍 Veritabanı Analizi Başlıyor...\n";

    // 1. Konu Başlıklarını Çek
    console.log("Konular çekiliyor...");
    output += "\n📚 Konular (Topics):\n";
    const topicsSnap = await db.collection('topics').get();
    const topicMap = new Map();
    topicsSnap.forEach(doc => {
        const data = doc.data();
        output += ` - [${doc.id}] ${data.title}\n`;
        topicMap.set(data.title, doc.id);
    });

    // 2. Soru Kategorilerini Çek
    console.log("Sorular çekiliyor...");
    output += "\n❓ Soru Kategorileri (Questions):\n";
    const questionsSnap = await db.collection('questions').get();
    const activeQuestions = [];
    const categories = new Set();
    const categoryCounts = {};

    questionsSnap.forEach(doc => {
        const data = doc.data();
        // Sadece aktif ve silinmemiş soruları say
        if (data.isDeleted) return;

        const cat = data.category || 'BELİRSİZ';
        categories.add(cat);
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

        activeQuestions.push({ id: doc.id, category: cat });
    });

    for (const cat of categories) {
        const count = categoryCounts[cat];
        const matchStatus = topicMap.has(cat) ? "✅ Eşleşme Var" : "❌ EŞLEŞME YOK";
        output += ` - "${cat}": ${count} Soru (${matchStatus})\n`;
    }

    // 3. Özel Kontrol (Anayasa)
    console.log("Özel kontrol yapılıyor...");
    output += "\n🕵️ Anayasa Özel Kontrolü:\n";
    const anayasaVariations = ["Anayasa", "Türkiye Cumhuriyeti Anayasası", "TC Anayasası"];

    anayasaVariations.forEach(term => {
        const inTopics = topicMap.has(term) ? "✅ Topic Var" : "❌ Topic Yok";
        const inQuestions = categories.has(term) ? `✅ Sorularda Var (${categoryCounts[term]})` : "❌ Sorularda Yok";
        output += ` - "${term}": ${inTopics} | ${inQuestions}\n`;
    });

    fs.writeFileSync('inspection_result_utf8.txt', output, 'utf8');
    console.log("✅ Rapor 'inspection_result_utf8.txt' dosyasına yazıldı.");
}

inspectData()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Analiz hatası:', error);
        process.exit(1);
    });
