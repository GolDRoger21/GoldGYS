
const db = firebase.firestore();
let exam = null;
let questions = [];
let answers = {};
let idx = 0;
let remaining = 0;
let timerInt = null;

async function loadExam(examId) {
  const doc = await db.collection("exams").doc(examId).get();
  exam = { id: doc.id, ...doc.data() };
  document.getElementById("examTitle").innerText = exam.title;
  remaining = exam.duration * 60;

  const snap = await db.collection("questions")
    .where("examId", "==", examId)
    .where("isActive", "==", true)
    .get();

  questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  startTimer();
  render();
  autosave();
}

function startTimer() {
  timerInt = setInterval(() => {
    remaining--;
    if (remaining <= 0) finishExam();
    const m = String(Math.floor(remaining / 60)).padStart(2,'0');
    const s = String(remaining % 60).padStart(2,'0');
    document.getElementById("timer").innerText = `Süre: ${m}:${s}`;
  }, 1000);
}

function render() {
  const q = questions[idx];
  const area = document.getElementById("examArea");
  area.innerHTML = `
    <p><strong>Soru ${idx+1}</strong></p>
    <p>${q.text}</p>
    ${q.options.map(o => `
      <button onclick="answer('${o.id}')" ${answers[q.id]===o.id?'style="background:#d1ecf1"':''}>
        ${o.text}
      </button>`).join("")}
  `;
}

function answer(optId) {
  answers[questions[idx].id] = optId;
  render();
}

function nextQ(){ if(idx < questions.length-1){ idx++; render(); } }
function prevQ(){ if(idx > 0){ idx--; render(); } }

async function autosave() {
  const uid = firebase.auth().currentUser.uid;
  setInterval(() => {
    db.collection("users").doc(uid).collection("examSessions").doc(exam.id).set({
      answers, remaining, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }, 5000);
}

async function finishExam() {
  clearInterval(timerInt);
  const uid = firebase.auth().currentUser.uid;
  let correct = 0;
  questions.forEach(q => { if(answers[q.id] === q.correct) correct++; });

  await db.collection("users").doc(uid).collection("examResults").add({
    examId: exam.id,
    correct,
    total: questions.length,
    completedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Sınav tamamlandı. Doğru: " + correct);
  window.location.href = "/pages/analiz.html";
}

const p = new URLSearchParams(window.location.search);
loadExam(p.get("examId"));
