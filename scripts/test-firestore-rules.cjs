const path = require('path');
const fs = require('fs');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} = require('firebase/firestore');

const PROJECT_ID = 'goldgys-rules-test';
const RULES_PATH = path.join(process.cwd(), 'firestore', 'firestore.rules');

function logStep(name) {
  process.stdout.write(`\n[rules-test] ${name}\n`);
}

async function run() {
  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });

  try {
    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'topics', 'seed-topic'), {
        name: 'Seed Topic',
        order: 1,
      });
      await setDoc(doc(db, 'stats', 'overview'), { users: 10 });
      await setDoc(doc(db, 'users', 'normalUser'), {
        role: 'user',
        status: 'approved',
      });
    });

    logStep('Unauthenticated users can read topics');
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonDb, 'topics', 'seed-topic')));

    logStep('Unauthenticated users cannot write topics');
    await assertFails(
      setDoc(doc(anonDb, 'topics', 'new-topic'), { name: 'Nope', order: 2 }),
    );

    logStep('Regular users cannot write topics');
    const userDb = testEnv.authenticatedContext('normalUser', {
      role: 'user',
    }).firestore();
    await assertFails(
      setDoc(doc(userDb, 'topics', 'user-topic'), { name: 'Nope', order: 2 }),
    );

    logStep('Editor claim can write topics');
    const editorDb = testEnv.authenticatedContext('editorUser', {
      role: 'editor',
      editor: true,
    }).firestore();
    await assertSucceeds(
      setDoc(doc(editorDb, 'topics', 'editor-topic'), {
        name: 'Allowed',
        order: 3,
      }),
    );

    logStep('User can create only own pending profile');
    const selfDb = testEnv.authenticatedContext('selfUser', {
      role: 'user',
    }).firestore();
    await assertSucceeds(
      setDoc(doc(selfDb, 'users', 'selfUser'), {
        role: 'user',
        status: 'pending',
        displayName: 'Self User',
      }),
    );

    logStep('User cannot create own profile with elevated role');
    const selfBadDb = testEnv.authenticatedContext('selfUserBad', {
      role: 'user',
    }).firestore();
    await assertFails(
      setDoc(doc(selfBadDb, 'users', 'selfUserBad'), {
        role: 'admin',
        status: 'pending',
      }),
    );

    logStep('User can update allowed self fields');
    await assertSucceeds(
      updateDoc(doc(selfDb, 'users', 'selfUser'), {
        displayName: 'Self User 2',
        updatedAt: Date.now(),
      }),
    );

    logStep('User cannot update protected self fields');
    await assertFails(
      updateDoc(doc(selfDb, 'users', 'selfUser'), {
        role: 'editor',
      }),
    );

    logStep('User can write own subcollection, cannot write others');
    await assertSucceeds(
      setDoc(doc(selfDb, 'users', 'selfUser', 'favorites', 'fav1'), {
        questionId: 'q1',
      }),
    );
    await assertFails(
      setDoc(doc(selfDb, 'users', 'anotherUser', 'favorites', 'fav1'), {
        questionId: 'q1',
      }),
    );

    logStep('Admin claim can read stats without profile lookup dependency');
    const adminDb = testEnv.authenticatedContext('tokenAdminOnly', {
      role: 'admin',
      admin: true,
    }).firestore();
    await assertSucceeds(getDoc(doc(adminDb, 'stats', 'overview')));

    logStep('Non-admin cannot read stats');
    await assertFails(getDoc(doc(userDb, 'stats', 'overview')));

    process.stdout.write('\n[rules-test] All checks passed.\n');
  } finally {
    await testEnv.cleanup();
  }
}

run().catch((error) => {
  console.error('\n[rules-test] Failed:', error);
  process.exitCode = 1;
});
