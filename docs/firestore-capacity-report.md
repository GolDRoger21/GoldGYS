# GoldGYS Firestore Kapasite ve Maliyet Raporu

## Kapsam
Bu rapor, projedeki mevcut Firestore erişim modeline göre şu senaryoyu simüle eder:

- **Günlük aktif öğrenci (DAU):** 5.000
- **Öğrenci başına günlük çözülen soru:** 1.000
- **Aylık dönem:** 30 gün
- **Toplam soru çözümü:** **150.000.000 soru/ay**

Analiz kod akışına göre yapılmıştır; özellikle soru çekme, sonuç kaydetme ve yanlış özetleme akışları baz alınmıştır.

## Koddan çıkarılan operasyon modeli

1. **Soru okuma maliyeti (read):**
   - `fetchQuestionsByIds` önce IndexedDB cache'ine bakıyor, cache miss olan soruları Firestore'dan çekiyor.
   - Bu nedenle maliyeti belirleyen ana parametre cache miss oranı.

2. **Test bitirme yazımları (write) - seans başına yaklaşık:**
   - `exam_results` alt koleksiyonuna **1 write**.
   - `topic_progress` için `syncProgress` içinde **1 read + 1 write**.
   - `completed_tests` işaretleme (uygun testId varsa) **1 write**.
   - `wrong_summaries` toplu flush ile pratikte ortalama **1 write/seans** (toplu).

3. **Seans varsayımı:**
   - `test.html` akışında tipik test boyu 20 soru olduğundan,
   - 1.000 soru/gün için kullanıcı başına yaklaşık **50 test seansı/gün**.

Bu modelde bir seans için ortalama baz alınan operasyon:
- **Read:** 2 (favori/index + syncProgress getDoc benzeri)
- **Write:** 4 (exam result + progress + completed test + wrong summary)

## Hesaplama varsayımları (Firestore Blaze)

Bu raporda aşağıdaki birim fiyatlarla hesap yapılmıştır (standart Firestore operasyon fiyatlandırması varsayımı):

- **Read:** $0.06 / 100.000
- **Write:** $0.18 / 100.000
- **Delete:** $0.02 / 100.000 (simülasyonda ihmal edilebilir)
- **Storage:** $0.18 / GB-ay (yaklaşık varsayım)

> Not: Bölgeye (regional/multi-region) ve güncel Google fiyatlandırmasına göre küçük farklar olabilir.

## Trafik simülasyonu

Temel büyüklükler:

- Toplam soru: **150.000.000/ay**
- Toplam seans: **7.500.000/ay** (5.000 × 50 × 30)
- Seans kaynaklı okuma: **15.000.000 read/ay** (7.5M × 2)
- Seans kaynaklı yazma: **30.000.000 write/ay** (7.5M × 4)

### Senaryo tablosu (cache miss oranına göre)

| Senaryo | Cache miss | Soru kaynaklı read/ay | Toplam read/ay | Toplam write/ay | Read maliyet | Write maliyet | Toplam |
|---|---:|---:|---:|---:|---:|---:|---:|
| İyi optimize | %10 | 15.0M | 30.0M | 30.0M | $18 | $54 | **$72/ay** |
| Dengeli (muhtemel) | %30 | 45.0M | 60.0M | 30.0M | $36 | $54 | **$90/ay** |
| Zayıf cache | %60 | 90.0M | 105.0M | 30.0M | $63 | $54 | **$117/ay** |
| Cache yok / en kötü | %100 | 150.0M | 165.0M | 30.0M | $99 | $54 | **$153/ay** |

## Sonuç: 5.000 DAU kaldırır mı?

Kısa cevap: **Evet, Firestore tarafı bu yükü kaldırır; fakat mutlaka Blaze plan gerekir.**

- Spark free quota (50k read/gün, 20k write/gün) bu senaryoda çok erken aşılır.
- Blaze aktif olduğunda bu yükte aylık Firestore operasyon maliyeti, cache performansına bağlı olarak yaklaşık:
  - **$72 – $153/ay** bandında,
  - pratikte iyi optimizasyonla **~$90/ay civarı** beklenir.

## Kapasite riski ve dar boğaz yorumu

1. **Operasyon hızları (ortalama):**
   - 60M read/ay ≈ 23 read/sn ortalama
   - 30M write/ay ≈ 12 write/sn ortalama
   - Bu ortalama hızlar Firestore için düşük/orta seviyededir.

2. **Pik saat çarpanı (ör. x10):**
   - 200–300 read/sn ve 100+ write/sn bandı yine yönetilebilir.

3. **Gerçek risk:**
   - Maliyetten çok, belge büyümesi ve sorgu stratejisi.
   - Özellikle `exam_results` doküman sayısı hızla büyür (milyonlar/ay).

## Storage etkisi (yaklaşık)

