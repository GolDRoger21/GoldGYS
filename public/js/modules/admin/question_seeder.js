import { db } from "../../firebase-config.js";
import { collection, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// SENİN GÖNDERDİĞİN 15 SORULUK TEST
// (Veritabanı formatına dönüştürüldü)
const REAL_QUESTIONS = [
    {
        text: "CMK'ya göre mahkeme, iddianamenin kabulü kararından sonra duruşma gününü belirler ve duruşmada hazır bulunması gereken kişileri çağırır. Ancak, duruşmada sanık sorgusu yapılmamış olsa bile davanın yoklukta bitirilebileceği istisnai hal aşağıdakilerden hangisidir?",
        options: {
            A: "Sanığın kaçak olması durumunda",
            B: "Suçun şikayete bağlı olması durumunda",
            C: "Mahkûmiyet dışında bir karar verilmesi gerektiği kanısına varılırsa",
            D: "Sanığın yurt dışında olması durumunda",
            E: "Savcının mütalaasında beraat istemesi durumunda"
        },
        correctAnswer: "C",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["duruşma", "sanık", "yoklukta hüküm"],
        solution: "<strong>Dayanak:</strong> CMK m.193/2<br><strong>Analiz:</strong> Kural olarak sanık sorgulanmadan hüküm verilemez. Ancak toplanan delillere göre beraat, düşme gibi mahkûmiyet dışında bir karar verilecekse sorgu yapılmadan dava bitirilebilir.<br><strong>Hap Bilgi:</strong> Beraat verilecekse sorguya gerek yoktur.",
        isActive: true
    },
    {
        text: "CMK'ya göre iddianamenin iadesi kurumunda, mahkemenin iddianameyi inceleyip iade edebileceği süre en geç ne kadardır?",
        options: {
            A: "7 gün",
            B: "10 gün",
            C: "15 gün",
            D: "1 ay",
            E: "Duruşma gününe kadar"
        },
        correctAnswer: "C",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["iddianame", "süreler"],
        solution: "<strong>Dayanak:</strong> CMK m.174/1<br><strong>Analiz:</strong> Mahkeme, iddianamenin verildiği tarihten itibaren 15 gün içinde iade edebilir. Süre geçerse kabul edilmiş sayılır.<br><strong>Tuzak:</strong> İtiraz süresi (7 gün) ile karıştırılmamalıdır.",
        isActive: true
    },
    {
        text: "CMK'ya göre aşağıdakilerden hangisi iddianamenin iadesi nedenlerinden biri DEĞİLDİR?",
        options: {
            A: "Ön ödemeye veya uzlaştırmaya tabi suçlarda bu usullerin uygulanmamış olması",
            B: "Suçun sübutuna etki edecek mutlak delillerin toplanmamış olması",
            C: "İddianamenin zorunlu unsurlarının (kimlik, suç vb.) eksik olması",
            D: "Suçun hukuki nitelendirilmesinin yanlış yapılması",
            E: "Soruşturma izni alınması gereken suçlarda izin alınmamış olması"
        },
        correctAnswer: "D",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["iddianame", "iade sebepleri"],
        solution: "<strong>Dayanak:</strong> CMK m.174/2<br><strong>Analiz:</strong> Suçun hukuki nitelendirilmesi (tavsifi) mahkemenin takdirindedir. Savcının suça yanlış isim vermesi iade nedeni değildir.<br><strong>Hap Bilgi:</strong> Hukuki niteleme hatası iade sebebi olamaz.",
        isActive: true
    },
    {
        text: "CMK'ya göre 'Hükmün Açıklanmasının Geri Bırakılması' (HAGB) kararı verilebilmesi için, sanık hakkında hükmolunan cezanın üst sınırı ne olmalıdır?",
        options: {
            A: "1 yıl veya daha az süreli hapis",
            B: "2 yıl veya daha az süreli hapis veya adlî para cezası",
            C: "3 yıl veya daha az süreli hapis",
            D: "5 yıl veya daha az süreli hapis",
            E: "Sadece adlî para cezası"
        },
        correctAnswer: "B",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["hagb", "ceza miktarı"],
        solution: "<strong>Dayanak:</strong> CMK m.231/5<br><strong>Analiz:</strong> HAGB için ceza miktarı 2 yıl veya daha az süreli hapis ya da adli para cezası olmalıdır.<br><strong>Tuzak:</strong> Erteleme sınırları ile karıştırılmamalıdır.",
        isActive: true
    },
    {
        text: "CMK'ya göre Cumhuriyet savcısı, soruşturma evresi sonunda kamu davasının açılması için yeterli şüphe oluşturacak delil elde edilememesi veya kovuşturma olanağının bulunmaması hallerinde hangi kararı verir?",
        options: {
            A: "Beraat kararı",
            B: "Görevsizlik kararı",
            C: "Kovuşturmaya yer olmadığına dair karar (KYOK)",
            D: "Davanın düşmesi kararı",
            E: "İddianamenin iadesi kararı"
        },
        correctAnswer: "C",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["savcı", "karar türleri"],
        solution: "<strong>Dayanak:</strong> CMK m.172<br><strong>Analiz:</strong> Yeterli delil yoksa savcı KYOK (Takipsizlik) verir. Beraat kararını sadece mahkeme verebilir.",
        isActive: true
    },
    {
        type: "oncullu",
        text: "CMK'ya göre HAGB (Hükmün Açıklanmasının Geri Bırakılması) kararı ile ilgili;",
        questionRoot: "Aşağıdaki ifadelerden hangileri doğrudur?",
        onculler: [
            "I. HAGB kararı verildiğinde sanık 5 yıl süreyle denetim süresine tabi tutulur.",
            "II. Denetim süresi içinde kasten yeni bir suç işlenmezse dava düşer.",
            "III. HAGB kararı, sanığın rızası olmaksızın verilemez."
        ],
        options: {
            A: "Yalnız I",
            B: "I ve II",
            C: "I ve III",
            D: "II ve III",
            E: "I, II ve III"
        },
        correctAnswer: "E",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["hagb", "öncüllü"],
        solution: "<strong>Dayanak:</strong> CMK m.231<br><strong>Analiz:</strong> Denetim süresi 5 yıldır, yükümlülüklere uyulursa dava düşer ve sanığın kabulü şarttır.<br><strong>Hap Bilgi:</strong> Sanık istemezse HAGB verilemez.",
        isActive: true
    },
    {
        text: "CMK'ya göre kovuşturmaya yer olmadığına dair karara (KYOK) itiraz süresi ve mercii aşağıdakilerden hangisidir?",
        options: {
            A: "7 gün - Ağır Ceza Mahkemesi",
            B: "15 gün - Sulh Ceza Hâkimliği",
            C: "15 gün - Cumhuriyet Başsavcılığı",
            D: "10 gün - Asliye Ceza Mahkemesi",
            E: "30 gün - Bölge Adliye Mahkemesi"
        },
        correctAnswer: "B",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["itiraz", "kyok"],
        solution: "<strong>Dayanak:</strong> CMK m.173<br><strong>Analiz:</strong> KYOK'a itiraz süresi tebliğden itibaren 15 gündür ve Sulh Ceza Hâkimliğine yapılır.",
        isActive: true
    },
    {
        text: "CMK'ya göre soruşturma evresinin gizliliği ilkesi ile ilgili olarak; şüphelinin müdafiinin dosya içeriğini inceleme yetkisi hangi durumda kısıtlanabilir?",
        options: {
            A: "Her durumda kısıtlanabilir.",
            B: "Soruşturmanın amacını tehlikeye düşürebilecek ise hâkim kararıyla kısıtlanabilir.",
            C: "Savcı isterse kısıtlar.",
            D: "Katalog suçlarda otomatikman kısıtlıdır.",
            E: "Asla kısıtlanamaz."
        },
        correctAnswer: "B",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["soruşturma", "gizlilik", "müdafi"],
        solution: "<strong>Dayanak:</strong> CMK m.153<br><strong>Analiz:</strong> Dosya inceleme yetkisi, soruşturma tehlikeye girecekse savcının istemi üzerine Sulh Ceza Hâkimi kararıyla kısıtlanabilir.",
        isActive: true
    },
    {
        text: "CMK'ya göre kovuşturmaya yer olmadığına dair karar (KYOK) verildikten sonra, aynı fiilden dolayı kamu davası açılabilmesi için aranan iki şart nedir?",
        options: {
            A: "Mağdurun tekrar şikayetçi olması ve savcının onayı",
            B: "Yeni delil elde edilmesi ve bu hususta sulh ceza hâkimliğince karar verilmesi",
            C: "Savcının fikrini değiştirmesi ve başsavcının emri",
            D: "Şüphelinin itirafta bulunması",
            E: "Adalet Bakanlığının yazılı emri"
        },
        correctAnswer: "B",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["kyok", "dava açılması"],
        solution: "<strong>Dayanak:</strong> CMK m.172/2<br><strong>Analiz:</strong> KYOK sonrası dava açılabilmesi için YENİ DELİL ve HÂKİM KARARI şarttır.",
        isActive: true
    },
    {
        text: "CMK'ya göre suçun hukuki niteliğinin değişmesi (ek savunma) durumunda sanığa tanınan hak nedir?",
        options: {
            A: "Davanın düşmesini isteme hakkı",
            B: "Yargılamanın yenilenmesini isteme hakkı",
            C: "Suçun yeni niteliğine göre savunmasını yapabilmesi için ek savunma hakkı",
            D: "Hâkimin reddini isteme hakkı",
            E: "Tazminat isteme hakkı"
        },
        correctAnswer: "C",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["ek savunma", "hüküm"],
        solution: "<strong>Dayanak:</strong> CMK m.226<br><strong>Analiz:</strong> Suç vasfı değişirse sanığa mutlaka ek savunma hakkı verilmelidir, aksi halde hüküm kurulamaz.",
        isActive: true
    },
    {
        text: "CMK'ya göre iddianamenin kabulüyle birlikte başlayan evreye ne ad verilir?",
        options: {
            A: "Soruşturma",
            B: "Kovuşturma",
            C: "Ön inceleme",
            D: "Hüküm",
            E: "İnfaz"
        },
        correctAnswer: "B",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["kovuşturma", "tanımlar"],
        solution: "<strong>Dayanak:</strong> CMK m.175<br><strong>Analiz:</strong> İddianamenin kabulü ile soruşturma biter, kovuşturma başlar. Şüpheli artık 'sanık' olur.",
        isActive: true
    },
    {
        text: "CMK'ya göre HAGB kararı, sanık hakkında hukuki sonuç doğurur mu?",
        options: {
            A: "Evet, sabıka kaydına işlenir.",
            B: "Hayır, bunlara mahsus bir sisteme kaydedilir ancak hukuki sonuç doğurmaz.",
            C: "Evet, memuriyete engel olur.",
            D: "Evet, tekerrüre esas alınır.",
            E: "Evet, 5 yıl sonra silinir."
        },
        correctAnswer: "B",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["hagb", "adli sicil"],
        solution: "<strong>Dayanak:</strong> CMK m.231/13<br><strong>Analiz:</strong> HAGB sabıka kaydına işlenmez ve hukuki sonuç (memuriyete engel vb.) doğurmaz. Özel bir sisteme kaydedilir.",
        isActive: true
    },
    {
        text: "CMK'ya göre iddianamenin içeriğinde 'şüphelinin aleyhine' olan delillerin yanında 'lehine' olan delillerin de gösterilmesi zorunlu mudur?",
        options: {
            A: "Hayır, iddianame sadece suçlamayı içerir.",
            B: "Sadece şüpheli talep ederse eklenir.",
            C: "Evet, yüklenen suçu oluşturan olaylar, deliller (lehine ve aleyhine) gösterilir.",
            D: "Sadece ağır ceza davalarında zorunludur.",
            E: "Savcının takdirine bağlıdır."
        },
        correctAnswer: "C",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["iddianame", "deliller"],
        solution: "<strong>Dayanak:</strong> CMK m.170/4<br><strong>Analiz:</strong> Savcı maddi gerçeği arar. İddianamede hem lehe hem aleyhe deliller gösterilmek zorundadır.",
        isActive: true
    },
    {
        type: "oncullu",
        text: "CMK'ya göre soruşturmanın gizliliği ile ilgili;",
        questionRoot: "Aşağıdaki ifadelerden hangileri doğrudur?",
        onculler: [
            "I. Kanunda başka hüküm bulunmayan hallerde soruşturma evresi gizlidir.",
            "II. Şüphelinin lekelenmeme hakkı gözetilir.",
            "III. Savunma haklarına zarar vermemek koşuluyla gizlilik esastır."
        ],
        options: {
            A: "Yalnız I",
            B: "I ve II",
            C: "I ve III",
            D: "II ve III",
            E: "I, II ve III"
        },
        correctAnswer: "E",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["gizlilik", "ilkeler"],
        solution: "<strong>Dayanak:</strong> CMK m.157<br><strong>Analiz:</strong> Soruşturma lekelenmeme hakkı için gizlidir ancak bu gizlilik savunma hakkını engelleyemez.",
        isActive: true
    },
    {
        text: "CMK'ya göre HAGB kararına karşı başvurulabilecek kanun yolu nedir?",
        options: {
            A: "İstinaf",
            B: "Temyiz",
            C: "İtiraz",
            D: "Kanun yararına bozma",
            E: "Yargılamanın yenilenmesi"
        },
        correctAnswer: "C",
        category: "Ceza Muhakemesi Hukuku",
        tags: ["hagb", "kanun yolu"],
        solution: "<strong>Dayanak:</strong> CMK m.231/12<br><strong>Analiz:</strong> HAGB bir hüküm olmadığından istinafa değil, İTİRAZ yoluna tabidir.",
        isActive: true
    }
];

export async function seedQuestions() {
    if(!confirm(`⚠️ Veritabanına ${REAL_QUESTIONS.length} adet CMK sorusu yüklenecek.\nBu işlem daha kaliteli bir test oluşturmanızı sağlayacak. Onaylıyor musun?`)) return;

    const statusDiv = document.createElement('div');
    statusDiv.style = "position:fixed; bottom:140px; right:20px; background:#222; color:white; padding:20px; z-index:9999; border-radius:8px; box-shadow:0 5px 15px rgba(0,0,0,0.3); font-family:sans-serif;";
    statusDiv.innerHTML = "⏳ Sorular hazırlanıyor...";
    document.body.appendChild(statusDiv);

    try {
        const batch = writeBatch(db);
        const questionsRef = collection(db, "questions");

        // Gerçek soruları yükle
        REAL_QUESTIONS.forEach((q, index) => {
            const newDocRef = doc(questionsRef);
            batch.set(newDocRef, {
                ...q,
                createdAt: new Date(),
                order: index + 1
            });
        });

        await batch.commit();
        
        statusDiv.style.backgroundColor = "#28a745"; // Yeşil
        statusDiv.innerHTML = `✅ <b>BAŞARILI!</b><br>${REAL_QUESTIONS.length} adet nitelikli soru yüklendi.<br>Şimdi 'Sınavlar' menüsüne gidip yeni bir deneme oluşturabilirsin.`;
        setTimeout(() => statusDiv.remove(), 5000);
        console.log("Soru bankası güncellendi.");

    } catch (e) {
        statusDiv.style.backgroundColor = "#dc3545"; // Kırmızı
        statusDiv.innerHTML = "❌ Hata: " + e.message;
        console.error(e);
    }
}