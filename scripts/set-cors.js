import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin with the service account
initializeApp({
    credential: cert(serviceAccount),
    storageBucket: 'goldgys.appspot.com'
});

const bucket = getStorage().bucket();

async function setCors() {
    console.log('Applying CORS configuration to bucket:', bucket.name);

    const corsConfiguration = [
        {
            origin: ['*'],
            method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
            responseHeader: ['Content-Type', 'Access-Control-Allow-Origin', 'x-goog-resumable'],
            maxAgeSeconds: 3600
        }
    ];

    try {
        await bucket.setMetadata({
            cors: corsConfiguration
        });
        console.log('✅ CORS configuration applied successfully!');
    } catch (error) {
        console.error('❌ Error applying CORS configuration:', error);
    }
}

setCors();
