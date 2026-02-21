import { db } from './public/js/firebase-config.js';
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

// Node.js'de Firebase çalıştırmak için
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import fs from 'fs';

// Read config directly to override web imports
const configStr = fs.readFileSync('./public/js/firebase-config.js', 'utf8');
const match = configStr.match(/const firebaseConfig = ({[\s\S]*?});/);
let dbRef;

if (match) {
    const firebaseConfig = eval('(' + match[1] + ')');
    const app = initializeApp(firebaseConfig);
    dbRef = getFirestore(app);
} else {
    console.error("Could not parse firebase config");
    process.exit(1);
}

const updates = {
    // Ortak Konular (32 Soru)
    "Türkiye Cumhuriyeti Anayasası": 6,
    "Atatürk İlkeleri ve İnkılap Tarihi, Ulusal Güvenlik": 2,
    "Devlet Teşkilatı ile İlgili Mevzuat": 9,
    "657 Sayılı Devlet Memurları Kanunu": 6,
    "Türkçe Dil Bilgisi ve Yazışma Kuralları": 2,
    "Halkla İlişkiler": 1,
    "Etik Davranış İlkeleri": 1,
    "Bakanlık Merkez Teşkilatı": 1, // veya Bakanlık Merkez Teşkilatı (Ortak)
    "Adli ve İdari Yargı Komisyonları ve Yargı Örgütü": 2,
    "UYAP Bilişim Sistemi": 1,
    "5018 Sayılı Kamu Mali Yönetimi": 1,

    // Alan (Görevin Niteliği) Konuları (48 Soru)
    "Bakanlık Teşkilatı": 3,
    "Adli ve İdari Yargı Komisyonlarının Yapısı ve Görevleri": 1,
    "Yargı Örgütü": 4,
    "Elektronik İmza ve SEGBİS": 3,
    "Resmi Yazışma Kuralları": 6,
    "Tebligat Hukuku": 5,
    "Devlet Memurları ile İlgili Diğer Mevzuat": 7,
    "Yazı İşleri Hizmetleri ve Harçlar": 9,
    "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)": 3,
    "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)": 3,
    "2577 Sayılı İdari Yargılama Usulü Kanunu": 2,
    "5275 Sayılı İnfaz Kanunu": 2,

    // Subtopics that need updates:
    "Genel Esaslar": 2,
    "Temel Hak ve Ödevler": 2,
    "Cumhuriyetin Temel Organları": 2,
    "5302 Sayılı İl Özel İdaresi Kanunu": 2,
    "5393 Sayılı Belediye Kanunu": 2,
    "5442 Sayılı İl İdaresi Kanunu": 2,
    "1 Sayılı CB Kararnamesi": 3,
    "657 DMK": 6,
    "5070 Sayılı Kanun": 2, // 5070 Sayılı Elektronik İmza Kanunu
    "SEGBİS Yönetmelikleri": 1, // SEGBİS ve Görüntü Nakli Yönetmelikleri
    "7201": 3, // 7201 Sayılı Tebligat Kanunu
    "Elektronik Tebligat": 2, // Elektronik Tebligat Yönetmeliği
    "4982": 1, // 4982 Bilgi Edinme Hakkı
    "3071": 1, // 3071 Dilekçe Hakkı
    "Disiplin Yönetmeliği": 2,
    "Görevde Yükselme Yön.": 1, // Görevde Yükselme Yönetmeliği
    "Atama ve Nakil Yön.": 2, // Atama ve Nakil Yönetmeliği
    "492 Sayılı Harçlar": 1, // 492 Sayılı Harçlar Kanunu
    "Adli Yargı Yazı İşleri Yön.": 4, // Adli Yargı Yazı İşleri Yönetmeliği
    "İdari Yargı Yazı İşleri Yön.": 4, // İdari Yargı Yazı İşleri Yönetmeliği
};

async function updateAllTopics() {
    try {
        console.log("Fetching topics from DB...");
        const snapshot = await getDocs(collection(dbRef, "topics"));
        let updateCount = 0;

        for (const document of snapshot.docs) {
            const data = document.data();
            const title = data.title;

            // Check direct match
            let targetUpdate = updates[title];

            // Check partial matches for subtopics
            if (targetUpdate === undefined) {
                // E.g., title is "657 Sayılı DMK" and updates key is "657 DMK"
                for (const key of Object.keys(updates)) {
                    if (title.includes(key) || key.includes(title)) {
                        targetUpdate = updates[key];
                        break;
                    }
                }
            }

            if (targetUpdate !== undefined) {
                // Update totalQuestionTarget
                console.log(`Updating "${title}" (${document.id}) to target: ${targetUpdate}`);
                await updateDoc(doc(dbRef, "topics", document.id), {
                    totalQuestionTarget: targetUpdate
                });
                updateCount++;
            } else {
                console.log(`No specific update for: "${title}"`);
            }
        }

        console.log(`Finished! Updated ${updateCount} topics.`);
        process.exit(0);

    } catch (error) {
        console.error("Error updating topics:", error);
        process.exit(1);
    }
}

updateAllTopics();
