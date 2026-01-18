# Gemini Prompt: Firestore Database Yapılandırması

Aşağıdaki prompt'u kopyalayıp Google Gemini'ye yapıştır:

---

## PROMPT:

Adalet Bakanlığı Görevde Yükselme Sınavı Hazırlık Platformu (GOLD GYS) için Firebase Firestore veritabanı kurulumuna yardım et. Platform bilgileri:

### Proje Özeti:
- **Platform**: Web tabanlı sınav hazırlık sistemi
- **Auth**: Google OAuth 2.0 (Firebase)
- **Veritabanı**: Firestore (boş durumda, baştan kurulması gerekiyor)
- **Admin Panel**: Var (sorular, konular, sınavlar yönetimi)
- **Öğrenci İşlemleri**: Test çözme, deneme sınavı, analiz, yanlış cevaplar, favoriler

### Gerekli Koleksiyonlar ve Veri Modeli:

#### 1. **topics** (Konular/Başlıklar)
Her konu Adalet Bakanlığı müfredatından (Anayasa, CMK, Resmi Yazışma vb.)

```json
{
  "id": "topic_001",
  "title": "Anayasa",
  "category": "ortak",  // "ortak" veya "alan"
  "order": 1,           // Sıralama
  "isActive": true,
  "description": "Türk Anayasası esasları"
}
```

#### 2. **lessons** (Dersler - Konu içi alt başlıklar)
Her konu için detaylı dersler

```json
{
  "id": "lesson_001",
  "topicId": "topic_001",
  "title": "Anayasanın Tarihi ve Türleri",
  "contentHTML": "<h2>İçerik HTML</h2><p>...</p>",
  "order": 1,
  "isActive": true
}
```

#### 3. **tests** (Testler - Konu bazlı mini testler)
Her konuya ait bağımsız testler

```json
{
  "id": "test_001",
  "topicId": "topic_001",
  "title": "Anayasa - Mini Test 1",
  "questionCount": 20,
  "duration": 30,       // dakika (optional)
  "isActive": true,
  "createdAt": "2025-01-15"
}
```

#### 4. **questions** (Sorular - Her test/sınav için)
Tüm sorular (testler ve sınavlar bundan referans alır)

```json
{
  "id": "question_001",
  "testId": "test_001",
  "text": "Türkiye'nin yönetim şekli nedir?",
  "options": [
    "A) Krallık",
    "B) Cumhuriyet",
    "C) İmparatorluk",
    "D) Seçki"
  ],
  "correct": 1,          // Index (0-3)
  "solution": {
    "dayanak": "Anayasa Madde 1: Türkiye Cumhuriyeti...",
    "analiz": "Bu soru temel yönetim şekli bilgisini ölçer",
    "tuzak": "Diğer şıklar tarihsel yönetim şekillerinden seçilmiştir",
    "hap": "Cumhuriyet = Halk egemenliği + Laik devlet"
  },
  "difficulty": "easy",  // easy | medium | hard
  "isActive": true
}
```

#### 5. **exams** (Deneme Sınavları - Full sınav simülasyonları)
80 sorunun tamamı (sınav simülasyonu)

```json
{
  "id": "exam_001",
  "title": "Deneme Sınavı - Ocak 2025",
  "duration": 80,        // dakika
  "totalQuestions": 80,
  "isActive": true,
  "createdAt": "2025-01-10",
  "examSessions": []     // Dolu tutma, referans olarak kal
}
```

#### 6. **users/{uid}** (Kullanıcı Ana Bilgileri)
Google Auth UID'sine göre

```json
{
  "uid": "google_uid_xxxxx",
  "email": "user@example.com",
  "displayName": "Ali Yılmaz",
  "role": "student",     // student | admin
  "status": "pending",   // pending | active | rejected
  "createdAt": "2025-01-15"
}
```

#### 7. **users/{uid}/progress** (Konu İlerleme Takibi)
Her konu için ilerleme

