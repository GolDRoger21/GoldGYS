const admin = require("firebase-admin");
const fs = require('fs');

const serviceAccount = require("../firestore/goldgys-firebase-adminsdk.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportTopics() {
    try {
        const snapshot = await db.collection("topics").get();
        let topicsList = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            topicsList.push(`ID: ${doc.id} | Parent: ${data.parentId || 'None'} | Title: ${data.title} | Target: ${data.totalQuestionTarget || 0}`);
        });

        fs.writeFileSync("./topics_list_dump.txt", topicsList.sort().join('\n'));
        console.log("Dumped " + topicsList.length + " topics to topics_list_dump.txt");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
exportTopics();
