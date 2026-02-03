import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCounts() {
    try {
        const topics = await db.collection("topics").count().get();
        const tests = await db.collection("tests").count().get();
        const exams = await db.collection("exams").count().get();

        console.log("Topics:", topics.data().count);
        console.log("Tests:", tests.data().count);
        console.log("Exams:", exams.data().count);
    } catch (error) {
        console.error("Error:", error);
    }
}

checkCounts();
