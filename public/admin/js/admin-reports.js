
const db = firebase.firestore();
db.collection("reports").onSnapshot(snap => {
  const ul = document.getElementById("reports");
  ul.innerHTML = "";
  snap.forEach(d => ul.innerHTML += `<li>${d.data().message}</li>`);
});
