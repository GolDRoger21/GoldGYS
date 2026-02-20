import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Use admin.storage() directly which returns the Storage service instance
const storage = admin.storage();

async function listBuckets() {
    console.log('Project:', serviceAccount.project_id);
    try {
        // getBuckets() is available on the Storage service instance in older SDKs or via google-cloud/storage wrapping
        // But in firebase-admin v10+, it should be there.
        // If not, we might be using a very weird version.
        // Let's try to print keys to debug.
        console.log('Storage keys:', Object.keys(storage));

        // Attempt standard listing
        const [buckets] = await storage.getBuckets();
        console.log('Buckets found:', buckets.length);
        buckets.forEach(bucket => {
            console.log(`- ${bucket.name}`);
        });
    } catch (error) {
        console.error('Error listing buckets:', error.message);
        if (error.code) console.error('Code:', error.code);
    }
}

listBuckets();
