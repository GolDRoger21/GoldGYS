# Stage 10 – Güvenlik & Ölçek Rehberi (Özet)

## 1) Firestore Rules
- İçerik koleksiyonları: herkes okuyabilir, sadece admin yazabilir.
- Kullanıcı verileri: sadece ilgili kullanıcı erişir (users/{uid}/...).
- Raporlar: kullanıcı create, admin read/update.

## 2) Admin Yetkisi
- Custom claim: admin=true
- functions/index.js -> setAdminClaim callable (caller admin olmalı)

## 3) App Check (Önerilir)
- Web uygulamasında App Check aç.
- Abuse/rate-limit için önemli.

## 4) Hosting Security Headers (Önerilir)
- CSP, X-Content-Type-Options, Referrer-Policy
- firebase.json -> headers bölümüne eklenebilir (sonraki aşamada sertleştiririz)

## 5) 3.000 eşzamanlı kullanıcı
- Hosting statik: çok rahat
- Firestore: okuma maliyeti önemli. Şunlara dikkat:
  - Soru çekme: sayfalama (limit/offset) kullan
  - Deneme: tek seferde tüm soruyu çekme (batch)
  - Cache: test meta verisini local cache'le
  - Index: testId+isActive / examId+isActive indexleri eklendi

## 6) KVKK pratikleri
- Kullanıcı verilerini minimum tut (email yerine uid)
- Silme talebi için admin panelde 'delete user data' akışı planla