- `exam_results` + `topic_progress` + indeksler ile aylık veri büyümesi birkaç GB ile onlarca GB arasında olabilir.
- 10 GB aktif veri varsayımında storage maliyeti yaklaşık **$1.8/ay**.
- 50 GB aktif veri varsayımında storage maliyeti yaklaşık **$9/ay**.

Yani bu senaryoda ana maliyet kalemi tipik olarak **read/write operasyonlarıdır**, storage ikincildir.

## Optimizasyon doğrulaması

Kodda yaptığınız optimizasyonlar maliyet açısından doğru yönde:

- Soru okumada cache-first yaklaşım (`fetchQuestionsByIds` + `CacheManager`) read maliyetini direkt düşürüyor.
- Yanlışları `wrong_summaries` altında toplu yazmak write sayısını düşürüyor.
- Test bitiminde toplu/senkron kayıt, soru başına yazımı engelliyor.

## Önerilen takip metrikleri (prod için)

1. Console’da günlük şu metrikleri izleyin:
   - Document reads/day
   - Document writes/day
   - Storage size
2. Uygulamaya iki oran ekleyin:
   - **cache hit ratio (question cache)**
   - **session başına write sayısı**
3. Alarm eşikleri:
   - Read > 4M/gün
   - Write > 1.2M/gün
   - Bunlar aşıldığında cache TTL ve soru paketleme gözden geçirilsin.

## Yönetici özeti

- **5.000 DAU × 1.000 soru/gün** senaryosu Firestore açısından teknik olarak uygulanabilir.
- Blaze plan aktif olduğu sürece aylık Firestore maliyeti, mevcut mimariyle yaklaşık **$72–$153** aralığında; gerçekçi beklenti **~$90/ay**.
- En kritik değişken: **cache miss oranı**. Bu oran ne kadar düşükse maliyet o kadar düşer.

## Uygulanan maliyet optimizasyonları (bu PR)

Aşağıdaki optimizasyonlar kodda aktif hale getirildi:

1. **Gereksiz favori index okuması kaldırıldı**
   - Test ekranı açılışında `users/{uid}/favorites/_index` dokümanı okunuyordu; bu veri UI tarafından kullanılmadığı için okuma kaldırıldı.
2. **Practice sonuçlarının kalıcı `exam_results` yazımı varsayılan olarak kapatıldı**
   - `TestEngine` artık practice modunda varsayılan olarak `exam_results` yazmıyor (`persistPracticeResults: false`).
   - İstenirse ayardan tekrar açılabilir.
3. **Favori işlemleri test bitimine kadar toplulaştırıldı**
   - Test sırasında favori ekle/çıkar sadece local state üzerinde tutuluyor.
   - `Testi Bitir` adımında (ve sayfa kapanışında) favori değişiklikleri toplu flush ile Firestore'a işleniyor.

### Bu optimizasyonların maliyete etkisi

- Önceki modelde seans başına write varsayımı: **4 write**
- Yeni modelde (practice odaklı kullanımda): **3 write**

`5.000 DAU × 1.000 soru/gün` senaryosunda, tüm seanslar practice kabul edilirse:

- Write: **30.0M/ay → 22.5M/ay**
- Write maliyeti: **$54/ay → $40.5/ay**
- Toplam maliyet (cache miss %30 örneği): **$90/ay → $76.5/ay**

> Not: Bu kazanç, kullanımın practice yoğunluğuna bağlıdır. Exam modu kullanım oranı arttıkça tasarruf azalır.


## Önbellek sistemi analizi (analiz / favoriler / yanlışlarım / denemeler)

Bu sayfalar özelinde cache kullanımı ve iyileştirmeler:

- **/analiz**
  - `exam_results`, `topic_progress` ve kullanıcı profili için cache TTL **30 dk** yapıldı.
  - Böylece aynı kullanıcı kısa aralıklarla analiz ekranına girince Firestore tekrar okumaları azalır.
- **/favoriler**
  - Sayfada favoriler zaten IndexedDB üzerinden cache-first çalışıyor; test içindeki favori değişiklikleri artık toplu işlendiği için favoriler cache'i toplu flush sonrası invalidate ediliyor.
- **/yanlislarim**
  - `wrong_summaries` özet cache TTL'i **1 saatten 6 saate** çıkarıldı.
  - Test bitiminde optimistic cache update mevcut olduğundan kullanıcı günceli görmeye devam eder.
- **/denemeler**
  - Global aktif deneme listesi zaten 24 saat cache'leniyor; bu yapı korundu.

### Cache invalidation maliyeti için kritik not

`CacheManager` içinde çalışan `cacheBuster` mekanizması çok sık sunucu okuması yapıyordu. Bu PR ile:

- Senkron aralığı **1 dakika → 6 saat** yükseltildi.
- `getDocFromServer` yerine `getDoc` kullanıldı.
- Cache **okuma** yollarından (`getData`, `getQuestion`, `getPack`, vb.) zorunlu buster sync kaldırıldı.

Bu sayede özellikle yüksek etkileşimli sayfalarda arka plandaki gizli Firestore read trafiği ciddi şekilde azalır.
