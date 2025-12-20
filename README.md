# Stage 10 – Firestore Rules & Functions

Bu paket:
- firestore/firestore.rules
- firestore/firestore.indexes.json
- functions/ (admin claim atama şablonu)
- docs/security-and-scaling.md
- docs/manual-auth-rules-test-checklist.md (manuel doğrulama senaryoları)

Uygulama:
1) Firebase CLI ile rules deploy:
   firebase deploy --only firestore:rules
2) Index deploy:
   firebase deploy --only firestore:indexes
3) Functions deploy (opsiyonel):
   cd functions
   npm i
   cd ..
   firebase deploy --only functions

## Yerel geliştirme ve yayınlama bilgisi
- Firebase Hosting önizlemesi için [Firebase CLI](https://firebase.google.com/docs/cli) gerekir. `firebase login` ve proje seçiminden sonra `firebase serve --only hosting --port 5000` komutu statik dosyaları `public/` klasöründen sunar.
- Üretim dağıtımı için `firebase deploy --only hosting` kullanın. Firestore kuralları, indeksler ve Cloud Functions için ilgili komutlar yukarıdaki adımlarla birlikte uygulanmalıdır.
- `public/js/firebase-config.js` içindeki `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` ve `appId` değerlerini kendi Firebase projenize ait ayarlarla güncelleyip senkron tutun. Ortamlar arası geçişte bu değerler `.env` değil bu statik dosya üzerinden yönetilir; dağıtım öncesi kontrol edin.
