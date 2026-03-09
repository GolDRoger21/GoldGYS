# E2E Smoke Tests

Bu dokuman, Gold GYS icin minimum smoke E2E kapsamini ve calistirma komutlarini tanimlar.

## Kapsam

- Public route ayakta mi kontrolu:
  - `/`
  - `/login.html`
  - `/yardim`
  - `/yasal`
- Public route browser akisi:
  - `/yardim`, `/yasal` anonim kullanicida login'e yonlenmeden acilmali
- Login ekrani temel giris noktasi:
  - `#googleLogin` gorunur
- Korumali route davranisi:
  - `/dashboard`, `/konular`, `/analiz`, `/profil`, `/yanlislarim`, `/favoriler`, `/denemeler`
  - `/admin/index.html`, `/admin/importer.html`
    anonim kullanicida login'e yonlenir
- Opsiyonel authenticated smoke (deterministic):
  - `E2E_AUTH_STORAGE_STATE` verilirse aktif edilir
  - Env verilmezse varsayilan dosya: `tests/e2e/.auth/user.json`
  - Akis: `/dashboard` -> `/konular` -> ilk konu -> ilk mod butonu -> `test-coz` sayfasi
  - Playwright `storageState` dosyasi ile calistigi icin Google popup akisina bagimli degildir
- Opsiyonel admin authenticated smoke (deterministic):
  - `E2E_ADMIN_AUTH_STORAGE_STATE` verilirse aktif edilir
  - Env verilmezse varsayilan dosya: `tests/e2e/.auth/admin.json`
  - Akis: `/admin` -> `/admin/importer`
  - Admin yetkisi olmayan storage state ile test login/guard yonlendirmesi nedeniyle basarisiz olur

## Komutlar

- Lokal smoke:
  - `npm run test:e2e:smoke`
- Lokal headed:
  - `npm run test:e2e:smoke:headed`

Not: Komutlar Hosting emulatoru acip Playwright testlerini onun icinde calistirir.

## Opsiyonel Auth Hazirligi

- Storage state dosyasi olusturup ortam degiskeni verin:
  - PowerShell: `$env:E2E_AUTH_STORAGE_STATE='tests/e2e/.auth/user.json'`
- Admin icin:
  - PowerShell: `$env:E2E_ADMIN_AUTH_STORAGE_STATE='tests/e2e/.auth/admin.json'`
- Dosya yoksa authenticated smoke testi otomatik skip edilir.
- `tests/e2e/.auth/` klasoru `.gitignore` altindadir (state dosyalari repoya girmez).

### Storage State Uretimi (Lokal)

- User state yakalama:
  - `npm run test:e2e:auth:capture:user`
- Admin state yakalama:
  - `npm run test:e2e:auth:capture:admin`

Komutlar hosting emulatoru acar, tarayiciyi headed modda baslatir.
Giris tamamlanip hedef sayfa acildiginda terminalde Enter'a basilir ve dosya kaydedilir.

## CI

- Manuel workflow:
  - `.github/workflows/e2e-smoke.yml`
- Workflow Playwright Chromium kurar ve smoke testini calistirir.
