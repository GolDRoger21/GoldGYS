# Mimari Özet (Stage 0)

## Hedef
- Firebase Hosting (statik yayın)
- Firebase Authentication (yetkilendirme)
- Firestore (içerik + kullanıcı verisi)
- Admin panel (içerik yönetimi)
- Binlerce soru / çok sayıda test / deneme

## Temel İlke: Content-driven Portal
- Konu (Topic) merkezli HUB: Notlar + Testler + Videolar + Podcast
- Test ve Deneme motoru ayrı (engine), UI şablonları ayrı (templates)
- Kullanıcı verisi (progress, wrongs, favorites) tamamen kullanıcı alt koleksiyonlarında

## Güvenlik İlkesi
- Frontend guard: UX amaçlı (asıl güvenlik değil)
- Firestore Rules: asıl kilit
- Admin rolü custom claims ile