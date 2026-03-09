# Gold GYS Content Model Standard (Faz 7 Baslangic)

Bu dokuman, icerik buyume fazinda (topic/lesson/question/exam/config/legal_pages/announcements/examAnnouncements) alan standardini ve sorgu disiplini kurallarini tanimlar.

## Ortak Zorunlu Alanlar

- `version`: sema versiyonu (integer)
- `status`: is kaydi durumu (`active`, `archived`, `deleted`)
- `visibility`: yayin gorunurlugu (`public`, `private`, `admin-only`)
- `createdAt`
- `updatedAt`

## Question Model (Minimum)

- `text`
- `options[]` (`id`, `text`)
- `correctOption`
- `topicId`
- `topicName`
- `difficulty`
- `type`
- ortak zorunlu alanlar

## Exam Model (Minimum)

- `title`
- `duration`
- `totalQuestions`
- `questionsSnapshot`
- `role`
- ortak zorunlu alanlar

## Config Public Model (Minimum)

- `system`
- `meta`
- ortak zorunlu alanlar

## Legal Page Model (Minimum)

- `title`
- `content`
- `updatedAt`
- `updatedBy`
- ortak zorunlu alanlar

## Announcement Model (Minimum)

- `title`
- `body`
- `level`
- `isActive`
- ortak zorunlu alanlar

## Exam Announcement Model (Minimum)

- `title`
- `examDate`
- `isActive`
- `applicationStart`
- `applicationEnd`
- ortak zorunlu alanlar

## Query ve Display Alan Ayrimi

- Query field: filtre/siralama/sayfalama icin kullanilan alanlar
  - `status`, `visibility`, `topicId`, `createdAt`, `updatedAt`, `difficulty`
- Display-only field: arayuzde gosterim icin tutulan, sorgu kontratina dahil olmayan alanlar
  - uzun aciklama metinleri, detayli cozum notlari, zengin medya alanlari

## Boyut Disiplini

- Tek dokumanda buyuk payload tutulmaz.
- Soft limit: 750 KB uzeri payload warning uretilir.
- Buyuk ve degisken icerikler alt-koleksiyon veya parcali modelde saklanir.

## Uygulama Notu

- `public/js/content-model.js` modulu:
  - question default alanlarini merkezilestirir
  - topic, lesson, exam, config/public, legal_pages, announcements ve examAnnouncements default alanlarini merkezilestirir
  - non-blocking payload validasyon warning'i uretir
  - davranis bozmayacak sekilde admin yazma akislarina entegre edilir
- `scripts/audit-content-model.cjs`:
  - admin yazma noktalarinda model helper kullanimi drift'ini tarar
  - varsayilan modda warning/rapor, `--strict` ile fail davranisi verir
- `scripts/test-content-model-contract.cjs`:
  - `content-model.js` export/default sozlesmesini denetler
  - zorunlu apply/validate fonksiyonlari ve default alanlari (version/status/visibility) korur
