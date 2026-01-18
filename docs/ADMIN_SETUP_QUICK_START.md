## ercan21@gmail.com Admin Yetkisi Kurulumu - Hızlı Başlangıç

### 🎯 Hedef
ercan21@gmail.com hesabını sistem admin'i yapmak ve onay bekleyen kullanıcıları yönetebilmesi sağlamak.

### ⚠️ Problem Tanısı
Şu anda ercan21@gmail.com ile giriş yaptığınızda:
- Dashboard'ı görmüyor ve giriş sayfasına geri dönüyor
- Admin paneline erişemiyor

Bunun nedenleri:
1. **Firebase Custom Claims**: Kullanıcının `admin: true` claim'i yok
2. **Firestore Status**: Kullanıcının status'u `pending` olmuş olabilir

### ✅ Çözüm Adımları

#### Adım 1: Status'ü Kontrol Et
1. `/debug.html` adresine gidin
2. ercan21@gmail.com ile oturum açın
3. **Firestore Belgesi** bölümünde:
   - Status değerini kontrol edin (pending/active olmalı)
   - Admin değerini kontrol edin (true olmalı)

#### Adım 2: Admin Custom Claims Ekle
**YÖNTEMİ - 1: Firebase Console (KOLAY)**

1. https://console.firebase.google.com açın
2. "goldgys" projesini seçin
3. Sol menüden **"Authentication"** → **"Users"** seçin
4. "ercan21@gmail.com" bulun ve tıklayın
5. **"Custom Claims"** bölümünde, açılır menüyü tıklayın
6. Aşağıdaki JSON'u yapıştırın:
```json
{
  "admin": true,
  "role": "admin",
  "editor": true
}
```
7. **"Update"** butonuna basın

**YÖNTEM 2: Firebase CLI**
Terminal'de aşağıdaki komutu çalıştırın:
```bash
firebase auth:set-custom-claims ercan21@gmail.com --claims admin=true,role=admin,editor=true
```

**YÖNTEM 3: Cloud Functions**
Admin panelinde zaten admin iseniz, aşağıdaki adımları izleyin:
1. Başka bir admin hesabıyla giriş yapın
2. Admin panelinde (varsa) "Rol Güncelle" bölümünde:
   - UID: (ercan21@gmail.com'un UID'si)
   - Rol: Admin
   - "Rolü Güncelle" butonuna basın

#### Adım 3: Firestore Belgesini Güncelle

Firebase Console'da:
1. Left menu → **"Firestore Database"** seçin
2. **"users"** koleksiyonunu açın
3. ercan21@gmail.com'un UID'sini bulun (genellikle 28 karakter uzun alphanumeric string)
4. Belgeyi açın ve şu alanları kontrol/düzenleyin:
   - `status`: `"active"` olmalı (değilse değiştirin)
   - `role`: `"admin"` olmalı
   - `roles`: `["admin", "editor", "student"]` olmalı
   - `isAdmin`: `true` olmalı

#### Adım 4: Token'ı Yenile
1. Çıkış yapın
2. Tarayıcı cache'ini temizleyin (Ctrl+Shift+Delete)
3. Tekrar giriş yapın

### 🧪 Test Et
1. `/debug.html` adresine gidin
2. **Token Claims** bölümünde:
   - `admin: true` olmalı
   - `role: admin` olmalı
3. **Firestore Belgesi** bölümünde:
   - `status: active` olmalı
4. Dashboard'ı açabilmelisiniz (`/pages/dashboard.html`)
5. Admin paneline erişebilmelisiniz (`/admin`)

### 🆘 Sorun Giderilmezse

**Q: Hala "Hesabınızın onaylanması bekleniyor" mesajı alıyorum**
A: 
1. `/debug.html`'de status kontrolü yapın
2. Eğer `pending` ise, başka bir admin hesabıyla admin paneline gidip bu hesabı onaylayın
3. Ya da Firestore'da doğrudan `status` alanını `"active"` olarak düzenleyin

**Q: Token claims'lerdeki admin değeri false kalıyor**
A:
1. Firebase Console'dan custom claims'leri düzelttiğinizden emin olun
2. Tarayıcı cache'ini temizleyin
3. Çıkış yapıp tekrar giriş yapın

**Q: Admin paneline "Bu sayfa yalnızca admin rolüne sahip hesaplar içindir" uyarısı alıyorum**
A:
1. Token'ı yenilemek için çıkış yapıp tekrar giriş yapın
2. `/debug.html`'de `token.claims.admin` değerinin `true` olduğunu kontrol edin

### 📋 Onay Bekleyen Kullanıcıları Yönetme
1. Admin hesabıyla giriş yapın
2. Admin paneline gidin (`/admin`)
3. "Bekleyen Üyeler" listesini göreceksiniz
4. Her kullanıcı için:
   - Rol seçin (Öğrenci/Editör/Admin)
   - "Onayla" butonuna basın
5. Onaylanan kullanıcılar artık sisteme girebilir

---

**Son kontrol listesi:**
- [ ] Firebase Console'da custom claims eklendi
- [ ] Firestore'da status = "active"
- [ ] Firestore'da role = "admin"
- [ ] Çıkış yapıp tekrar giriş yapıldı
- [ ] `/debug.html` sayfasında token claims'ler kontrol edildi
- [ ] Dashboard açılabiliyor
- [ ] Admin paneline erişilebiliyor
