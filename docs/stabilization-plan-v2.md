# Gold GYS Stabilization Plan v2

Bu dokuman, mevcut faz planinin web/Firebase gercekleriyle uyumlu revize halidir.

## Kritik Revizyonlar

1. Faz 1 gozlemlenebilirlik:
- Crashlytics (web) kullanilmiyor.
- Standart paket: Firebase Performance Monitoring (web) + Analytics event + custom JS error logging + Firestore read/write/listen sayaç loglari.

2. Faz 0 Rules standardi:
- Rol kontrolu `claims-first` yaklasimi ile uygulanir.
- Rules tarafinda `get()/exists()/getAfter()` sadece zorunlu ve minimum sayida kullanilir.

3. Faz 2 pagination contract:
- `offset(...)` yasak.
- Liste sorgularinda `limit(...)` zorunlu.
- Liste sorgularinda deterministic `orderBy(...)` zorunlu (uyumsuzlar warning ile takip edilir, asamali olarak hard-fail'e alinacak).
- Pagination icin cursor (`startAfter`) zorunludur.

4. Admin guard modeli:
- Hassas admin islemleri callable/functions tarafina tasinacak.
- Frontend tarafi sadece UI/flow guard olacak.
- Gercek yetki kontrolu Rules ve backend katmaninda kalacak.

5. Faz 4 performans butceleri:
- User ilk yukleme JS butcesi.
- Admin ilk yukleme JS butcesi.
- Kritik CSS butcesi.
- Route bazli chunk boyutu butcesi.

6. Faz 7 veri modeli disiplini:
- Dokuman boyutu sinirlari (tek dokumanda devasa payload yok).
- Query field ve display-only field ayrimi.
- `version`, `createdAt`, `updatedAt`, `status`, `visibility`, `order` alan standardi.

## Faz Durumu (2026-03-09)

- Faz 0-2: buyuk olcude islenmis durumda.
- Faz 3: mini kapanis seviyesinde.
- Faz 4/Faz 6: aktif ve olculebilir guardrail seviyesinde.

## Uygulanan Teknik Guardrail'ler

- `scripts/audit-firestore-queries.cjs`:
  - tum `public/js` taranir
  - `offset(...)` hard-fail
  - `getDocs(query(...))` icin `limit(...)` hard-fail
  - `orderBy(...)` eksikleri warning olarak raporlanir

- CI:
  - `check:syntax`
  - `ci:quick`
  - `ci:checks`
  - `.github/workflows/ci.yml` -> `npm run ci:checks`
  - `check:budgets` -> genel + route-bazli JS/CSS budget kontrolu

- `scripts/analyze-assets.cjs`:
  - global asset budget check (total/js/css/html + max single js)
  - budget kaynagi: `scripts/asset-budgets.json`
  - route budget check:
    - `userHome` (`/index.html`)
    - `adminDashboard` (`/admin/index.html`)
  - route bazinda toplam/js/css/max-single-asset esikleri

## Sonraki Operasyonel Adim

Faz 4 tamamlama:
1. Route budget esiklerini release gecmisine gore daralt.
2. CWV olcum raporunu release checklistine bagla.

## Ilerleme Notu (2026-03-09)

- Faz 3 (sadelestirme):
  - User cache key standardi tek modulde toplandi: `public/js/cache-keys.js`.
  - `dashboard.js`, `test-engine.js`, `analysis.js`, `profile-page.js`, `topic-service.js`, `user-profile.js`
    ortak key standardina gecirildi.
  - `dashboard.js` icindeki kullanilmayan `fetchExamStats` akisi temizlendi.
  - `test-engine.js` icinde cache invalidation cagrilari `scope` tabanli helper'a tasindi.

- Faz 6 (guardrail):
  - Firestore Rules emulator testi eklendi: `scripts/test-firestore-rules.cjs`.
  - Local ortamda net hata mesaji icin Java 21 on-kontrol wrapper'i eklendi: `scripts/run-rules-tests.cjs`.
  - CI tarafinda rules testi adimi Java 21 ile calisacak sekilde ayarlandi.
  - Playwright tabanli smoke E2E iskeleti eklendi:
    - `tests/e2e/smoke.spec.js`
    - `playwright.config.js`
    - manuel CI workflow: `.github/workflows/e2e-smoke.yml`
    - calistirma notu: `docs/e2e-smoke.md`
  - Deterministic authenticated smoke icin `E2E_AUTH_STORAGE_STATE` destekli opsiyonel akis eklendi
    (`dashboard -> konular -> konu -> test-coz`).
  - Deterministic admin smoke icin `E2E_ADMIN_AUTH_STORAGE_STATE` destekli opsiyonel akis eklendi
    (`/admin -> /admin/importer`).
  - Storage state uretimi icin lokal capture komutlari eklendi:
    - `npm run test:e2e:auth:capture:user`
    - `npm run test:e2e:auth:capture:admin`
  - CI workflow'u opsiyonel base64 secret'tan auth state hazirlayacak sekilde guncellendi
    (`E2E_AUTH_STORAGE_STATE_B64`, `E2E_ADMIN_AUTH_STORAGE_STATE_B64`).
  - Auth state base64 uretimi icin encode komutlari eklendi:
    - `npm run test:e2e:auth:encode:user`
    - `npm run test:e2e:auth:encode:admin`
  - Smoke test auth-state cozumlemesi Playwright format dogrulamasi (cookies/origins) ile sertlestirildi.

- Faz 4 (performans):
  - `scripts/analyze-assets.cjs` route-bazli ilk yukleme budget kontrolu eklendi.
  - User (`/index.html`) ve admin (`/admin/index.html`) akislari icin JS/CSS/total budget guardrail'i aktif.
  - `npm run check:budgets` ile CI seviyesinde fail/warn davranisi uygulanir.

- Faz 5 (tema/mobil sertlestirme):
  - Tema state/toggle akisi `public/js/theme-manager.js` uzerinde merkezilestirildi.
  - `public/js/ui-loader.js` ve `public/js/legal-page-shell.js` icindeki tekrar eden
    `localStorage + data-theme + icon` yonetimi kaldirildi.
  - Tema icon senkronu icin ortak helper eklendi: `syncThemeToggleIcon(...)`.
  - Mobil kirilim sertlestirme:
    - `public/pages/test.html`: dar ekranda score satiri icin yatay tasma korumasi ve 390px altinda ek sikistirma.
    - `public/pages/deneme.html`: mobil header alani sadeletildi (theme butonu gizleme, timer/istatistik sikistirma).
    - `public/css/landing.css`: mobil menu yuksekligi `dvh` ile stabil hale getirildi.
    - `public/js/ui-loader.js`: mobilde sidebar ve header dropdown cakismasi azaltildi
      (sidebar acilirken dropdown kapanisi, dropdown acilirken sidebar kapanisi, resize temizleme).
    - `public/css/layout.css`: mobilde `mobile-sidebar-active` durumunda body scroll kilidi
      ve dropdown max-height icin `dvh` yedegi eklendi.
    - `public/js/ui-loader.js`: `Escape` tusu ile acik gecici katmanlar (sidebar/dropdown) kapatilir.
    - `public/css/layout.css`: dropdown listelerinde dokunmatik kaydirma davranisi (`overscroll-behavior`, `-webkit-overflow-scrolling`) guclendirildi.
    - Header erisilebilirlik/hit-area sertlestirme:
      - `public/css/layout.css`: mobilde header action butonlari icin minimum dokunma alani (`44x44`) ve `touch-action` iyilestirmesi.
      - `public/pages/test.html` + `public/pages/deneme.html`: test/deneme action butonlarinda `focus-visible` gorunurlugu ve mobil hit-area iyilestirmesi.

- Faz 1 (gozlemlenebilirlik):
  - `dashboard.js` ve `analysis.js` icinde eksik kalan `getDocs` metrik etiketleri tamamlandi.

- Faz 2 (query contract):
  - `public/pages/konular.html` icindeki inline sorgularda eksik limitler eklendi:
    - `users/{uid}/topic_progress`: `orderBy(documentId()) + limit(500)`
    - `topics`: `orderBy("order", "asc") + limit(500)`
