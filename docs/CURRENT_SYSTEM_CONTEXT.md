# GOLD GYS - Mevcut Sistem Bağlamı (Canlı Durum)

## 1. Proje Kimliği
- **Amaç:** Adalet Bakanlığı Görevde Yükselme Sınavı Hazırlık Portalı.
- **Teknoloji:** Vanilla JS (ES Modules), HTML5, CSS3 (CSS Variables), Firebase (v10 Modular SDK).
- **Hosting:** Firebase Hosting (SPA benzeri yapı, ancak statik sayfalar).

## 2. Kritik Dosya Yapısı ve İşlevleri
- **`public/js/firebase-config.js`**: Firebase başlatma ve export (auth, db, functions).
- **`public/js/ui-loader.js`**: Tüm sayfaların beyni. Header, Sidebar yükler, Auth durumunu kontrol eder, aktif menüyü işaretler.
- **`public/js/role-guard.js`**: Sayfa bazlı güvenlik. Kullanıcı `pending` ise login'e atar. Admin sayfalarını korur.
- **`public/js/auth.js`**: Login işlemleri. Giriş sonrası `users` koleksiyonundan `status` kontrolü yapar.
- **`public/js/user-profile.js`**: Kullanıcı verisi ve önbellekleme (SessionStorage) yönetimi.

## 3. Üyelik ve Rol Sistemi
- **Kayıt:** Google ile giriş. İlk kayıtta Firestore'da `status: "pending"` atanır.
- **Onay:** Admin panelinden manuel onaylanır (`status: "active"`).
- **Roller:**
  - `student`: Standart kullanıcı (Test çözer, analiz görür).
  - `editor`: İçerik girer (Konu, Soru).
  - `admin`: Tam yetki (Kullanıcı onayı, silme, rol atama).
- **Güvenlik:** Hem Firestore Rules hem de Frontend Guard ile korunur.

## 4. Veri Akışı (Firestore)
- **İçerik:** `topics` -> `lessons` (alt koleksiyon). `questions` (havuz). `exams` (denemeler).
- **Kullanıcı:** `users/{uid}` altında `progress`, `wrongs`, `favorites` alt koleksiyonları.
- **Admin:** `reports` (hata bildirimleri), `stats` (sistem sayaçları).

## 5. UI/UX Standartları
- **CSS:** `styles/tokens.css` (Renkler, Fontlar). `css/layout.css` (Grid yapı).
- **Bileşenler:** `public/components/ui/` altında modüler yapılar (Button, Card, Modal).
- **Admin Paneli:** `/admin/index.html` tek sayfa (SPA) mantığıyla modülleri (`modules/admin/*.js`) yükler.

## 6. Bekleyen İşler (Roadmap)
- [ ] Test Motoru (Test Engine) tam entegrasyonu.
- [ ] Deneme Sınavı (Süreli) modülü.
- [ ] İstatistik ve Analiz grafiklerinin gerçek veriye bağlanması.
