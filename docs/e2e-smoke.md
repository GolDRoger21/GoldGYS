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
    -> bir sik isaretleme -> `Testi Bitir` modal onayi -> sonuc modal gorunurlugu
  - Playwright `storageState` dosyasi ile calistigi icin Google popup akisina bagimli degildir
- Opsiyonel admin authenticated smoke (deterministic):
  - `E2E_ADMIN_AUTH_STORAGE_STATE` verilirse aktif edilir
  - Env verilmezse varsayilan dosya: `tests/e2e/.auth/admin.json`
  - Akis: `/admin` -> `/admin/importer` -> sidebar `users` tab gecisi
  - Admin yetkisi olmayan storage state ile test login/guard yonlendirmesi nedeniyle basarisiz olur

## Komutlar

- Lokal smoke:
  - `npm run test:e2e:smoke`
- Lokal core smoke (opsiyonel auth testleri disinda):
  - `npm run test:e2e:smoke:core`
- Lokal authenticated smoke extension (sadece opsiyonel auth testleri):
  - `npm run test:e2e:smoke:auth`
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

### CI Icin Opsiyonel Secret Tabanli Hazirlik

- GitHub Actions secret'lari opsiyonel olarak tanimlanabilir:
  - `E2E_AUTH_STORAGE_STATE_B64`
  - `E2E_ADMIN_AUTH_STORAGE_STATE_B64`
- Bu secret'lar verildiginde workflow `npm run test:e2e:auth:prepare` ile
  `tests/e2e/.auth/user.json` ve `tests/e2e/.auth/admin.json` dosyalarini olusturur.
- Secret yoksa hazirlik adimi no-op olur; authenticated testler skip calismaya devam eder.

#### Secret Icin Base64 Uretimi (Lokal)

- User:
  - `npm run test:e2e:auth:encode:user`
- Admin:
  - `npm run test:e2e:auth:encode:admin`

Komut ciktisini ilgili GitHub secret degerine oldugu gibi yapistirin.

## CI

- Manuel workflow:
  - `.github/workflows/e2e-smoke.yml`
- Workflow Playwright Chromium kurar ve smoke testini calistirir.
- Playwright reporter:
  - `line + html` aktif; CI artifact olarak `playwright-report` ve `test-results` yuklenir.
- Workflow calisma modeli:
  - `pull_request` ve `push` icin sadece `core smoke` kosulur.
  - `workflow_dispatch` icin `core smoke` + `authenticated smoke extension` kosulur.
