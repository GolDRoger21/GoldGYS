# Teknik Mimari ve Kod Yapısı

## Frontend Mimarisi
Proje, **Vanilla JS + ES Modules** üzerine kuruludur. Framework (React/Vue) kullanılmamıştır, ancak modern bir yapıdadır.

### 1. UI Loader (`ui-loader.js`)
Sayfaların "iskeletini" yönetir.
- Her sayfa yüklendiğinde çalışır.
- `header-placeholder` ve `sidebar-placeholder` alanlarına HTML enjekte eder.
- Kullanıcı giriş yapmışsa profil resmini ve ismini header'a yazar.
- Admin ise gizli menüleri açar.

### 2. Role Guard (`role-guard.js`)
Sayfa güvenliğinden sorumludur.
- `requireAdminOrEditor()`: Admin paneli gibi sayfaları korur.
- `protectPage()`: Standart sayfaları korur (Login olmamışsa atar).
- Kullanıcı `pending` durumundaysa içeri almaz.

### 3. Admin Paneli Yapısı
Admin paneli (`/admin/index.html`) bir SPA (Single Page Application) gibi davranır.
- Sol menüdeki linkler `#users`, `#content` gibi hash değişimlerini tetikler.
- `admin-page.js` bu hash değişimini dinler ve ilgili modülü (`modules/admin/users.js` vb.) yükler.
- Bu sayede sayfa yenilenmeden sekmeler arası geçiş yapılır.

## Backend (Firebase)
- **Auth:** Kimlik doğrulama ve Custom Claims (admin=true) yönetimi.
- **Firestore:** Veritabanı.
- **Functions:** Hassas işlemler (Kullanıcı silme, Rol atama) için Node.js backend.
- **Hosting:** Statik dosyaların sunumu.

## Güvenlik Katmanları
1. **UI Guard:** JS ile yönlendirme (UX için).
2. **Firestore Rules:** Veri okuma/yazma güvenliği (Asıl güvenlik).
3. **Cloud Functions:** Admin yetkisi gerektiren işlemler için sunucu tarafı kontrolü.