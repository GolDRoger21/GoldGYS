const admin = require("firebase-admin");

const serviceAccount = require("../firestore/goldgys-firebase-adminsdk.json");

// Initialize Firebase Admin with default credentials or project ID
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const updates = {
    // Ortak Konular (32 Soru)
    "Türkiye Cumhuriyeti Anayasası": 6,
    "Atatürk İlkeleri ve İnkılap Tarihi, Ulusal Güvenlik": 2,
    "Devlet Teşkilatı ile İlgili Mevzuat": 9,
    "657 Sayılı Devlet Memurları Kanunu": 6,
    "Türkçe Dil Bilgisi ve Yazışma Kuralları": 2,
    "Halkla İlişkiler": 1,
    "Etik Davranış İlkeleri": 1,
    "Bakanlık Merkez Teşkilatı": 1,
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

    // Subtopics that need specific updates
    "Genel Esaslar": 2,
    "Temel Hak ve Ödevler": 2,
    "Cumhuriyetin Temel Organları": 2,
    "5302 Sayılı İl Özel İdaresi Kanunu": 2,
    "5393 Sayılı Belediye Kanunu": 2,
    "5442 Sayılı İl İdaresi Kanunu": 2,
    "1 Sayılı CB Kararnamesi": 3,
    "657 DMK": 6,
    "5070 Sayılı Kanun": 2,
    "SEGBİS Yönetmelikleri": 1,
    "7201": 3,
    "Elektronik Tebligat": 2,
    "4982": 1,
    "3071": 1,
    "Disiplin Yönetmeliği": 2,
    "Görevde Yükselme Yön.": 1,
    "Atama ve Nakil Yön.": 2,
    "492 Sayılı Harçlar": 1,
    "Adli Yargı Yazı İşleri Yön.": 4,
    "İdari Yargı Yazı İşleri Yön.": 4,
};

async function updateAllTopics() {
    try {
        console.log("Fetching topics from DB...");
        const snapshot = await db.collection("topics").get();
        let updateCount = 0;

        for (const document of snapshot.docs) {
            const data = document.data();
            const title = data.title;

            let targetUpdate = updates[title];
            if (targetUpdate === undefined) {
                // partial match
                for (const key of Object.keys(updates)) {
                    if (title.includes(key) || key.includes(title)) {
                        targetUpdate = updates[key];
                        break;
                    }
                }
            }

            if (targetUpdate !== undefined) {
                console.log(`Updating "${title}" (${document.id}) to target: ${targetUpdate}`);
                await db.collection("topics").doc(document.id).update({
                    totalQuestionTarget: targetUpdate
                });
                updateCount++;
            } else {
                console.log(`No specific update for: "${title}"`);
            }
        }

        console.log(`\nFinished! Updated ${updateCount} topics.`);
        process.exit(0);
    } catch (error) {
        console.error("Error updating topics:", error);
        process.exit(1);
    }
}

updateAllTopics();
