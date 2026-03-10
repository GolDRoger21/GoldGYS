# User Shell V2 Rollout Checklist

## 1) Pre-deploy

- `npm run check:syntax`
- `npm run test:e2e:smoke:core`
- (Varsa auth state) `npm run test:e2e:smoke:auth`

## 2) Feature Flag

- Admin panel -> Ayarlar -> Özellik Yönetimi:
  - `Hızlı Sayfa Geçişleri (User Shell V2)` = `Açık`
- Acil kapatma için:
  - URL param: `?shellV2=0`
  - veya panelden toggle kapat

## 3) Production Smoke URLs

- Dashboard shell kökü:
  - `/dashboard`
- Hash route geçişleri:
  - `/dashboard#dashboard`
  - `/dashboard#konular`
  - `/dashboard#denemeler`
  - `/dashboard#yanlislarim`
  - `/dashboard#favoriler`
  - `/dashboard#analiz`
  - `/dashboard#profil`

## 4) Functional Verification

- Menü tıklamalarında full reload olmamalı.
- Tarayıcı `Geri/İleri` route değiştirmeli.
- Scroll restore:
  - `#konular` içinde aşağı in -> `#analiz` -> geri dön -> scroll korunmalı.
- Title güncellemesi:
  - route değişince sekme başlığı değişmeli.
- A11y focus:
  - route sonrası hedef element odak almalı.
- Rollback:
  - `/dashboard?shellV2=0` ile legacy davranışa dönmeli.

## 5) Telemetry Verification

- Dashboard kartı: `Geçiş Performansı`
  - `Sıcak Geçiş p95`, `İlk Geçiş p95`, `Genel p95` dolmalı.
- Analytics eventler:
  - `page_view` (hash route geçişlerinde tekil)
  - `user_shell_transition`
  - hata durumunda `user_shell_transition_error`

## 6) Stabilization Watch (İlk 24 Saat)

- Route error oranı artışı var mı?
- Beklenmeyen legacy redirect var mı?
- p95 warm geçiş trendi bozuluyor mu?
- Kullanıcı raporlarında "sayfa kendini yeniliyor" şikayeti sürüyor mu?
