
const db = firebase.firestore();

firebase.auth().onAuthStateChanged(async user => {
  if (!user) return;
  const uid = user.uid;

  const wrongSnap = await db.collection("users").doc(uid).collection("wrongs").get();
  const wrongList = document.getElementById("wrongList");
  if (wrongList) {
    wrongSnap.forEach(d => wrongList.innerHTML += `<p>${d.data().questionId}</p>`);
  }

  const favSnap = await db.collection("users").doc(uid).collection("favorites").get();
  const favList = document.getElementById("favList");
  if (favList) {
    favSnap.forEach(d => favList.innerHTML += `<p>${d.data().questionId}</p>`);
  }
});

function toggleFavorite(questionId) {
  const uid = firebase.auth().currentUser.uid;
  db.collection("users").doc(uid).collection("favorites").doc(questionId).set({
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
