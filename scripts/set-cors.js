import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

const logFile = 'cors-log.txt';
function log(message) {
    const msg = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

fs.writeFileSync(logFile, 'STARTING LOG\n');

log('Initializing Firebase Admin...');
log('Project ID from Service Account: ' + serviceAccount.project_id);

try {
    initializeApp({
        credential: cert(serviceAccount),
        storageBucket: 'goldgys.appspot.com'
    });
    log('Firebase Admin Initialized.');
} catch (e) {
    log('Initialization Error: ' + e.message);
}

const bucketName = 'goldgys.appspot.com';
log('Getting bucket reference for: ' + bucketName);
const bucket = getStorage().bucket(bucketName);

async function setCors() {
    log('Starting CORS update...');

    const corsConfiguration = [
        {
            origin: ['*'],
            method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
            responseHeader: ['Content-Type', 'Access-Control-Allow-Origin', 'x-goog-resumable'],
            maxAgeSeconds: 3600
        }
    ];

    try {
        log('Calling bucket.setMetadata()...');
        const [result] = await bucket.setMetadata({
            cors: corsConfiguration
        });
        log('--------------------------------------------------');
        log('✅ SUCCESS: CORS configuration applied!');
        log('--------------------------------------------------');
    } catch (error) {
        log('--------------------------------------------------');
        log('❌ FAILURE: Error applying CORS configuration.');
        log('Error Code: ' + error.code);
        log('Error Message: ' + error.message);
        if (error.response) {
            log('Response Status: ' + error.response.status);
        }
        log('--------------------------------------------------');
    }
}

setCors();
