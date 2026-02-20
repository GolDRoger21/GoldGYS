import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const storage = getStorage();

const candidates = [
    'goldgys.appspot.com',
    'goldgys',
    'goldgys.firebasestorage.app',
    'staging.goldgys.appspot.com',
    'goldgys-storage'
];

async function probe() {
    console.log('PROBE_START');
    for (const name of candidates) {
        console.log(`CHECKING: ${name}`);
        try {
            const bucket = storage.bucket(name);
            await bucket.getMetadata();
            console.log(`FOUND: ${name}`);
            break;
        } catch (e) {
            console.log(`FAIL: ${name} - ${e.code || e.message}`);
        }
    }
    console.log('PROBE_END');
}

probe();
