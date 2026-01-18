/**
 * Legislation Map
 * Kanun No ve Madde Aralığına göre Konu Başlığını döner.
 * Auto-generated from seed data logic.
 */

export const LEGISLATION_MAP = [
    { code: "2709", range: [1, 11], topic: "Türkiye Cumhuriyeti Anayasası", lesson: "Genel Esaslar" },
    { code: "2709", range: [12, 74], topic: "Türkiye Cumhuriyeti Anayasası", lesson: "Temel Hak ve Ödevler" },
    { code: "2709", range: [75, 160], topic: "Türkiye Cumhuriyeti Anayasası", lesson: "Cumhuriyetin Temel Organları" },
    { code: "2709", range: [138, 160], topic: "Adli ve İdari Yargı Komisyonları ve Yargı Örgütü (Ortak)", lesson: "T.C. Anayasası (Yargı)" }, // Overlap handled by order or specifity? User should check.

    { code: "5302", range: "ALL", topic: "Devlet Teşkilatı ile İlgili Mevzuat", lesson: "5302 Sayılı İl Özel İdaresi Kanunu" },
    { code: "5393", range: "ALL", topic: "Devlet Teşkilatı ile İlgili Mevzuat", lesson: "5393 Sayılı Belediye Kanunu" },
    { code: "5442", range: "ALL", topic: "Devlet Teşkilatı ile İlgili Mevzuat", lesson: "5442 Sayılı İl İdaresi Kanunu" },

    { code: "CBK-1", range: [1, 37], topic: "Devlet Teşkilatı ile İlgili Mevzuat", lesson: "1 Sayılı CB Kararnamesi (Genel)" },
    { code: "CBK-1", range: [38, 56], topic: "Bakanlık Merkez Teşkilatı (Ortak)", lesson: "1 Sayılı CB Kararnamesi (Adalet Bakanlığı)" },
    { code: "CBK-1", range: "KISIM-6", topic: "Bakanlık Teşkilatı (Alan)", lesson: "1 Sayılı CB Kararnamesi (6. Kısım)" },

    { code: "657", range: "ALL", topic: "657 Sayılı Devlet Memurları Kanunu", lesson: "657 Sayılı DMK" },

    { code: "5235", range: "ALL", topic: "Adli ve İdari Yargı Komisyonları ve Yargı Örgütü (Ortak)", lesson: "5235 Sayılı Adli Yargı Kanunu" },
    // Note: 5235 is also in Alan topic 14 but typically Common takes precedence or we list both? 
    // For auto-select, we'll return the first match or specific one.

    { code: "2576", range: "ALL", topic: "Adli ve İdari Yargı Komisyonları ve Yargı Örgütü (Ortak)", lesson: "2576 Sayılı İdari Yargı Kanunu" },

    { code: "UYAP_01", range: "ALL", topic: "UYAP Bilişim Sistemi", lesson: "UYAP Mevzuatı" },
    { code: "5018", range: "ALL", topic: "5018 Sayılı Kamu Mali Yönetimi", lesson: "5018 Sayılı Kanun" },

    { code: "5070", range: "ALL", topic: "Elektronik İmza ve SEGBİS", lesson: "5070 Sayılı Elektronik İmza Kanunu" },

    { code: "7201", range: "ALL", topic: "Tebligat Hukuku", lesson: "7201 Sayılı Tebligat Kanunu" },

    { code: "4982", range: "ALL", topic: "Devlet Memurları ile İlgili Diğer Mevzuat", lesson: "4982 Bilgi Edinme Hakkı" },
    { code: "3071", range: "ALL", topic: "Devlet Memurları ile İlgili Diğer Mevzuat", lesson: "3071 Dilekçe Hakkı" },

    { code: "492", range: "ALL", topic: "Yazı İşleri Hizmetleri ve Harçlar", lesson: "492 Sayılı Harçlar Kanunu" },

    { code: "5271", range: [1, 156], topic: "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)", lesson: "Birinci Kitap (Genel Hükümler)" },
    { code: "5271", range: [157, 174], topic: "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)", lesson: "İkinci Kitap (Soruşturma)" },
    { code: "5271", range: [175, 232], topic: "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)", lesson: "Üçüncü Kitap (Kovuşturma)" },
    { code: "5271", range: [233, 252], topic: "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)", lesson: "Dördüncü Kitap (Mağdur, Tanık)" },
    { code: "5271", range: [253, 255], topic: "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)", lesson: "Beşinci Kitap (Özel Yargılama)" },
    { code: "5271", range: [260, 323], topic: "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)", lesson: "Altıncı Kitap (Kanun Yolları)" },
    { code: "5271", range: [324, 335], topic: "5271 Sayılı Ceza Muhakemesi Kanunu (CMK)", lesson: "Yedinci Kitap (Yargılama Giderleri)" },

    { code: "6100", range: [1, 108], topic: "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)", lesson: "Birinci Kısım (Genel Hükümler)" },
    { code: "6100", range: [109, 117], topic: "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)", lesson: "İkinci Kısım (Dava Çeşitleri)" },
    { code: "6100", range: [118, 186], topic: "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)", lesson: "Üçüncü Kısım (Yazılı Yargılama)" },
    { code: "6100", range: [294, 303], topic: "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)", lesson: "Beşinci Kısım (Hüküm)" },
    { code: "6100", range: [341, 373], topic: "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)", lesson: "Kanun Yolları (İstinaf/Temyiz)" },
    { code: "6100", range: [323, 340], topic: "6100 Sayılı Hukuk Muhakemeleri Kanunu (HMK)", lesson: "Onuncu Kısım (Yargılama Giderleri)" },

    { code: "2577", range: [1, 10], topic: "2577 Sayılı İdari Yargılama Usulü Kanunu", lesson: "Birinci Bölüm (Genel Esaslar)" },
    { code: "2577", range: [11, 32], topic: "2577 Sayılı İdari Yargılama Usulü Kanunu", lesson: "İkinci Bölüm (İdari Dava Açılması)" },
    { code: "2577", range: [33, 55], topic: "2577 Sayılı İdari Yargılama Usulü Kanunu", lesson: "Üçüncü Bölüm (Kararlar)" },

    { code: "5275", range: [1, 19], topic: "5275 Sayılı İnfaz Kanunu", lesson: "Birinci Kitap (İnfazın İlkeleri)" },
    { code: "5275", range: [80, 100], topic: "5275 Sayılı İnfaz Kanunu", lesson: "Dördüncü Kısım (Cezaların İnfazı)" }
];

export function findTopicByLegislation(code, article) {
    // 1. Kanun koduna göre filtrele
    const matches = LEGISLATION_MAP.filter(m => m.code === code);
    if (!matches.length) return null;

    // 2. Madde varsa, aralığı kontrol et
    const artNum = parseInt(article);
    if (isNaN(artNum)) return matches[0]; // Madde yoksa ilk eşleşeni dön (veya null dönülebilir)

    // 3. Aralığa giren ilki bul
    const found = matches.find(m => {
        if (m.range === "ALL") return true;
        if (Array.isArray(m.range)) {
            return artNum >= m.range[0] && artNum <= m.range[1];
        }
        return false;
    });

    return found || matches[0]; // Aralığa girmezse yine de kanunla ilgili ilk konuyu öner
}
