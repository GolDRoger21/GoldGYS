import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin DB
const serviceAccount = JSON.parse(readFileSync('../serviceAccountKey.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function fixTopicAnomalies() {
  console.log("Starting analysis of topic anomalies...");
  const topicsSnap = await db.collection("topics").get();
  
  const allTopics = [];
  topicsSnap.forEach(t => allTopics.push({ id: t.id, ...t.data() }));

  const parents = allTopics.filter(t => !t.parentId && t.status !== 'deleted');
  const subtopics = allTopics.filter(t => t.parentId && t.status !== 'deleted');

  let deletedCount = 0;

  for (const parent of parents) {
    // get child subtopics
    const children = subtopics.filter(s => s.parentId === parent.id);
    
    // get lessons of this parent
    const lessonsSnap = await db.collection(`topics/${parent.id}/lessons`).get();
    const lessons = [];
    lessonsSnap.forEach(l => lessons.push({ id: l.id, ...l.data() }));

    // check if any child title exactly matches a lesson title
    for (const child of children) {
      if (child.title && lessons.some(l => l.title?.trim().toLowerCase() === child.title?.trim().toLowerCase())) {
        console.log(`[ANOMALY FOUND] In Parent: '${parent.title}' - Subtopic: '${child.title}' has matching Lesson note.`);
        
        // Let's check if the child has any lessons inside it
        const childLessonsSnap = await db.collection(`topics/${child.id}/lessons`).get();
        if (childLessonsSnap.empty) {
            console.log(`   -> Subtopic '${child.title}' is empty. Deleting it safely...`);
            await db.collection("topics").doc(child.id).update({
                status: 'deleted',
                isDeleted: true,
                deletedAt: new Date(),
                anomalousDelete: true
            });
            deletedCount++;
        } else {
            console.log(`   -> WARNING: Subtopic '${child.title}' is NOT empty (has ${childLessonsSnap.size} lessons). Moving its lessons to parent or skipping?`);
            // Normally user wouldn't put lessons inside mistaken subtopics if they already have one in the parent.
            console.log("   -> Skipping for manual review.");
        }
      }
    }
  }

  console.log(`\nOperation finished. Anomalies fixed: ${deletedCount}`);
}

fixTopicAnomalies().catch(console.error);
