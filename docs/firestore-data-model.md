# Firestore Veri Modeli

Bu doküman, projenin Cloud Firestore veritabanı yapısını, koleksiyonları ve doküman şemalarını açıklamaktadır. Bu dosya, `scripts/firestore_seed.json` dosyasındaki ana plana göre oluşturulmuştur ve onun insan tarafından okunabilir versiyonudur.

## Genel Bakış

Veritabanı, sınav hazırlık platformunun tüm verilerini yönetmek için bir dizi üst düzey koleksiyon kullanır. Her koleksiyonun yapısı aşağıda açıklanmıştır.

---

## Koleksiyonlar

### 1. `users`

Kullanıcıların kimlik doğrulama ve profil bilgilerini saklar.

**Doküman ID**: `uid` (Firebase Authentication kullanıcı kimliği)

| Alan Adı      | Veri Türü   | Açıklama                                                                          |
|---------------|-------------|-----------------------------------------------------------------------------------|
| `displayName` | `string`    | Kullanıcının herkese açık adı.                                                    |
| `email`       | `string`    | Kullanıcının e-posta adresi.                                                      |
| `photoURL`    | `string`    | Kullanıcının profil fotoğrafının URL'si.                                          |
| `role`        | `string`    | Kullanıcı rolü: `user`, `editor`, `admin`.                                        |
| `status`      | `string`    | Kullanıcı hesabı durumu: `pending`, `active`, `banned`.                           |
| `createdAt`   | `timestamp` | Kullanıcının kayıt olduğu zaman damgası.                                          |
| `lastLoginAt` | `timestamp` | Kullanıcının son giriş yaptığı zaman damgası.                                     |

---

### 2. `topics`

Sınav müfredatını oluşturan ana ve alt konuları hiyerarşik bir yapıda saklar.

**Doküman ID**: Anlamlı bir kimlik (örn: `topic_anayasa`)

| Alan Adı              | Veri Türü        | Açıklama                                                              |
|-----------------------|------------------|-----------------------------------------------------------------------|
| `id`                  | `string`         | Dokümanın kendi ID'si.                                                |
| `title`               | `string`         | Konunun başlığı.                                                      |
| `category`            | `string`         | Konunun ait olduğu kategori (örn: "ortak", "alan").                   |
| `order`               | `number`         | Konuların arayüzde sıralanması için kullanılan sayı.                  |
| `totalQuestionTarget` | `number`         | Bu konudan sınavda hedeflenen soru sayısı.                            |
| `subTopics`           | `array` (of maps) | Bu ana konuya bağlı alt konuların listesi.                            |
| `subTopics.id`        | `string`         | Alt konunun benzersiz kimliği.                                        |
| `subTopics.title`     | `string`         | Alt konunun başlığı.                                                  |
| `subTopics.description`| `string`         | Alt konu hakkında kısa açıklama.                                      |

---

### 3. `questions`

Soru bankasındaki tüm soruları ve detaylarını içerir.

**Doküman ID**: Rastgele oluşturulmuş ID.

| Alan Adı         | Veri Türü         | Açıklama                                                                |
|------------------|-------------------|-------------------------------------------------------------------------|
| `text`           | `string`          | Sorunun metni.                                                          |
| `topicId`        | `string`          | Sorunun ait olduğu ana konunun ID'si (`topics` koleksiyonuna referans). |
| `subTopicId`     | `string`          | Sorunun ait olduğu alt konunun ID'si.                                   |
| `options`        | `array` (of strings) | Sorunun cevap seçenekleri.                                              |
| `correctOption`  | `number`          | `options` dizisi içindeki doğru cevabın index numarası (0'dan başlar).   |
| `solution`       | `map`             | Sorunun çözümüyle ilgili detaylı bilgiler.                              |
| `createdBy`      | `string`          | Soruyu ekleyen kullanıcının `uid`'si.                                   |
| `createdAt`      | `timestamp`       | Sorunun oluşturulma zamanı.                                             |

---

### 4. `exams`

Kullanıcıların çözebileceği deneme sınavlarını tanımlar.

**Doküman ID**: Rastgele oluşturulmuş ID.

| Alan Adı        | Veri Türü          | Açıklama                                                            |
|-----------------|--------------------|---------------------------------------------------------------------|
| `title`         | `string`           | Sınavın başlığı.                                                    |
| `description`   | `string`           | Sınav hakkında kısa açıklama.                                       |
| `topicIds`      | `array` (of strings) | Sınavda yer alan konuların ID'leri.                                 |
| `questionCount` | `number`           | Sınavdaki toplam soru sayısı.                                       |
| `createdBy`     | `string`           | Sınavı oluşturan editörün veya adminin `uid`'si.                    |
| `createdAt`     | `timestamp`        | Sınavın oluşturulma zamanı.                                         |

---

### 5. `reports`

Kullanıcıların hatalı soruları bildirmeleri için kullanılır.

**Doküman ID**: Rastgele oluşturulmuş ID.

| Alan Adı      | Veri Türü   | Açıklama                                                  |
|---------------|-------------|-----------------------------------------------------------|
| `questionId`  | `string`    | Rapor edilen sorunun ID'si.                               |
| `userId`      | `string`    | Raporu gönderen kullanıcının `uid`'si.                    |
| `reason`      | `string`    | Kullanıcının bildirim nedeni açıklaması.                  |
| `status`      | `string`    | Raporun durumu: `open`, `resolved`.                       |
| `createdAt`   | `timestamp` | Raporun oluşturulma zamanı.                               |

---

### 6. `system`

Genel sistem ayarlarını tutar.

**Doküman ID**: Anlamlı bir kimlik (örn: `settings`)

| Alan Adı          | Veri Türü | Açıklama                          |
|-------------------|-----------|-----------------------------------|
| `maintenanceMode` | `boolean` | Site bakım modunda mı?            |
| `version`         | `string`  | Uygulamanın güncel sürüm numarası. |

---

### 7. `stats`

Sistemle ilgili genel istatistikleri barındırır. Bu veriler genellikle Cloud Functions ile güncellenir.

**Doküman ID**: Anlamlı bir kimlik (örn: `summary`)

| Alan Adı        | Veri Türü | Açıklama                    |
|-----------------|-----------|-----------------------------|
| `userCount`     | `number`  | Toplam kullanıcı sayısı.    |
| `questionCount` | `number`  | Toplam soru sayısı.         |
| `examCount`     | `number`  | Toplam deneme sınavı sayısı.|
