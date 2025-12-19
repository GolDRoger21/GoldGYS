
const db = firebase.firestore();

function sendReport() {
  const msg = document.getElementById("message").value;
  const uid = firebase.auth().currentUser.uid;

  db.collection("reports").add({
    userId: uid,
    message: msg,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: "open"
  }).then(() => alert("Bildirim alındı"));
}
