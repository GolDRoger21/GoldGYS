Import README

1) Gereksinimler
   - Node.js 18+ (tercihen)
   - Firebase service account JSON (Firebase Console > Project Settings > Service accounts > Generate new private key)

2) Hazırlık
   - Service account JSON dosyasını güvenli bir yere kaydedin, örn: C:\Users\<you>\gcloud\service-account.json
   - PowerShell için örnek: 

     $env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\Users\<you>\gcloud\service-account.json'

   - Linux/macOS için örnek:

     export GOOGLE_APPLICATION_CREDENTIALS="/home/<you>/gcloud/service-account.json"

3) Import işlemi
   - Terminal açın ve `scripts` klasörüne gidin:

```bash
cd scripts
npm install
npm run import
```

   - Script `scripts/firestore_seed.json` dosyasını okuyup Firestore'a yazacaktır.

4) Notlar ve Güvenlik
   - Service account anahtarını kimseyle paylaşmayın.
   - Üretim veritabanına yazmadan önce küçük bir test projesinde deneyin.
   - Büyük dataset'ler için script'i batch'lere bölüp rate limit'e dikkat edin.

5) Ne yapmalıysanız çalışmazsa?
   - Firestore'un proje içinde etkin olduğundan emin olun (Console > Firestore > Create Database)
   - `GOOGLE_APPLICATION_CREDENTIALS` doğru gösteriyor mu kontrol edin
   - Firestore Rules izinleri: kullanıcı doc yazma işlemi Admin SDK ile yapıldığında rules by-pass edilir (Admin SDK service account ile çalışır)
