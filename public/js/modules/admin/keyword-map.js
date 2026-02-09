
/* 
    DOSYA: public/js/modules/admin/keyword-map.js 
    AMDİN PANELİ İÇİN KUŞBAKIŞI KONU HARİTASI
*/

export const TOPIC_KEYWORDS = {
    // --- TEMEL ANAYASAL DÜZEN ---
    "Türkiye Cumhuriyeti Anayasası": [
        "2709", "1982 anayasası", "anayasa", "temel haklar", "ödevler", "yasama", "yürütme", "yargı",
        "milletvekili", "dokunulmazlık", "tbmm", "cumhurbaşkanı", "anayasa mahkemesi", "genel esaslar", "başlangıç hükümleri"
    ],
    "Atatürk İlkeleri ve İnkılap Tarihi": [
        "atatürk", "inkılap", "kongre", "savaş", "cephe", "antlaşma", "lozan", "mudanya", "sivas", "erzurum",
        "amasya", "misak-ı milli", "kurtuluş savaşı", "cumhuriyetin ilanı", "halifelik"
    ],
    "Ulusal Güvenlik": [
        "ulusal güvenlik", "milli güvenlik kurulu", "mgk", "seferberlik", "savaş hali", "olağanüstü hal", "ohal", "sıkıyönetim"
    ],

    // --- DEVLET TEŞKİLATI VE İDARE ---
    "Devlet Teşkilatı ile İlgili Mevzuat": [
        "devlet teşkilatı", "kamu tüzel kişiliği", "idari vesayet", "yerinden yönetim", "merkezi idare", "yetki genişliği"
    ],
    "1 Sayılı CB Kararnamesi": [
        "1 sayılı", "cumhurbaşkanlığı kararnamesi", "cbk", "cumhurbaşkanlığı teşkilatı", "bakanlık kuruluş",
        "politika kurulları", "bağlı kuruluşlar", "ilgili kuruluşlar", "devlet denetleme kurulu"
    ],
    "5302 Sayılı İl Özel İdaresi Kanunu": [
        "5302", "il özel idaresi", "vali", "il genel meclisi", "il encümeni", "vali yardımcıları", "özel idare"
    ],
    "5393 Sayılı Belediye Kanunu": [
        "5393", "belediye kanunu", "belediye başkanı", "belediye meclisi", "belediye encümeni", "büyükşehir", "belde", "mahalle"
    ],
    "5442 Sayılı İl İdaresi Kanunu": [
        "5442", "il idaresi", "kaymakam", "ilçe idaresi", "bucak", "yetki genişliği", "il idare kurulu", "kolluk"
    ],
    "Bakanlık Merkez Teşkilatı": [
        "bakanlık", "genel müdürlük", "daire başkanlığı", "müsteşar", "bakan yardımcısı", "teftiş kurulu", "strateji geliştirme", "hukuk hizmetleri"
    ],

    // --- PERSONEL HUKUKU ---
    "657 Sayılı Devlet Memurları Kanunu": [
        "657", "devlet memurları", "memuriyet", "sınıflandırma", "derece", "kademe", "gösterge", "ek gösterge", "disiplin cezası",
        "uyarma", "kınama", "aylıktan kesme", "kademe ilerlemesi", "memurluktan çıkarma", "izinler", "sicil", "yer değiştirme"
    ],
    "Devlet Memurları ile İlgili Diğer Mevzuat": ["memur mevzuatı", "personel kanunları", "sözleşmeli personel", "399"],
    "Etik Davranış İlkeleri": [
        "etik", "ahlak", "kamu görevlileri etik kurulu", "hediye alma", "çıkar çatışması", "saydamlık", "hesap verebilirlik", "mal bildirimi"
    ],

    // --- YARGI VE USUL HUKUKU ---
    "Yargı Örgütü": ["yargı örgütü", "adli yargı", "idari yargı", "yüksek mahkemeler", "hakimler ve savcılar"],
    "5235 Sayılı Adli Yargı Kanunu": [
        "5235", "adli yargı", "bölge adliye mahkemesi", "bam", "asliye ceza", "ağır ceza", "sulh ceza", "adalet komisyonu"
    ],
    "2576 Sayılı İdari Yargı Kanunu": [
        "2576", "idare mahkemesi", "vergi mahkemesi", "bölge idare mahkemesi", "bim", "kuruluş ve görevleri"
    ],
    "2577 Sayılı İdari Yargılama Usulü Kanunu (İYUK)": [
        "2577", "iyuk", "idari yargılama", "iptal davası", "tam yargı davası", "yürütmeyi durdurma", "dilekçe ret",
        "ilk inceleme", "karar düzeltme", "kanun yararına bozma", "süreler"
    ],
    "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)": [
        "5271", "cmk", "ceza muhakemesi", "soruşturma", "kovuşturma", "iddianame", "şüpheli", "sanık", "müdafii",
        "tutuklama", "adli kontrol", "arama", "el koyma", "ifade alma", "sorgu", "delil", "tanık"
    ],
    "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)": [
        "6100", "hmk", "hukuk muhakemeleri", "dava şartları", "ilk itirazlar", "deliller", "tanık", "bilirkişi", "yemin",
        "istinaf", "temyiz", "feragat", "kabul", "sulh", "ön inceleme"
    ],
    "5275 Sayılı İnfaz Kanunu": [
        "5275", "ceza infaz", "infaz hakimliği", "denetimli serbestlik", "koşullu salıverilme", "açık cezaevi",
        "kapalı cezaevi", "disiplin hapsi", "müddetname"
    ],

    // --- MALİ VE İDARİ İŞLER ---
    "5018 Sayılı Kamu Mali Yönetimi": [
        "5018", "kamu mali yönetimi", "bütçe", "kesin hesap", "stratejik plan", "performans", "iç denetim",
        "sayıştay", "harcama yetkilisi", "gerçekleştirme görevlisi", "taşınır mal"
    ],
    "Yazı İşleri Hizmetleri ve Harçlar": ["492", "harçlar kanunu", "yargı harçları", "nispi harç", "maktu harç", "yazı işleri", "kalem mevzuatı", "teminat"],

    // --- İLETİŞİM VE BİLİŞİM ---
    "Türkçe Dil Bilgisi": [
        "yazım kuralları", "noktalama işaretleri", "anlatım bozukluğu", "ses bilgisi", "cümlenin ögeleri", "yazım yanlışı", "paragraf"
    ],
    "Halkla İlişkiler": [
        "halkla ilişkiler", "iletişim", "empati", "beden dili", "kurumsal iletişim", "kriz yönetimi", "protokol", "imaj"
    ],
    "UYAP Bilişim Sistemi": [
        "uyap", "ulusal yargı ağı", "bilişim sistemi", "e-imza", "segis", "avukat portal", "vatandaş portal", "sms bilgi"
    ],
    "Elektronik İmza ve SEGBİS": [
        "5070", "elektronik imza", "e-imza", "zaman damgası", "nitelikli elektronik sertifika", "nes",
        "segbis", "ses ve görüntü", "video konferans"
    ],
    "Resmi Yazışma Kuralları": [
        "resmi yazışma", "belge", "standart dosya planı", "üst yazı", "imza yetkisi", "paraflama", "dağıtım", "ivedi", "gizli", "ebys"
    ],

    // --- TEBLİGAT VE HAKLAR ---
    "Tebligat Hukuku ve 7201 Sayılı Kanunu": ["7201", "tebligat kanunu", "tebligat", "usulsüz tebligat", "muhtara tebligat", "ilanen tebligat", "e-tebligat", "kep"],

    "4982 Bilgi Edinme Hakkı": ["4982", "bilgi edinme", "bedk", "bilgi edinme kurulu", "gizli bilgi", "ticari sır", "itiraz"],
    "3071 Dilekçe Hakkı": ["3071", "dilekçe hakkı", "dilekçe kanunu", "ihbar ve şikayet", "tbmm dilekçe komisyonu"]
};
