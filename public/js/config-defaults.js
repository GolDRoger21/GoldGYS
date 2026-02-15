export const DEFAULT_PUBLIC_CONFIG = {
  branding: {
    siteName: "GOLD GYS",
    slogan: "Adalet Bakanlığı Görevde Yükselme sınavına giden en net yol",
    footerText: "© {year} GOLD GYS. Tüm hakları saklıdır.",
    logoUrl: "/icons/favicon.png",
    faviconUrl: "/icons/favicon.png"
  },
  contact: {
    supportEmail: "destek@goldgys.com",
    supportPhone: "+90 543 219 49 53",
    whatsappUrl: "https://wa.me/905432194953",
    telegramUrl: "https://t.me/goldgys",
    ticketCategories: [
      { value: "Genel", label: "Genel Bilgi Talebi" },
      { value: "Teknik", label: "Teknik Sorun / Hata" },
      { value: "İçerik", label: "Soru / İçerik Hatası" },
      { value: "Üyelik", label: "Üyelik ve Erişim" },
      { value: "Öneri", label: "Öneri ve Geri Bildirim" }
    ]
  },
  seo: {
    defaultTitle: "GOLD GYS | Adalet Bakanlığı GYS Hazırlık Platformu",
    defaultDescription: "GOLD GYS ile Adalet Bakanlığı Görevde Yükselme sınavına denemeler, konu analizleri ve hedef odaklı çalışma planlarıyla profesyonel şekilde hazırlan.",
    defaultKeywords: [
      "gold gys",
      "adalet bakanlığı",
      "görevde yükselme",
      "gys hazırlık",
      "deneme sınavı",
      "adalet personeli"
    ],
    ogImageUrl: ""
  },
  features: {
    maintenanceMode: false,
    allowRegistration: true
  },
  examRules: {
    defaultDuration: 120,
    targetQuestionCount: 80,
    wrongImpact: 0.25,
    showResultImmediately: true
  },
  system: {
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    version: "v2.1.0"
  },
  legal: {
    acikRizaUrl: "/pages/legal/acik-riza.html",
    aydinlatmaMetniUrl: "/pages/legal/aydinlatma-metni.html",
    gizlilikSozlesmesiUrl: "/pages/legal/gizlilik-sozlesmesi.html",
    uyelikSozlesmesiUrl: "/pages/legal/uyelik-sozlesmesi.html",
    kullanimSartlariUrl: "/pages/kullanim-sartlari.html",
    showMembershipAgreementSeparately: true
  }
};

export function mergeWithDefaultPublicConfig(config = {}) {
  return {
    ...DEFAULT_PUBLIC_CONFIG,
    ...config,
    branding: {
      ...DEFAULT_PUBLIC_CONFIG.branding,
      ...(config.branding || {})
    },
    contact: {
      ...DEFAULT_PUBLIC_CONFIG.contact,
      ...(config.contact || {})
    },
    seo: {
      ...DEFAULT_PUBLIC_CONFIG.seo,
      ...(config.seo || {})
    },
    features: {
      ...DEFAULT_PUBLIC_CONFIG.features,
      ...(config.features || {})
    },
    examRules: {
      ...DEFAULT_PUBLIC_CONFIG.examRules,
      ...(config.examRules || {})
    },
    system: {
      ...DEFAULT_PUBLIC_CONFIG.system,
      ...(config.system || {})
    },
    legal: {
      ...DEFAULT_PUBLIC_CONFIG.legal,
      ...(config.legal || {})
    }
  };
}
