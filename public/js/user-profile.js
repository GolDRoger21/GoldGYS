import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Kullanıcının rollerini belirler (Token, Veritabanı ve Varsayılanları birleştirir)
 */
function collectRoles(existingData = {}, tokenClaims = {}) {
  const baseRoles = Array.isArray(existingData.roles)
    ? existingData.roles
    : (existingData.role ? [existingData.role] : []);

  const claimRoles = [
    tokenClaims.role,
    tokenClaims.admin ? "admin" : null,
    tokenClaims.editor ? "editor" : null,
  ].filter(Boolean);

  const roles = Array.from(new Set([...baseRoles, ...claimRoles]));
  return roles.length ? roles : ["student"];
}

/**
 * Kullanıcı sisteme girdiğinde profilini oluşturur veya günceller.
 * Geleceğe yönelik tüm istatistik alanlarını başlatır.
 */
export async function ensureUserDocument(user) {
  if (!user) return null;

  const userRef = doc(db, "users", user.uid);
  
  // Token'ı yenilemeyi dene (Claimlerin güncel olduğundan emin olmak için)
  const tokenResult = await user.getIdTokenResult?.(true).catch((tErr) => {
    console.warn('ID token refresh failed (ignored):', tErr?.message || tErr);
    return null;
  });

  const tokenClaims = tokenResult?.claims || {};
  let snap;
  let readError = null;

  try {
    snap = await getDoc(userRef);
  } catch (error) {
    // İzin hatası durumunda tekrar dene
    const code = error?.code || '';
    if (code === 'permission-denied' && typeof user.getIdTokenResult === 'function') {
      try {
        await user.getIdTokenResult(true);
        snap = await getDoc(userRef);
      } catch (retryErr) {
        readError = retryErr;
      }
    } else {
      readError = error;
    }
  }

  const readPermissionDenied = readError?.code === 'permission-denied';
  if (readError && !readPermissionDenied) {
    console.error("Kullanıcı dokümanı okunamadı", readError);
    // Okuma hatası olsa bile kritik değilse akışı durdurmuyoruz, aşağıda devam ediyoruz.
  }

  const isNewUser = snap ? !snap.exists() : true;
  const existingData = snap?.exists() ? snap.data() : {};

  // --- ROL VE DURUM YÖNETİMİ ---
  const roles = collectRoles(existingData, tokenClaims);
  const primaryRole = roles[0] || "student";

  let currentStatus = existingData.status;
  if (!currentStatus) {
      if (tokenClaims.status) currentStatus = tokenClaims.status;
      else if (tokenClaims.admin) currentStatus = "active";
      else currentStatus = isNewUser ? "pending" : "active"; // Varsayılan: Yeni üyeler onaya düşsün mü? (Burayı 'active' yaparsan herkes direkt girer)
  }

  if (readPermissionDenied) {
    console.warn('Profil erişimi kısıtlı, sadece temel verilerle devam ediliyor.');
    return { roles, role: primaryRole, status: currentStatus };
  }

  // --- GELECEĞE YÖNELİK VERİ YAPISI ---
  
  // 1. İstatistikler (Eğer yoksa başlat, varsa koru)
  const defaultStats = {
    totalQuestionsSolved: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalEmpty: 0,
    successRate: 0.0,      // Başarı yüzdesi
    totalTimeSpent: 0,     // Dakika cinsinden toplam süre
    completedTests: 0,     // Bitirilen konu testleri
    completedExams: 0,     // Bitirilen genel denemeler
    lastActivity: null     // Son test çözme tarihi
  };

  // 2. Kullanıcı Ayarları
  const defaultPreferences = {
    theme: "light",        // light / dark
    notifications: true,   // Bildirim izni
    emailUpdates: true     // E-posta bülteni
  };

  // 3. Abonelik Bilgisi (Gelecekte Premium özellikler için)
  const defaultSubscription = {
    plan: "free",          // free / pro / enterprise
    startDate: null,
    endDate: null,
    isActive: true
  };

  // --- GÜNCELLEME PAKETİNİ HAZIRLA ---
  const updatePayload = {
    // Temel Kimlik
    uid: user.uid,
    displayName: user.displayName || existingData.displayName || "İsimsiz Kullanıcı",
    email: user.email || existingData.email || "",
    photoURL: user.photoURL || existingData.photoURL || "",
    
    // Yetki ve Durum
    roles,
    role: primaryRole,
    status: currentStatus,
    
    // Zaman Damgaları
    lastLoginAt: serverTimestamp(), // Her girişte güncellenir

    // Gelişmiş Alanlar (Var olanın üzerine yazmaz, yoksa varsayılanı atar)
    stats: existingData.stats ? { ...defaultStats, ...existingData.stats } : defaultStats,
    preferences: existingData.preferences ? { ...defaultPreferences, ...existingData.preferences } : defaultPreferences,
    subscription: existingData.subscription ? { ...defaultSubscription, ...existingData.subscription } : defaultSubscription,
    
    // Teknik Metaveri
    metadata: {
      version: "1.0",
      lastIp: null, // Güvenlik gereği boş geçiyoruz, cloud function ile doldurulabilir
      platform: "web"
    }
  };

  // --- KRİTİK: OLUŞTURULMA TARİHİ ---
  // Sadece yeni kullanıcılarda veya tarihi eksik olanlarda çalışır.
  if (isNewUser || !existingData.createdAt) {
      updatePayload.createdAt = serverTimestamp();
      
      // Yeni kullanıcılarda favori ve yanlışlar için boş array'ler tanımlanabilir
      // Not: Firestore'da array limiti 1MB'dır. Çok fazla favori/yanlış olacaksa 
      // bunları ANA dokümanda değil, SUBCOLLECTION (Alt Koleksiyon) olarak tutmak en doğrusudur.
      // Bu yüzden buraya 'favorites: []' eklemiyoruz. Onları ayrı koleksiyonda tutacağız.
  }

  // --- VERİTABANINA YAZMA ---
  try {
    await setDoc(userRef, updatePayload, { merge: true });
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.warn('Profil yazma izni reddedildi (Firestore Rules).');
      return { roles, role: primaryRole, status: currentStatus };
    }

    console.error("Kullanıcı profili güncellenemedi:", error);
    // Hata fırlatmıyoruz ki kullanıcı giriş yapabilsin, sadece logluyoruz.
  }

  return { roles, role: primaryRole, status: currentStatus };
}