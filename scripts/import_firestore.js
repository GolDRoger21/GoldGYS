/*
  import_firestore.js
  - Node.js script that reads scripts/firestore_seed.json and writes into Firestore
  - Requires a Firebase service account JSON and Node.js environment
  Usage:
    1) Place your service account JSON file somewhere safe (e.g. ~/gcloud/service-account.json)
    2) Set env var: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
       (Windows PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\service-account.json')
    3) cd scripts && npm install && node import_firestore.js
*/

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

const seedPath = path.join(process.cwd(), 'firestore_seed.json');
if (!fs.existsSync(seedPath)) {
  console.error('seed file not found:', seedPath);
  process.exit(1);
}

const raw = fs.readFileSync(seedPath, 'utf-8');
const seed = JSON.parse(raw);

// Initialize Firebase Admin
try {
  admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS env var or default creds
} catch (e) {
  console.error('Firebase init error:', e.message);
  process.exit(1);
}

const db = admin.firestore();

// Helper: batch commit with size limit
async function commitBatches(batches) {
  for (const b of batches) {
    await b.commit();
  }
}

async function run() {
  console.log('Starting import...');

  // 1) Collections with array of docs: topics, lessons, tests, questions, exams, reports
  const simpleCollections = ['topics','lessons','tests','questions','exams','reports'];

  for (const col of simpleCollections) {
    if (!seed[col]) continue;
    console.log(`Importing collection: ${col} (${seed[col].length} docs)`);

    let batch = db.batch();
    let batches = [];
    let opCount = 0;

    for (const doc of seed[col]) {
      const id = doc.id || doc.uid || doc.id || undefined;
      const docRef = id ? db.collection(col).doc(id) : db.collection(col).doc();
      batch.set(docRef, doc);
      opCount++;

      if (opCount === 450) { // keep under 500
        batches.push(batch);
        batch = db.batch();
        opCount = 0;
      }
    }
    batches.push(batch);
    await commitBatches(batches);
    console.log(`Imported ${col}`);
  }

  // 2) Users with nested subcollections
  if (seed.users && seed.users.length) {
    console.log('Importing users and subcollections...');
    for (const user of seed.users) {
      const uid = user.uid;
      const publicData = { ...user };

      // Remove nested arrays before writing root doc
      delete publicData.progress;
      delete publicData.wrongs;
      delete publicData.favorites;
      delete publicData.examSessions;
      delete publicData.examResults;

      await db.collection('users').doc(uid).set(publicData);

      // subcollections
      if (Array.isArray(user.progress)) {
        const colRef = db.collection('users').doc(uid).collection('progress');
        for (const item of user.progress) {
          const docRef = colRef.doc();
          await docRef.set(item);
        }
      }

      if (Array.isArray(user.wrongs)) {
        const colRef = db.collection('users').doc(uid).collection('wrongs');
        for (const item of user.wrongs) {
          const docRef = colRef.doc();
          await docRef.set(item);
        }
      }

      if (Array.isArray(user.favorites)) {
        const colRef = db.collection('users').doc(uid).collection('favorites');
        for (const item of user.favorites) {
          const docRef = colRef.doc();
          await docRef.set(item);
        }
      }

      if (Array.isArray(user.examSessions)) {
        const colRef = db.collection('users').doc(uid).collection('examSessions');
        for (const item of user.examSessions) {
          const docRef = colRef.doc();
          await docRef.set(item);
        }
      }

      if (Array.isArray(user.examResults)) {
        const colRef = db.collection('users').doc(uid).collection('examResults');
        for (const item of user.examResults) {
          const docRef = colRef.doc();
          await docRef.set(item);
        }
      }

    }
    console.log('Users import done');
  }

  console.log('Import finished successfully.');
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