```json
{
  "topicId": "topic_001",
  "completedTests": 3,
  "attemptedQuestions": 45,
  "correctAnswers": 35,
  "scoreAvg": 77.8,
  "lastAccessedAt": "2025-01-20"
}
```

#### 8. **users/{uid}/wrongs** (Yanlış Cevap Geçmişi)
Kullanıcının yanlış yaptığı sorular

```json
{
  "questionId": "question_001",
  "testId": "test_001",
  "userAnswer": 0,       // Verilen cevap index
  "correctAnswer": 1,    // Doğru cevap index
  "attemptCount": 2,     // Kaç kere yapıldı
  "createdAt": "2025-01-15",
  "lastAttemptedAt": "2025-01-20"
}
```

#### 9. **users/{uid}/favorites** (Soru Favorileri)
Kullanıcının kaydettiği sorular

```json
{
  "questionId": "question_001",
  "testId": "test_001",
  "note": "Dayanağı önemli",  // Opsiyonel not
  "createdAt": "2025-01-15"
}
```

#### 10. **users/{uid}/examSessions** (Devam Eden Sınav Seansları)
Yarıda kalan deneme sınavları

```json
{
  "examId": "exam_001",
  "startedAt": "2025-01-20T14:30:00",
  "lastSavedAt": "2025-01-20T14:45:00",
  "answers": {
    "question_001": 1,
    "question_002": 2,
    "question_003": null  // Cevaplandırılmadı
  },
  "currentQuestion": 15,
  "status": "in_progress"  // in_progress | completed | abandoned
}
```

#### 11. **users/{uid}/examResults** (Sınav Sonuçları)
Tamamlanan sınavların sonuçları

```json
{
  "examId": "exam_001",
  "startedAt": "2025-01-20T14:30:00",
  "completedAt": "2025-01-20T15:50:00",
  "totalQuestions": 80,
  "correctAnswers": 62,
  "scorePercentage": 77.5,
  "answers": {
    "question_001": 1,
    "question_002": 2
  },
  "analysis": {
    "topicPerformance": {
      "topic_001": 80,
      "topic_002": 75
    },
    "difficultyCurve": {
      "easy": 95,
      "medium": 78,
      "hard": 62
    }
  }
}
```

#### 12. **reports** (Hata Bildirimi)
Öğrencilerin soru hatası bildirdiği raporlar

```json
{
  "id": "report_001",
  "questionId": "question_001",
  "userId": "google_uid_xxxxx",
  "message": "Soru metni yazım hatası içeriyor",
  "type": "error|typo|unclear",  // Hata tipi
  "status": "open",              // open | reviewed | resolved | rejected
  "createdAt": "2025-01-15",
  "reviewedAt": null,
  "adminNotes": ""
}
```

### Firestore Kuralları:
- Genel okuma: topics, lessons, tests, questions, exams herkese açık
- Yazma: Sadece admin
- Kullanıcı yazı: Sadece kendisinin UID'siyle
- Admin: Custom Claims'de admin=true

### İstenen Çıktı:

1. **JSON formatında örnek veriler** (her koleksiyon için 2-3 örnek)
2. **Firestore'a nasıl import edeceğim** adımları
3. **İlk setup data'sı** (Topics, Lessons, Tests)
4. **Admin panel için örnek sorular** (50-100 soru örnekleri)

Detaylı adımlarla açıkla, JSON çıktılarını kopyalayıp direkt kullanabileyim.

---

## Gemini'den Beklenen Cevap:

1. ✅ Her koleksiyon için tam JSON örnekleri
2. ✅ Firestore Console UI ile nasıl import edeceğini anlatan adımlar
3. ✅ Firebase Admin SDK ile batch import script'i (Node.js/Python)
4. ✅ Test için örnek sorular seti
5. ✅ Sonrasında ne yapılması gerektiğini açıklama
