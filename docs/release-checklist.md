# Gold GYS Release Checklist

Bu dokuman, her kucuk surum oncesinde ayni kalite kapilarini standart sekilde kayda almak icin kullanilir.

Kullanim:
- Kodsuz yonetici ozeti: `docs/release-ops-admin-guide.md`
- Tum lokal release kapilarini tek komutta calistir: `npm run release:ready:local`
- Yeni checklist olustur: `npm run release:checklist`
- Lighthouse tabanli CWV olcumu al + snapshot uret: `npm run measure:cwv`
- Budget ozetini otomatik doldur: `npm run release:checklist:budget`
- CWV alanlarini `scripts/cwv-snapshot.json` dosyasindan doldur: `npm run release:checklist:cwv`
- Lighthouse JSON raporlarindan snapshot uret: `npm run release:checklist:cwv:build -- --user-index=... --user-konular=... --user-konu=... --admin-index=...`
- CWV snapshot base64 uret: `npm run release:checklist:cwv:encode > cwv_snapshot.b64`
- Guardrail sonuc alanlarini otomatik doldur: `npm run release:checklist:guardrails`
- Guardrail sonuc alanlarini rules dahil doldur: `npm run release:checklist:guardrails:full`
- Not: `test:rules` adimi Java 21 onkosulu eksiginde checklist'e `SKIP (env missing JDK21)` olarak yazilir.
- E2E + query/model kalite alanlarini otomatik doldur: `npm run release:checklist:quality`
- E2E core dahil kalite alanlarini doldur: `npm run release:checklist:quality:e2e`
- Faz gecis durumunu otomatik doldur: `npm run release:checklist:phase-gates`
- GO/NO-GO kararini otomatik guncelle: `npm run release:checklist:decision`
- Makine-okunur durum json'u uret: `npm run release:status:export`
- Release gecmis trend json'u guncelle: `npm run release:history:update`
- Adaptif headroom esitigi onerisi uret: `npm run release:headroom:suggest`
- Adaptif/eslesmis headroom esiklerini cozumle: `npm run release:headroom:resolve`
- Global budget headroom gate kontrolu: `npm run release:headroom:check`
- Adaptif oneriyi dogrudan uygula: `npm run release:headroom:check:auto`
- Tumunu tek komutta yenile: `npm run release:checklist:refresh`
- Tumunu rules+e2e dahil tek komutta yenile: `npm run release:checklist:refresh:full`
- CI manuel akisi: GitHub Actions -> `Release Readiness` workflow'u (`full_checks=false|true`, opsiyonel `cwv_snapshot_b64`, `min_global_headroom_kb`, `min_risk_headroom_kb`)
- `min_global_headroom_kb` ve `min_risk_headroom_kb` alanlarina `auto` verilirse, `release-headroom-suggestion.json` degerleri kullanilir.
- CI manuel akisi varsayilan olarak `enforce_decision=true` ile calisir; `NO-GO` kararda job fail olur.
- Cikti yolu: `docs/releases/release-checklist-YYYY-MM-DD.md`
- Ayni gun dosyasini yeniden uretmek icin: `node scripts/create-release-checklist.cjs --force`
- Snapshot ornegi: `scripts/cwv-snapshot.example.json` (kopyalayip `scripts/cwv-snapshot.json` olarak kullanin)

## 1) Build ve Guardrail Sonuclari

- Tarih:
- Commit:
- Surum etiketi:

- `npm run ci:checks`:
  - Sonuc: `PASS/FAIL`
  - Not:
- `npm run audit:content-model:strict`:
  - Sonuc: `PASS/FAIL`
  - Not:
- `npm run test:content-model:contract`:
  - Sonuc: `PASS/FAIL`
  - Not:
- `npm run test:rules`:
  - Sonuc: `PASS/FAIL`
  - Not:

## 2) Asset Budget Ozet

- `npm run check:budgets` raporundan:
  - Global toplam gzip:
  - Global JS gzip:
  - Global CSS gzip:
  - Global HTML gzip:
  - En riskli 3 metrik (risk ranking):
    - 1.
    - 2.
    - 3.

## 3) Core Web Vitals (CWV) Kaydi

Olcum ortami:
- Cihaz profili:
- Tarayici:
- Ag profili:
- Olcum araci: Chrome Lighthouse / PageSpeed / RUM

### User Akislari

- `/index.html`
  - LCP:
  - INP:
  - CLS:
- `/konular`
  - LCP:
  - INP:
  - CLS:
- `/konu`
  - LCP:
  - INP:
  - CLS:

### Admin Akisi

- `/admin/index.html`
  - LCP:
  - INP:
  - CLS:

Not:
- Lighthouse lab olcumunde kullanici etkilesimi yoksa INP alani `N/A (lab interaction yok)` olarak yazilabilir.

## 4) E2E / Kritik Akis Kontrolu

- `npm run test:e2e:smoke:core`:
  - Sonuc: `PASS/FAIL`
  - Not:
- Opsiyonel auth smoke:
  - Sonuc: `PASS/FAIL/SKIP`
  - Not:

## 5) Firestore ve Veri Modeli Kontrolu

- Query audit:
  - Sonuc: `PASS/FAIL`
  - Kritik not:
- Content model drift audit:
  - Sonuc: `PASS/FAIL`
  - Kritik not:
- Rules degisiklikleri (varsa):
  - Ozet:

## 6) Release Karari

- Karar: `GO / NO-GO`
- Rollback notu:
- Sorumlu:

## 7) Faz Gecis Durumu

- `Faz 3 -> Faz 4`:
  - Sonuc: `PASS/FAIL/PENDING`
  - Not:
- `Faz 4 -> Faz 5`:
  - Sonuc: `PASS/FAIL/PENDING`
  - Not:
- `Faz 6 -> Faz 7`:
  - Sonuc: `PASS/FAIL/PENDING`
  - Not:
