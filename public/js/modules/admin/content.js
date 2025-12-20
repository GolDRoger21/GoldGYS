import { db } from "/js/firebase-config.js";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { formatDate, showNotice, setupLazyLoader } from "./utils.js";

const topicTitleInput = document.getElementById("title");
const topicCategorySelect = document.getElementById("category");
const topicList = document.getElementById("list") || document.getElementById("topicList");
const topicStatus = document.getElementById("topicStatus");
const loadMoreTopicsBtn = document.getElementById("loadMoreTopics");
const topicLazyLoader = document.getElementById("topicLazyLoader");

const reportsList = document.getElementById("reports");
const reportsStatus = document.getElementById("reportsStatus");
const loadMoreReportsBtn = document.getElementById("loadMoreReports");
const reportsLazyLoader = document.getElementById("reportsLazyLoader");

const topicPageState = { cursor: null, reachedEnd: false, loading: false };
const reportsPageState = { cursor: null, reachedEnd: false, loading: false };

if (topicTitleInput && topicCategorySelect && topicList) {
  document.getElementById("addTopicBtn")?.addEventListener("click", addTopic);
  loadMoreTopicsBtn?.addEventListener("click", () => loadTopics());
  setupLazyLoader(topicLazyLoader, () => {
    if (!topicPageState.loading && !topicPageState.reachedEnd) loadTopics();
  });
  loadTopics(true);
}

if (reportsList) {
  loadMoreReportsBtn?.addEventListener("click", () => loadReports());
  setupLazyLoader(reportsLazyLoader, () => {
    if (!reportsPageState.loading && !reportsPageState.reachedEnd) loadReports();
  });
  loadReports(true);
}

async function addTopic() {
  const title = topicTitleInput.value.trim();
  const category = topicCategorySelect.value;

  if (!title) {
    showNotice(topicStatus, "Başlık gerekli", true);
    return;
  }

  try {
    await addDoc(collection(db, "topics"), {
      title,
      category,
      isActive: true,
      createdAt: serverTimestamp(),
    });
    showNotice(topicStatus, "Konu eklendi");
    topicTitleInput.value = "";
    topicPageState.cursor = null;
    topicPageState.reachedEnd = false;
    topicList.innerHTML = "";
    await loadTopics(true);
  } catch (error) {
    console.error("Konu eklenemedi", error);
    showNotice(topicStatus, "Konu eklenemedi", true);
  }
}

async function loadTopics(reset = false) {
  if (topicPageState.loading) return;
  if (topicPageState.reachedEnd && !reset) return;

  topicPageState.loading = true;
  if (reset) {
    topicPageState.cursor = null;
    topicPageState.reachedEnd = false;
    topicList.innerHTML = "";
  }

  try {
    const constraints = [collection(db, "topics"), orderBy("createdAt", "desc"), limit(20)];
    if (topicPageState.cursor && !reset) {
      constraints.push(startAfter(topicPageState.cursor));
    }

    const snapshot = await getDocs(query(...constraints));
    if (snapshot.empty) {
      topicPageState.reachedEnd = true;
      toggleTopicLoaders();
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const li = document.createElement("li");
      const created = formatDate(data.createdAt);
      li.textContent = `${data.title || "-"} (${data.category || "-"}) • ${created}`;
      topicList.appendChild(li);
    });

    topicPageState.cursor = snapshot.docs[snapshot.docs.length - 1];
    topicPageState.reachedEnd = snapshot.size < 20;
    toggleTopicLoaders();
  } catch (error) {
    console.error("Konular yüklenemedi", error);
    showNotice(topicStatus, "Konular yüklenirken hata oluştu", true);
  } finally {
    topicPageState.loading = false;
  }
}

function toggleTopicLoaders() {
  if (loadMoreTopicsBtn) {
    loadMoreTopicsBtn.style.display = topicPageState.reachedEnd ? "none" : "inline-flex";
    loadMoreTopicsBtn.disabled = topicPageState.loading;
  }
  if (topicLazyLoader) {
    topicLazyLoader.style.display = topicPageState.reachedEnd ? "none" : "block";
  }
}

async function loadReports(reset = false) {
  if (reportsPageState.loading) return;
  if (reportsPageState.reachedEnd && !reset) return;

  reportsPageState.loading = true;
  if (reset) {
    reportsPageState.cursor = null;
    reportsPageState.reachedEnd = false;
    reportsList.innerHTML = "";
  }

  try {
    const constraints = [collection(db, "reports"), orderBy("createdAt", "desc"), limit(25)];
    if (reportsPageState.cursor && !reset) {
      constraints.push(startAfter(reportsPageState.cursor));
    }

    const snapshot = await getDocs(query(...constraints));
    if (snapshot.empty) {
      reportsPageState.reachedEnd = true;
      toggleReportLoaders();
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const li = document.createElement("li");
      const created = formatDate(data.createdAt);
      li.textContent = `${data.message || "-"} • ${created}`;
      reportsList.appendChild(li);
    });

    reportsPageState.cursor = snapshot.docs[snapshot.docs.length - 1];
    reportsPageState.reachedEnd = snapshot.size < 25;
    toggleReportLoaders();
  } catch (error) {
    console.error("Raporlar yüklenemedi", error);
    showNotice(reportsStatus, "Raporlar yüklenirken hata oluştu", true);
  } finally {
    reportsPageState.loading = false;
  }
}

function toggleReportLoaders() {
  if (loadMoreReportsBtn) {
    loadMoreReportsBtn.style.display = reportsPageState.reachedEnd ? "none" : "inline-flex";
    loadMoreReportsBtn.disabled = reportsPageState.loading;
  }
  if (reportsLazyLoader) {
    reportsLazyLoader.style.display = reportsPageState.reachedEnd ? "none" : "block";
  }
}
