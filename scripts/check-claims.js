import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const admin = require('firebase-admin');

const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function checkClaims(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log('UID:', user.uid);
    console.log('Email:', user.email);
    console.log('Custom Claims:', user.customClaims || {});

    const db = admin.firestore();
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      console.log('Firestore users doc data:', doc.data());
    } else {
      console.log('Firestore users doc: NOT FOUND');
    }
  } catch (err) {
    console.error('Hata:', err.message || err);
    process.exitCode = 2;
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Kullanım: node scripts/check-claims.js ercan21@gmail.com');
  process.exit(1);
}

checkClaims(email).then(() => process.exit(0));
