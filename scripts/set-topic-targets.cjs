const admin = require('firebase-admin');

// Başlatma
const serviceAccount = require('../../goldgys-firebase-adminsdk-v227r-8a0329b352.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// Kullanıcının verdiği veri seti
const TARGETS = [
    // ORTAK
    { match: /Anayasa/i, target: 6, category: 'ortak' },
    { match: /Genel Esaslar/i, target: 2 },
    { match: /Temel Hak ve Ödevler/i, target: 2 },
    { match: /Cumhuriyetin Temel Organları/i, target: 2 },
    { match: /Atatürk İlkeleri/i, target: 2, category: 'ortak' },
    { match: /Ulusal Güvenlik/i, target: 2, category: 'ortak' },
    { match: /Devlet Teşkilatı/i, target: 9, category: 'ortak' },
    { match: /5302/i, target: 2 },
    { match: /5393/i, target: 2 },
    { match: /5442/i, target: 2 },
    { match: /1 Sayılı CB/i, target: 3 }, // Ortak için
    { match: /Memurları Kanunu/i, target: 6, category: 'ortak' },
    { match: /657/i, target: 6 },
    { match: /Türkçe/i, target: 2, category: 'ortak' },
    { match: /Dil Bilgisi/i, target: 2, category: 'ortak' },
    { match: /Halkla İlişkiler/i, target: 1, category: 'ortak' },
    { match: /Etik Davranış/i, target: 1, category: 'ortak' },
    { match: /Bakanlık Merkez Teşkilatı/i, target: 1, category: 'ortak' },
    { match: /Adli ve İdari Yargı Komisyonları ve Yargı Örgütü/i, target: 2, category: 'ortak' },
    { match: /UYAP/i, target: 1, category: 'ortak' },
    { match: /5018/i, target: 1, category: 'ortak' },

    // ALAN
    { match: /Bakanlık Teşkilatı/i, target: 3, category: 'alan' },
    { match: /Komisyonlarının Yapısı/i, target: 1, category: 'alan' },
    { match: /^Yargı Örgütü/i, target: 4, category: 'alan' }, // Adli ve idari yarginin icinde degil
    { match: /Elektronik İmza ve SEGBİS/i, target: 3, category: 'alan' },
    { match: /5070/i, target: 2 },
    { match: /SEGBİS/i, target: 1 },
    { match: /Resmi Yazışma/i, target: 6, category: 'alan' },
    { match: /Tebligat/i, target: 5, category: 'alan' },
    { match: /7201/i, target: 3 },
    { match: /Elektronik Tebligat/i, target: 2 },
    { match: /Diğer Mevzuat/i, target: 7, category: 'alan' },
    { match: /4982/i, target: 1 },
    { match: /3071/i, target: 1 },
    { match: /Disiplin/i, target: 2 },
    { match: /Görevde Yükselme/i, target: 1 },
    { match: /Atama ve Nakil/i, target: 2 },
    { match: /Yazı İşleri Hizmetleri/i, target: 9, category: 'alan' },
    { match: /Harçlar/i, target: 1 },
    { match: /Adli Yargı Yazı İşleri/i, target: 4 },
    { match: /İdari Yargı Yazı İşleri/i, target: 4 },
    { match: /5271/i, target: 3, category: 'alan' },
    { match: /CMK/i, target: 3, category: 'alan' },
    { match: /6100/i, target: 3, category: 'alan' },
    { match: /HMK/i, target: 3, category: 'alan' },
    { match: /2577/i, target: 2, category: 'alan' },
    { match: /İYUK/i, target: 2, category: 'alan' },
    { match: /5275/i, target: 2, category: 'alan' },
    { match: /İnfaz/i, target: 2, category: 'alan' },
];

async function run() {
    try {
        console.log("Konular getiriliyor...");
        const snapshot = await db.collection('topics').get();
        let updatedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const title = data.title || "";
            const category = data.category || "";
            let target = 0;

            for (const rule of TARGETS) {
                if (rule.match.test(title)) {
                    // Kategori kısıtlaması varsa kontrol et
                    if (!rule.category || rule.category === category) {
                        target = rule.target;
                        break; // İlk eşleşmeyi al
                    }
                }
            }

            if (target > 0 || data.totalQuestionTarget !== target) {
                await db.collection('topics').doc(doc.id).update({
                    totalQuestionTarget: target
                });
                console.log(`Güncellendi: ${title} -> ${target} Soru`);
                updatedCount++;
            }
        }

        console.log(`Tamamlandı! Toplam ${updatedCount} konu güncellendi.`);
        process.exit(0);

    } catch (e) {
        console.error("Hata:", e);
        process.exit(1);
    }
}

run();
