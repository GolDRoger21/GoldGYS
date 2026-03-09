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

const stepStats = {
  total: 0,
  passed: 0,
};

async function runStep(name, operation) {
  stepStats.total += 1;
  logStep(name);
  try {
    await operation();
    stepStats.passed += 1;
    process.stdout.write(`[rules-test] PASS: ${name}\n`);
  } catch (error) {
    process.stdout.write(`[rules-test] FAIL: ${name}\n`);
    error.message = `[${name}] ${error.message}`;
    throw error;
  }
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

    const anonDb = testEnv.unauthenticatedContext().firestore();
    await runStep('Unauthenticated users can read topics', async () => {
      await assertSucceeds(getDoc(doc(anonDb, 'topics', 'seed-topic')));
    });

    await runStep('Unauthenticated users cannot write topics', async () => {
      await assertFails(
        setDoc(doc(anonDb, 'topics', 'new-topic'), { name: 'Nope', order: 2 }),
      );
    });

    const userDb = testEnv.authenticatedContext('normalUser', {
      role: 'user',
    }).firestore();
    await runStep('Regular users cannot write topics', async () => {
      await assertFails(
        setDoc(doc(userDb, 'topics', 'user-topic'), { name: 'Nope', order: 2 }),
      );
    });

    const editorDb = testEnv.authenticatedContext('editorUser', {
      role: 'editor',
      editor: true,
    }).firestore();
    await runStep('Editor claim can write topics', async () => {
      await assertSucceeds(
        setDoc(doc(editorDb, 'topics', 'editor-topic'), {
          name: 'Allowed',
          order: 3,
        }),
      );
    });

    const selfDb = testEnv.authenticatedContext('selfUser', {
      role: 'user',
    }).firestore();
    await runStep('User can create only own pending profile', async () => {
      await assertSucceeds(
        setDoc(doc(selfDb, 'users', 'selfUser'), {
          role: 'user',
          status: 'pending',
          displayName: 'Self User',
        }),
      );
    });

    const selfBadDb = testEnv.authenticatedContext('selfUserBad', {
      role: 'user',
    }).firestore();
    await runStep('User cannot create own profile with elevated role', async () => {
      await assertFails(
        setDoc(doc(selfBadDb, 'users', 'selfUserBad'), {
          role: 'admin',
          status: 'pending',
        }),
      );
    });

    await runStep('User can update allowed self fields', async () => {
      await assertSucceeds(
        updateDoc(doc(selfDb, 'users', 'selfUser'), {
          displayName: 'Self User 2',
          updatedAt: Date.now(),
        }),
      );
    });

    await runStep('User cannot update protected self fields', async () => {
      await assertFails(
        updateDoc(doc(selfDb, 'users', 'selfUser'), {
          role: 'editor',
        }),
      );
    });

    await runStep('User can write own subcollection, cannot write others', async () => {
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
    });

    const adminDb = testEnv.authenticatedContext('tokenAdminOnly', {
      role: 'admin',
      admin: true,
    }).firestore();
    await runStep('Admin claim can read stats without profile lookup dependency', async () => {
      await assertSucceeds(getDoc(doc(adminDb, 'stats', 'overview')));
    });

    await runStep('Non-admin cannot read stats', async () => {
      await assertFails(getDoc(doc(userDb, 'stats', 'overview')));
    });

    process.stdout.write(
      `\n[rules-test] Summary: ${stepStats.passed}/${stepStats.total} steps passed.\n`,
    );
    process.stdout.write('[rules-test] All checks passed.\n');
  } finally {
    await testEnv.cleanup();
  }
}

run().catch((error) => {
  process.stdout.write(
    `\n[rules-test] Summary: ${stepStats.passed}/${stepStats.total} steps passed.\n`,
  );
  console.error('\n[rules-test] Failed:', error);
  process.exitCode = 1;
});
