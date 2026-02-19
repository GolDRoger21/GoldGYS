# Firebase Storage CORS ayarı (admin logo/favicon yükleme)

`/admin#settings` ekranındaki logo, favicon ve OG görsel yüklemeleri tarayıcıdan doğrudan Firebase Storage'a gider. Bu nedenle bucket tarafında CORS yapılandırması yoksa istekler `preflight` aşamasında engellenir.

## Belirti

Tarayıcı konsolunda aşağıdaki hataya benzer kayıtlar görünür:

- `blocked by CORS policy`
- `Response to preflight request doesn't pass access control check`
- `POST https://firebasestorage.googleapis.com/... net::ERR_FAILED`

## Çözüm

1. Aşağıdaki CORS dosyasını oluşturun (örnek: `cors.json`):

```json
[
  {
    "origin": ["https://goldgys.web.app", "http://localhost:5000", "http://127.0.0.1:5000"],
    "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "responseHeader": ["Content-Type", "Authorization", "x-goog-resumable", "x-goog-meta-*", "x-firebase-gmpid", "x-firebase-appcheck"],
    "maxAgeSeconds": 3600
  }
]
```

2. Bucket'e uygulayın:

```bash
gsutil cors set cors.json gs://goldgys.appspot.com
```

3. Kontrol edin:

```bash
gsutil cors get gs://goldgys.appspot.com
```

4. Değişiklik sonrası admin sayfasını tam yenileyin (hard refresh).

> Not: CORS düzeltildikten sonra mevcut istemci kodu ile yükleme sorunsuz çalışır.
