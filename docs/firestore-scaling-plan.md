# Firestore Ölçeklendirme Planı (Soru/Deneme Çözme)

## 1) Mevcut Durum Analizi
- **Soru çözme akışı:** `test.html` → `TestEngine` ile sorular çekiliyor, yanlışlar özetlenip `wrong_summaries/{YYYY-MM-DD}` altında toplu yazılıyor; deneme sonuçları `exam_results` alt koleksiyonuna ekleniyor.【F:public/pages/test.html†L630-L1068】【F:public/js/test-engine.js†L20-L667】
- **Konu paketleri:** `topic_packs` üzerinden paketli soru okuması ve IndexedDB cache kullanımı mevcut; bu da tekrar okuma maliyetini düşürüyor.【F:public/js/topic-service.js†L1-L239】【F:public/js/cache-manager.js†L1-L210】
- **Denemeler:** `exams/{examId}` içinde `questionsSnapshot` tutulduğu için tek doküman okuma ile sınav başlatılabiliyor (okuma maliyeti düşük, eşzamanlı kullanımda stabil).【F:public/pages/deneme.html†L260-L323】

## 2) Kotalar ve Tipik Darboğazlar (Özet)
> Firestore limitleri zaman içinde değişebilir; kesin değerler için Firebase Console ve resmi dokümantasyon takip edilmelidir.
- **Belge boyutu:** 1 MiB sınırı (tek dokümanda çok fazla cevap/ID biriktirmek büyümeyi sınırlayabilir).
- **Tek doküman yazma hızı:** Aynı dokümana yüksek frekanslı yazma (hotspot) ölçeklenmeyi bozar.
- **Batch limitleri:** 500 write/batch ve `where(documentId(), "in", ...)` sorgusunda 10 ID limiti.
- **Yanlış/istatistik sayaçları:** Tek dokümana tüm kullanıcılar yazarsa saniyelik limitlere takılma riski oluşur.

## 3) Bu Güncellemede Uygulanan İyileştirmeler
1. **Yanlışlar için toplu yazım + cache okuma modeli**
   - Yanlışlar artık gün bazlı `wrong_summaries` içinde toplu olarak tutuluyor ve arayüz bu özetlerden okuyarak soru dokümanı okumalarını azaltıyor.【F:public/js/test-engine.js†L605-L667】【F:public/pages/yanlislarim.html†L276-L650】
   - `WrongSummaryService` ile özetler IndexedDB üzerinde cache’leniyor ve tekrar ziyaretlerde Firestore okuma sayısı düşüyor.【F:public/js/wrong-summary-service.js†L1-L88】
2. **Soru dokümanı okuma cache’i**
   - `fetchQuestionsByIds` fonksiyonu artık önce IndexedDB cache’ine bakıyor, sadece eksikleri Firestore’dan çekiyor.【F:public/pages/test.html†L1066-L1110】【F:public/js/cache-manager.js†L100-L148】
3. **Günlük kullanıcı sayaçlarında sharded counter**
   - Tek dokümana yazmak yerine shard dokümanlara yazılıyor; eşzamanlı kayıt sırasında hotspot riski düşüyor.【F:functions/index.js†L873-L900】

## 4) Önerilen İleri Adımlar (İhtiyaca Göre)
1. **Konu ilerleme verisini parçalara bölme**
   - `topic_progress` tek dokümanda büyümeye devam ederse soru ID’leri chunk’lanarak `progress_chunks` benzeri alt koleksiyonlara bölünmeli.
2. **Yanlış özetlerinin periyodik arşivlenmesi**
   - 12+ ay geriye giden `wrong_summaries` kayıtları “soğuk arşive” taşınarak aktif okuma yükü azaltılabilir.
3. **Deneme sonuçları için TTL/aylık arşiv**
   - Çok sık deneme çözen kullanıcılar için eski sonuçlar arşivlenerek `exam_results` hacmi yönetilebilir.
4. **Okuma yoğun ekranlarda agresif cache süresi**
   - Sık görüntülenen ekranlarda (favoriler, yanlışlar, konu testleri) cache TTL süreleri artırılabilir.
