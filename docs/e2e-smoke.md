# E2E Smoke Tests

Bu dokuman, Gold GYS icin minimum smoke E2E kapsamini ve calistirma komutlarini tanimlar.

## Kapsam

- Public route ayakta mi kontrolu:
  - `/`
  - `/login.html`
  - `/yardim`
  - `/yasal`
- Login ekrani temel giris noktasi:
  - `#googleLogin` gorunur
- Korumali route davranisi:
  - `/dashboard`, `/konular`, `/analiz`, `/profil`, `/yanlislarim`, `/favoriler`, `/denemeler`
    anonim kullanicida login'e yonlenir
- Opsiyonel auth smoke placeholder:
  - `E2E_AUTH_EMAIL` ve `E2E_AUTH_PASSWORD` verilirse aktif edilir
  - Google auth akisi deterministic olmadigi icin su an TODO durumda

## Komutlar

- Lokal smoke:
  - `npm run test:e2e:smoke`
- Lokal headed:
  - `npm run test:e2e:smoke:headed`

Not: Komutlar Hosting emulatoru acip Playwright testlerini onun icinde calistirir.

## CI

- Manuel workflow:
  - `.github/workflows/e2e-smoke.yml`
- Workflow Playwright Chromium kurar ve smoke testini calistirir.
