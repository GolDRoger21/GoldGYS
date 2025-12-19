
const db = firebase.firestore();

async function addTopic() {
  const title = document.getElementById("title").value;
  const category = document.getElementById("category").value;

  await db.collection("topics").add({
    title, category, isActive: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert("Konu eklendi");
}
