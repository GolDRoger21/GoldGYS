# Release Ops Admin Guide (Kodsuz)

Bu sistem admin paneline yeni bir ekran eklemeden, arka planda kalite kapisi olarak calisir.

## Bu sana ne kazandiriyor?

- Yayin oncesi otomatik kontrol: `GO / NO-GO`
- Firestore risklerini yakalama (rules/query/budget)
- Performans risklerini yakalama (CWV + headroom)
- Tek dosyada ozet: checklist + dashboard + json raporlar

## Admin panelde gorunuyor mu?

- Su an admin panel UI icinde gorunmuyor.
- GitHub Actions ve `docs/releases/` altindaki rapor dosyalarinda gorunuyor.

## Kod bilmeden nasil kullanirsin?

1. GitHub -> Actions -> `Release Readiness` workflowunu ac.
2. `Run workflow` butonuna bas.
3. Varsayilanlarla calistir:
   - `full_checks=true` (onerilir)
   - `enforce_decision=true`
   - headroom alanlari ister sabit kalsin ister `auto` gir.
4. Calisma bitince iki yere bak:
   - Workflow summary (GO/NO-GO)
   - Artifact dosyalari:
     - `release-checklist`
     - `release-status`
     - `release-history`
     - `release-dashboard`
     - `release-headroom-suggestion`

## Senin acindan minimum karar kurali

- Karar `GO` ise yayin ac.
- Karar `NO-GO` ise yayin acma; checklistte fail/pending satirini duzelt.

## Admin panelde ayrica gostermek gerekli mi?

- Zorunlu degil. Sistem zaten otomatik calisiyor.
- Sadece gorunurluk kolayligi icin, istersen sonradan admin panelde "Release Health" karti eklenebilir.
