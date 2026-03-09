# Gold GYS Release Checklist

Bu dokuman, her kucuk surum oncesinde ayni kalite kapilarini standart sekilde kayda almak icin kullanilir.

## 1) Build ve Guardrail Sonuclari

- Tarih: 2026-03-09
- Commit: 963089d
- Surum etiketi: v1.0.0

- `npm run ci:checks`:
  - Sonuc: `PASS`
  - Not: auto-fill (ok)
- `npm run audit:content-model:strict`:
  - Sonuc: `PASS`
  - Not: auto-fill (ok)
- `npm run test:content-model:contract`:
  - Sonuc: `PASS`
  - Not: auto-fill (ok)
- `npm run test:rules`:
  - Sonuc: `FAIL`
  - Not: auto-fill (exit 1, [rules-test] Java 8 tespit edildi. Firestore Emulator için JDK 21+ gerekli.)

## 2) Asset Budget Ozet

- `npm run check:budgets` raporundan:
  - Global toplam gzip: 378.42/400.00 kB
  - Global JS gzip: 181.76/190.00 kB
  - Global CSS gzip: 47.11/52.00 kB
  - Global HTML gzip: 146.46/155.00 kB
  - En riskli 3 metrik (risk ranking):
    - 1. userHome:maxSingleAssetGzipKb (0.88 kB headroom)
    - 2. userHome:cssGzipKb (1.11 kB headroom)
    - 3. userHome:jsGzipKb (1.32 kB headroom)

## 3) Core Web Vitals (CWV) Kaydi

Olcum ortami:
- Cihaz profili: PENDING
- Tarayici: PENDING
- Ag profili: PENDING
- Olcum araci: PENDING

### User Akislari

- `/index.html`
  - LCP: PENDING
  - INP: PENDING
  - CLS: PENDING
- `/konular`
  - LCP: PENDING
  - INP: PENDING
  - CLS: PENDING
- `/konu`
  - LCP: PENDING
  - INP: PENDING
  - CLS: PENDING

### Admin Akisi

- `/admin/index.html`
  - LCP: PENDING
  - INP: PENDING
  - CLS: PENDING

## 4) E2E / Kritik Akis Kontrolu

- `npm run test:e2e:smoke:core`:
  - Sonuc: `PASS`
  - Not: auto-fill (ok)
- Opsiyonel auth smoke:
  - Sonuc: `PASS/FAIL/SKIP`
  - Not:

## 5) Firestore ve Veri Modeli Kontrolu

- Query audit:
  - Sonuc: `PASS`
  - Kritik not: auto-fill (ok)
- Content model drift audit:
  - Sonuc: `PASS`
  - Kritik not: auto-fill (ok)
- Rules degisiklikleri (varsa):
  - Ozet:

## 6) Release Karari

- Karar: `NO-GO`
- Rollback notu: Guardrail fail nedeniyle mevcut surume geri don.
- Sorumlu:

## 7) Faz Gecis Durumu

- `Faz 3 -> Faz 4`:
  - Sonuc: `PASS`
  - Not: auto-fill (ci + strict model pass)
- `Faz 4 -> Faz 5`:
  - Sonuc: `PENDING`
  - Not: auto-fill (budget pass, cwv pending)
- `Faz 6 -> Faz 7`:
  - Sonuc: `FAIL`
  - Not: auto-fill (ci/model/quality gate fail)
