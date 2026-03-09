# Gold GYS Release Checklist

Bu dokuman, her kucuk surum oncesinde ayni kalite kapilarini standart sekilde kayda almak icin kullanilir.

## 1) Build ve Guardrail Sonuclari

- Tarih: 2026-03-09
- Commit: 3d1174a
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
  - Sonuc: `PASS`
  - Not: auto-fill (ok)

## 2) Asset Budget Ozet

- `npm run check:budgets` raporundan:
  - Global toplam gzip: 379.47/400.00 kB
  - Global JS gzip: 182.64/190.00 kB
  - Global CSS gzip: 47.11/52.00 kB
  - Global HTML gzip: 146.63/155.00 kB
  - En riskli 3 metrik (risk ranking):
    - 1. userHome:maxSingleAssetGzipKb (0.88 kB headroom)
    - 2. userHome:cssGzipKb (1.11 kB headroom)
    - 3. userHome:jsGzipKb (1.32 kB headroom)

## 3) Core Web Vitals (CWV) Kaydi

Olcum ortami:
- Cihaz profili: desktop
- Tarayici: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36
- Ag profili: simulate
- Olcum araci: Lighthouse JSON

### User Akislari

- `/index.html`
  - LCP: 1.53s
  - INP: N/A (lab interaction yok)
  - CLS: 0.033
- `/konular`
  - LCP: 1.46s
  - INP: N/A (lab interaction yok)
  - CLS: 0.071
- `/konu`
  - LCP: 1.89s
  - INP: N/A (lab interaction yok)
  - CLS: 0.071

### Admin Akisi

- `/admin/index.html`
  - LCP: 1.96s
  - INP: N/A (lab interaction yok)
  - CLS: 0.070

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

- Karar: `GO`
- Rollback notu: Yayin sonrasi izleme normal.
- Sorumlu:

## 7) Faz Gecis Durumu

- `Faz 3 -> Faz 4`:
  - Sonuc: `PASS`
  - Not: auto-fill (ci + strict model pass)
- `Faz 4 -> Faz 5`:
  - Sonuc: `PASS`
  - Not: auto-fill (budget pass + cwv mevcut)
- `Faz 6 -> Faz 7`:
  - Sonuc: `PASS`
  - Not: auto-fill (ci + model + rules + quality pass)
