# Firestore Veri Modeli (Güncel)

## 1. Kullanıcılar ve Yetki
### `users/{uid}`
- `uid`: string
- `email`: string
- `displayName`: string
- `photoURL`: string
- `role`: "student" | "editor" | "admin"
- `status`: "pending" | "active" | "rejected" | "suspended"
- `createdAt`: timestamp
- `lastLoginAt`: timestamp
- **Alt Koleksiyonlar:**
  - `progress`: { topicId, completedTests, scoreAvg }
  - `wrongs`: { questionId, count, lastAttempt }
  - `favorites`: { questionId, addedAt }
  - `exam_results`: { examId, score, correct, wrong, date }

## 2. İçerik Yönetimi
### `topics/{topicId}`
- `title`: string
- `category`: "ortak" | "alan"
- `order`: number
- `isActive`: boolean
- `description`: string
- `parentId`: string | null (opsiyonel, alt konu ilişkisi için)
- **Alt Koleksiyon:** `lessons/{lessonId}`
  - `title`: string
  - `contentHTML`: string (veya materials array)
  - `order`: number
  - `isActive`: boolean

### `questions/{questionId}`
- `text`: string
- `options`: array [{id: "A", text: "..."}]
- `correctOption`: "A" | "B" ...
- `category`: string (Konu adı)
- `difficulty`: number (1-5)
- `solution`: { analiz, dayanak, hap, tuzak }
- `legislationRef`: { code, article } (Kanun maddesi)
- `isActive`: boolean
- `isFlaggedForReview`: boolean

### `exams/{examId}`
- `title`: string
- `duration`: number (dakika)
- `totalQuestions`: number
- `questionsSnapshot`: array (Soruların kopyası)
- `isActive`: boolean
- `createdAt`: timestamp

## 3. Sistem ve Loglar
### `reports/{reportId}`
- `userId`: string
- `questionId`: string
- `description`: string
- `status`: "pending" | "resolved"
- `type`: "error" | "suggestion"

### `stats/daily_users`
- `YYYY-MM-DD`: number (Günlük kayıt sayısı)
