# Auth ve Firestore Rules Manuel Test Akışı

Aşağıdaki adımlar, rol tabanlı korumaların ve Firestore kurallarının beklendiği gibi çalıştığını elle doğrulamak için hazırlandı.

## 1) Google ile ilk giriş
1. `firebase emulators:start --only auth,firestore,hosting` komutu ile lokal ortamı açın (veya staging/prod için gerçek projeye bağlanın).
2. Web uygulamasında Google ile oturum açın.
3. Firestore'da `users/{uid}` dokümanının oluştuğunu doğrulayın (emulator UI veya `firebase firestore:indexes` paneli üzerinden kontrol edilebilir).
4. Auth console'da veya `firebase auth:export` çıktısında custom claim olmadığını teyit edin; `getIdTokenResult()` dönen token'da `admin` ya da benzer bir rol anahtarı görünmemeli.

## 2) Admin panelinden rol ataması
1. Admin claim'i olan bir kullanıcıyla giriş yapın (gerekirse callable function ile claim atayın).
2. Admin panelindeki rol atama akışından yeni kullanıcıya rol verin.
3. İlgili kullanıcıda `await user.getIdToken(true)` çalıştırarak token'ı yenileyin ve custom claim'lerin güncellendiğini doğrulayın.
4. Admin sayfalarının açıldığını, editör/öğrenci sayfalarında rolüne uygun yönlendirme aldığınızı kontrol edin (örnek: admin harici kullanıcı admin dashboard'a alınmamalı, öğrenci rolü öğrencinin kendi paneline yönlenmeli).

## 3) Firestore kuralları
1. `firebase emulators:start --only firestore,auth` ile emülatörü açın.
2. Yetkisiz isteklerin reddedildiğini göstermek için `curl` veya Firestore emulator UI üzerinden oturum açmadan okuma/yazma deneyin (beklenen sonuç: `PERMISSION_DENIED`).
3. Yetkili fakat admin olmayan bir kullanıcıyla sadece izin verilen alanlara (ör. kendi `users/{uid}` alt koleksiyonlarına) yazabildiğini, admin gerektiren koleksiyonlara yazamadığını doğrulayın.
4. Admin claim'i olan kullanıcıyla içerik koleksiyonlarına (`topics`, `questions`, `exams` vb.) yazabildiğinizi test edin.
5. Kurallar beklendiği gibi çalışıyorsa üretime gönderin:
   ```bash
   firebase deploy --only firestore:rules
   ```

İsteğe bağlı olarak, `firebase emulators:exec` ile test komutlarını script haline getirerek tekrarlanabilir hale getirebilirsiniz.
