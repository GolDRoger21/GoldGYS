import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount),
    storageBucket: 'goldgys.appspot.com'
});

const bucket = getStorage().bucket();

async function checkCors() {
    console.log('START_CHECKING_CORS');
    try {
        const [metadata] = await bucket.getMetadata();

        if (!metadata) {
            console.log('METADATA_IS_NULL');
        } else {
            console.log('METADATA_FOUND');
            if (metadata.cors) {
                console.log('CORS_FOUND');
                console.log(JSON.stringify(metadata.cors));
            } else {
                console.log('CORS_UNDEFINED');
            }
        }
    } catch (error) {
        console.error('ERROR_GETTING_METADATA');
        console.error(error);
    }
    console.log('END_CHECKING_CORS');
}

checkCors();
