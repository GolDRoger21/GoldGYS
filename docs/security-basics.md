# Güvenlik Temelleri (Stage 0)

## Yetkisiz erişim
- Auth guard ile korunacak.
- Firestore Rules ile "login yoksa read yok" uygulanacak.

## Rol tabanlı erişim
- student: sadece okuma + kendi verisini yazma
- admin: içerik yazma/düzenleme + rapor yönetimi

## Veri ayrımı
- İçerik: topics/tests/exams (okunabilir; yazma admin)
- Kullanıcı verisi: users/{uid}/... (sadece kendisi)

## Sızdırma riskleri
- Gizli anahtarlar public içine konulmaz.
- Firebase config publish edilebilir ama yetki Rules ile korunur.