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

## Faz Durumu (2026-03-08)

- Faz 0-2: buyuk olcude islenmis durumda.
- Faz 3: mini kapanis seviyesinde.
- Faz 4/Faz 6: temel CI ve guardrail altyapisi basladi.

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

## Sonraki Operasyonel Adim

Faz 4 tamamlama:
1. Performans butcelerini kodda tek configte tanimla.
2. Build raporunu butce karsilastirmasi ile fail/warn uretecek hale getir.
3. CWV olcum raporunu release checklistine bagla.
