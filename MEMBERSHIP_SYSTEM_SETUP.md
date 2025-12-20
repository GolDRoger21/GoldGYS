## GOLD GYS - Üyelik Sistemi Kuruluş Rehberi

### 📋 Sistem Özeti

Sistemde aşağıdaki üyelik kontrol mekanizmaları uygulanmıştır:

1. **Giriş (Login) Aşaması:**
   - Yeni kullanıcılar Google Account ile giriş yapar
   - Giriş sırasında Firestore'da kullanıcı belgesi oluşturulur
   - İlk giriş yapan kullanıcının status'u `pending` olarak ayarlanır

2. **Giriş Sonrası (Post-Login) Kontrol:**
   - `auth.js`: Giriş başarılı olduktan sonra, Firestore'dan kullanıcının status'u kontrol edilir
   - Status `pending` ise: "Hesabınızın onaylanması bekleniyor" uyarısı gösterilir ve giriş engellenir
   - Status `rejected` ise: "Başvurunuz reddedilmiştir" uyarısı gösterilir ve giriş engellenir
   - Status `active` ise: Dashboard'a yönlendirilir

3. **Sayfa Erişim Kontrolü (Page Protection):**
   - `role-guard.js`: Her sayfa yüklenirken erişim kontrol edilir
   - Status `pending` veya `rejected` kullanıcılar login sayfasına geri yönlendirilir
   - Role-based kontrolü sağlanır (admin, editor, student)

4. **Admin Paneli:**
   - Admin paneline yalnızca `admin` rolü olan kullanıcılar erişebilir
   - Admin panelinde, onay bekleyen (`pending` status) kullanıcıları görüntülenir
   - Admin kullanıcıları onaylar veya reddeder
   - Onaylama sırasında kullanıcı statüsü `active` olarak değiştirilir ve rol atanır

### 🔧 Admin Kurulumu

ercan21@gmail.com hesabını admin yapmak için:

#### Seçenek 1: Firebase Console (Önerilen)
1. https://console.firebase.google.com adresine gidin
2. "goldgys" projesini seçin
3. Sol menüden "Authentication" (Kimlik Doğrulama) seçin
4. Kullanıcılar listesinde "ercan21@gmail.com" bulun
5. Kullanıcıya tıklayın
6. Sağ taraftaki menüden "Custom Claims" bölümünü açın
7. Aşağıdaki JSON'u yapıştırın:
   ```json
   {
     "admin": true,
     "role": "admin",
     "editor": true
   }
   ```
8. Kaydet butonuna basın

#### Seçenek 2: Firebase CLI
```bash
firebase auth:set-custom-claims ercan21@gmail.com --claims admin=true,role=admin,editor=true
```

#### Seçenek 3: Setup Script (Node.js)
Eğer serviceAccountKey.json dosyası varsa:
```bash
cd functions
node ../scripts/setup-admin.js ercan21@gmail.com
```

### 📝 Ayrıca, Firestore'da Kullanıcı Belgesini Güncelle

Firestore'da (Users koleksiyonu > ercan21@gmail.com'un UID'si) şu alanları güncelleyin:
- `status`: `"active"` olarak ayarlayın
- `role`: `"admin"` olarak ayarlayın
- `roles`: `["admin", "editor", "student"]` olarak ayarlayın
- `isAdmin`: `true` olarak ayarlayın

### ✅ Test Etme

1. `/debug.html` adresine gidin
   - Kullanıcının oturum durumunu, token claims'lerini ve Firestore belgesini kontrol edin

2. Normal login testi:
   - Başka bir Google hesabı ile giriş yapın
   - "Hesabınızın onaylanması bekleniyor" uyarısını görmelisiniz
   - Login sayfasına geri yönlendirilmelisiniz

3. Admin login testi:
   - ercan21@gmail.com ile giriş yapın (admin yetkilerinin ayarlandığından emin olun)
   - Dashboard'ı görebilmelisiniz
   - `/admin` sayfasına gidebilmelisiniz
   - Bekleyen üyeleri görebilmeli ve onaylayabilmelisiniz

### 🔐 Firestore Güvenlik Kuralları

Firestore `firestore.rules` dosyasında aşağıdaki kurallar uygulanmıştır:

```rules
function isAdmin() { return roleIs('admin') || request.auth.token.admin == true; }

match /topics/{id} {
  allow read: if signedIn();
  allow write: if signedIn() && canManageContent();
}
```

Yalnızca authenticated users okuyabilir, yalnızca admin/editor yazabilir.

### 🛠️ Sorun Giderme

#### Sorun: "Hesabınızın onaylanması bekleniyor" uyarısı görüyorum

Çözüm: 
1. Admin hesabıyla giriş yapın
2. Admin paneline gidin (`/admin`)
3. Bekleyen üyeleri listede bulun
4. "Onayla" butonuna basın
5. Rol seçin ve onaylayın

#### Sorun: Admin paneline erişemiyorum

Çözüm:
1. `/debug.html` adresine gidin
2. Token claims'lerdeki `admin` değerinin `true` olup olmadığını kontrol edin
3. Eğer `false` ise, Firebase Console'dan custom claims'leri ekleyin (bkz. Admin Kurulumu)

#### Sorun: Dashboard görmüyorum, giriş sayfasına geri gidiyorum

Çözüm:
1. `/debug.html` adresine gidin
2. Status değerini kontrol edin - `pending` ise, admin tarafından onaylanmanız gerekir
3. Eğer status `active` ise, tarayıcı konsolunu açın (F12) ve hataları kontrol edin

---

**Yapılan Değişiklikler:**
- ✅ `auth.js`: Giriş sonrası status kontrolü eklenmiştir
- ✅ `role-guard.js`: Sayfa yüklemede status kontrolü eklenmiştir
- ✅ `user-profile.js`: Yeni kullanıcı oluşturulurken status = "pending" ayarlanır
- ✅ `/debug.html`: Sistem durumunu kontrol etmek için debug sayfası oluşturulmuştur
- ✅ `scripts/setup-admin.js`: Admin kurulumu için Node.js script'i oluşturulmuştur
