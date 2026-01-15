
export const EXAM_TOPICS = {
    // ----------------------------------------------------------------
    // ORTAK KONULAR (32 Soru)
    // ----------------------------------------------------------------
    common: [
        {
            id: 'c1',
            title: 'T.C. Anayasası',
            questionCount: 6,
            icon: 'balance-scale',
            desc: 'Genel esaslar, Temel haklar ve Devletin temel organları.',
            progress: 0,
            subTopics: [
                { title: 'Genel Esaslar (Md. 1-11)', completed: false },
                { title: 'Temel Hak ve Ödevler (Md. 12-74)', completed: false },
                { title: 'Cumhuriyetin Temel Organları: Yasama', completed: false },
                { title: 'Cumhuriyetin Temel Organları: Yürütme', completed: false },
                { title: 'Cumhuriyetin Temel Organları: Yargı', completed: false }
            ]
        },
        {
            id: 'c2',
            title: 'Atatürk İlkeleri ve İnkılap Tarihi',
            questionCount: 2,
            icon: 'flag',
            desc: 'Atatürk ilkeleri, inkılap tarihi ve ulusal güvenlik.',
            progress: 0,
            subTopics: [
                { title: 'Atatürk İlkeleri', completed: false },
                { title: 'İnkılap Tarihi', completed: false },
                { title: 'Ulusal Güvenlik', completed: false }
            ]
        },
        {
            id: 'c3',
            title: 'Devlet Teşkilatı Mevzuatı',
            questionCount: 9,
            icon: 'building',
            desc: 'Mahalli idareler ve Cumhurbaşkanlığı teşkilatı.',
            progress: 0,
            subTopics: [
                { title: '5302 Sayılı İl Özel İdaresi Kanunu (2 Soru)', completed: false },
                { title: '5393 Sayılı Belediye Kanunu (2 Soru)', completed: false },
                { title: '5442 Sayılı İl İdaresi Kanunu (2 Soru)', completed: false },
                { title: '1 Sayılı CB Kararnamesi (Genel) (3 Soru)', completed: false }
            ]
        },
        {
            id: 'c4',
            title: '657 Sayılı DMK',
            questionCount: 6,
            icon: 'user-tie',
            desc: 'Devlet Memurları Kanunu ve ilgili mevzuat.',
            progress: 0,
            subTopics: [
                { title: 'Genel Hükümler', completed: false },
                { title: 'Sınıflandırma', completed: false },
                { title: 'Haklar, Ödevler ve Yasaklar', completed: false },
                { title: 'Disiplin Hükümleri', completed: false }
            ]
        },
        {
            id: 'c5',
            title: 'Türkçe Dil Bilgisi',
            questionCount: 2,
            icon: 'book',
            desc: 'Türkçe dil bilgisi ve yazışma kuralları.',
            progress: 0,
            subTopics: [
                { title: 'Dil Bilgisi Kuralları', completed: false },
                { title: 'Anlatım Bozuklukları', completed: false },
                { title: 'Yazım ve Noktalama', completed: false }
            ]
        },
        {
            id: 'c6',
            title: 'Halkla İlişkiler',
            questionCount: 1,
            icon: 'handshake',
            desc: 'Halkla ilişkiler temel kavramları.',
            progress: 0,
            subTopics: [
                { title: 'Halkla İlişkiler Genel Konular', completed: false }
            ]
        },
        {
            id: 'c7',
            title: 'Etik Davranış İlkeleri',
            questionCount: 1,
            icon: 'award',
            desc: 'Kamu görevlileri etik davranış ilkeleri.',
            progress: 0,
            subTopics: [
                { title: 'Etik Davranış İlkeleri Yönetmeliği', completed: false }
            ]
        },
        {
            id: 'c8',
            title: 'Bakanlık Merkez Teşkilatı',
            questionCount: 1,
            icon: 'landmark',
            desc: '1 Sayılı CB Kararnamesi (Md. 38-56).',
            progress: 0,
            subTopics: [
                { title: 'Adalet Bakanlığı Teşkilat Yapısı', completed: false },
                { title: 'Hizmet Birimleri ve Görevleri', completed: false }
            ]
        },
        {
            id: 'c9',
            title: 'Komisyonlar ve Yargı Örgütü (Ortak)',
            questionCount: 2,
            icon: 'university',
            desc: 'Adli/İdari yargı yapısı ve komisyonlar.',
            progress: 0,
            subTopics: [
                { title: 'T.C. Anayasası (Yargı Bölümü)', completed: false },
                { title: '5235 Sayılı Adli Yargı Kanunu', completed: false },
                { title: '2576 Sayılı İdari Yargı Kanunu', completed: false },
                { title: 'Yazı İşleri Yönetmeliği (İlgili Kısımlar)', completed: false }
            ]
        },
        {
            id: 'c10',
            title: 'UYAP Bilgisi',
            questionCount: 1,
            icon: 'laptop-code',
            desc: 'Ulusal Yargı Ağı Bilişim Sistemi mevzuatı.',
            progress: 0,
            subTopics: [
                { title: '6100 Sayılı HMK (Madde 445)', completed: false },
                { title: '5271 Sayılı CMK (Madde 38/A)', completed: false },
                { title: 'Yazı İşleri Yönetmelikleri (Madde 5)', completed: false }
            ]
        },
        {
            id: 'c11',
            title: '5018 Sayılı Mali Yönetim',
            questionCount: 1,
            icon: 'calculator',
            desc: 'Kamu Mali Yönetimi ve Kontrol Kanunu.',
            progress: 0,
            subTopics: [
                { title: 'Genel Hükümler', completed: false },
                { title: 'Bütçe Türleri ve Kapsam', completed: false }
            ]
        }
    ],

    // ----------------------------------------------------------------
    // ALAN BİLGİSİ: YAZI İŞLERİ MÜDÜRÜ (48 Soru)
    // ----------------------------------------------------------------
    field: [
        {
            id: 'f1',
            title: 'Bakanlık Teşkilatı (Alan)',
            questionCount: 3,
            icon: 'landmark',
            desc: '1 Sayılı CB Kararnamesi (Altıncı Kısım Birinci Bölüm).',
            progress: 0,
            subTopics: [
                { title: 'Bakanlık Teşkilatı (Detaylı)', completed: false }
            ]
        },
        {
            id: 'f2',
            title: 'Komisyonlar (Alan)',
            questionCount: 1,
            icon: 'users-cog',
            desc: 'Adli ve idari yargı adalet komisyonlarının yapısı.',
            progress: 0,
            subTopics: [
                { title: 'Adli Yargı Yazı İşleri Yön. (2. Kısım 6. Bölüm)', completed: false },
                { title: 'İdari Yargı Yazı İşleri Yön. (3. Kısım 1. Bölüm)', completed: false }
            ]
        },
        {
            id: 'f3',
            title: 'Yargı Örgütü (Alan)',
            questionCount: 4,
            icon: 'gavel',
            desc: 'Mahkemelerin kuruluş, görev ve yetkileri.',
            progress: 0,
            subTopics: [
                { title: '5235 Sayılı Adli Yargı Kanunu', completed: false },
                { title: '2576 Sayılı İdari Yargı Kanunu', completed: false }
            ]
        },
        {
            id: 'f4',
            title: 'E-İmza ve SEGBİS',
            questionCount: 3,
            icon: 'fingerprint',
            desc: 'Elektronik imza ve sesli/görüntülü bilişim sistemi.',
            progress: 0,
            subTopics: [
                { title: '5070 Sayılı Elektronik İmza Kanunu (2 Soru)', completed: false },
                { title: 'Ceza Muhakemesinde SEGBİS Yönetmeliği (1 Soru)', completed: false },
                { title: 'Hukuk Muhakemelerinde SEGBİS Yönetmeliği', completed: false }
            ]
        },
        {
            id: 'f5',
            title: 'Resmi Yazışma Kuralları',
            questionCount: 6,
            icon: 'envelope-open-text',
            desc: 'Resmi yazışmalarda usul ve esaslar.',
            progress: 0,
            subTopics: [
                { title: 'Resmi Yazışma Yönetmeliği', completed: false },
                { title: 'Resmi Yazışma Kılavuzu', completed: false }
            ]
        },
        {
            id: 'f6',
            title: 'Tebligat Hukuku',
            questionCount: 5,
            icon: 'paper-plane',
            desc: '7201 sayılı kanun ve ilgili yönetmelikler.',
            progress: 0,
            subTopics: [
                { title: '7201 Sayılı Tebligat Kanunu', completed: false },
                { title: 'Tebligat Kanunu Uygulama Yönetmeliği', completed: false },
                { title: 'Elektronik Tebligat Yönetmeliği', completed: false }
            ]
        },
        {
            id: 'f7',
            title: 'Devlet Memurları Mevzuatı (Alan)',
            questionCount: 7,
            icon: 'id-card',
            desc: 'Bilgi edinme, disiplin, atama ve nakil işlemleri.',
            progress: 0,
            subTopics: [
                { title: '4982 Sayılı Bilgi Edinme Hakkı Kanunu (1 Soru)', completed: false },
                { title: '3071 Sayılı Dilekçe Hakkı Kanunu (1 Soru)', completed: false },
                { title: 'Adalet Bakanlığı Disiplin Yönetmeliği (2 Soru)', completed: false },
                { title: 'Görevde Yükselme Yönetmeliği (1 Soru)', completed: false },
                { title: 'Memur Sınav, Atama ve Nakil Yönetmeliği (2 Soru)', completed: false }
            ]
        },
        {
            id: 'f8',
            title: 'Yazı İşleri ve Harçlar',
            questionCount: 9,
            icon: 'file-invoice-dollar',
            desc: 'Harçlar Kanunu ve yazı işleri hizmetleri.',
            progress: 0,
            subTopics: [
                { title: '492 Sayılı Harçlar Kanunu (1. ve 3. Kısım) (1 Soru)', completed: false },
                { title: 'Adli Yargı Yazı İşleri Yönetmeliği (4 Soru)', completed: false },
                { title: 'İdari Yargı Yazı İşleri Yönetmeliği (4 Soru)', completed: false }
            ]
        },
        {
            id: 'f9',
            title: '5271 Sayılı CMK',
            questionCount: 3,
            icon: 'balance-scale-right',
            desc: 'Ceza Muhakemesi Kanunu ilgili kitaplar.',
            progress: 0,
            subTopics: [
                { title: '1. Kitap (Tanık, Bilirkişi, Keşif vb.)', completed: false },
                { title: '2. Kitap (Koruma Tedbirleri)', completed: false },
                { title: '3. ve 4. Kitap İlgili Kısımlar', completed: false },
                { title: '5. 6. ve 7. Kitap İlgili Kısımlar', completed: false }
            ]
        },
        {
            id: 'f10',
            title: '6100 Sayılı HMK',
            questionCount: 3,
            icon: 'gavel',
            desc: 'Hukuk Muhakemeleri Kanunu ilgili kısımlar.',
            progress: 0,
            subTopics: [
                { title: '1. Kısım (Görev, Yetki, Yargı Yeri)', completed: false },
                { title: '2. Kısım (Dava Çeşitleri)', completed: false },
                { title: '3. Kısım (Taraflar ve Davaya Katılma)', completed: false },
                { title: '5, 6, 7, 8, 9 ve 10. Kısımlar', completed: false }
            ]
        },
        {
            id: 'f11',
            title: '2577 Sayılı İYUK',
            questionCount: 2,
            icon: 'file-contract',
            desc: 'İdari Yargılama Usulü Kanunu.',
            progress: 0,
            subTopics: [
                { title: 'Birinci Bölüm (Genel Esaslar)', completed: false },
                { title: 'İkinci Bölüm (Dava Açma)', completed: false },
                { title: 'Üçüncü Bölüm (Davaların Karara Bağlanması)', completed: false }
            ]
        },
        {
            id: 'f12',
            title: '5275 Sayılı İnfaz Kanunu',
            questionCount: 2,
            icon: 'lock',
            desc: 'Ceza ve Güvenlik Tedbirlerinin İnfazı Hakkında Kanun.',
            progress: 0,
            subTopics: [
                { title: '1. Kitap (İnfazın İlkeleri)', completed: false },
                { title: '2. Kitap (Hapis Cezalarının İnfazı)', completed: false },
                { title: '4. Kısım (Denetimli Serbestlik)', completed: false }
            ]
        }
    ]
};

// Yardımcı Fonksiyon: ID'ye göre konu bulma
export function getTopicById(id) {
    const all = [...EXAM_TOPICS.common, ...EXAM_TOPICS.field];
    return all.find(t => t.id === id);
}
