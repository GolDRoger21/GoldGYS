import { db } from "../../firebase-config.js";
import {
    collection,
    getDocs,
    doc,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    query,
    orderBy,
    where,
    writeBatch,
    limit,
    startAfter,
    increment,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * GOLD GYS - Admin Topics (Improved)
 * - Real drag&drop ordering persisted to Firestore
 * - Safe unsaved-changes guard
 * - Lesson/Test creation with max+1 ordering + normalize after delete
 * - Test question selector: pagination + multi-select + filters
 * - Selected questions sortable and order reflected in saved data
 * - Prefer storing questionIds to avoid Firestore doc size issues (optional snapshot)
 */

let modalElement = null;
let topicForm = null;

let currentLessons = [];           // [{id, title, type, order, isActive, ...}]
let activeLessonId = null;         // selected lesson doc id
let activeLessonData = null;       // cached data of active lesson

let isDirty = false;              // editor dirty guard

// Question pool
let questionPool = [];            // current page fetched
let questionCache = new Map();    // id -> question minimal cache (text/category/legislationRef/...)
let poolCursor = null;            // startAfter cursor
let poolHasMore = true;

// Selected questions (for the active test)
let selectedQuestionIds = [];     // ordered list of IDs
let selectedIdSet = new Set();    // quick lookup

export function initTopicsPage() {
    renderTopicsInterface();
    loadTopics();
}

// ----------------------------
// UI RENDER
// ----------------------------
function renderTopicsInterface() {
    const container = document.getElementById("section-topics");
    container.innerHTML = `
    <div class="section-header">
      <div>
        <h2>📚 Müfredat ve Test Yönetimi</h2>
        <p class="text-muted">Konuları, dersleri ve testleri buradan yönetin.</p>
      </div>
      <div class="d-flex gap-2">
        <button id="btnNewTopic" class="btn btn-primary">➕ Yeni Ana Konu</button>
      </div>
    </div>

    <!-- Konu Listesi -->
    <div class="card mb-4">
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th style="width:80px">Sıra</th>
              <th>Konu Başlığı</th>
              <th style="width:120px">Kategori</th>
              <th style="width:120px">İçerik</th>
              <th style="width:90px">Durum</th>
              <th style="width:140px">İşlemler</th>
            </tr>
          </thead>
          <tbody id="topicsTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- EDİTÖR MODALI -->
    <div id="topicModal" class="modal-overlay" style="display:none;">
      <div class="modal-content admin-modal-content" style="max-width: 1200px; height: 95vh; display:flex; flex-direction:column;">
        <div class="modal-header">
          <div class="d-flex align-items-center gap-2">
            <h3 id="topicModalTitle" class="mb-0">Konu Düzenle</h3>
            <span id="dirtyBadge" class="badge bg-warning text-dark" style="display:none;">Kaydedilmemiş değişiklik</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button id="btnCloseTopicModal" class="close-btn" title="Kapat">&times;</button>
          </div>
        </div>

        <div class="modal-body-scroll" style="flex:1; display:grid; grid-template-columns: 320px 1fr; gap:0; padding:0; overflow:hidden;">

          <!-- SOL: İçerik ağacı -->
          <div class="lessons-sidebar" style="border-right:1px solid var(--border-color); background:var(--bg-body); padding:16px; overflow-y:auto;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5 class="mb-0">İçerikler</h5>
              <div class="dropdown">
                <button class="btn btn-sm btn-outline-primary dropdown-toggle" type="button" id="btnAddContentMenu" data-bs-toggle="dropdown">+ Ekle</button>
                <ul class="dropdown-menu">
                  <li><a class="dropdown-item" href="#" data-add-type="lesson">📄 Ders Notu</a></li>
                  <li><a class="dropdown-item" href="#" data-add-type="test">📝 Test</a></li>
                </ul>
              </div>
            </div>

            <div class="mb-2">
              <input id="contentSearch" type="text" class="form-control form-control-sm" placeholder="İçerik ara...">
            </div>

            <div class="d-flex gap-2 mb-3">
              <select id="contentFilterType" class="form-control form-control-sm">
                <option value="all">Tümü</option>
                <option value="lesson">Ders</option>
                <option value="test">Test</option>
              </select>
              <select id="contentFilterActive" class="form-control form-control-sm">
                <option value="all">Aktif/Pasif</option>
                <option value="active">Aktif</option>
                <option value="passive">Pasif</option>
              </select>
            </div>

            <div id="lessonsListContainer" class="lessons-nav sortable-list" style="min-height:120px;">
              <!-- draggable list -->
            </div>

            <div class="mt-3 d-flex gap-2">
              <button id="btnNormalizeOrders" class="btn btn-sm btn-outline-secondary w-100">Sıraları Düzelt</button>
            </div>
          </div>

          <!-- SAĞ: Editör -->
          <div class="editor-area" style="padding:20px; overflow-y:auto;">

            <!-- 1) Topic Meta -->
            <div id="topicMetaPanel">
              <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                <h4 class="mb-0">Ana Konu Ayarları</h4>
                <button type="button" id="btnSaveMeta" class="btn btn-success">Kaydet</button>
              </div>

              <form id="topicMetaForm">
                <input type="hidden" id="editTopicId">

                <div class="row">
                  <div class="col-md-8 mb-3">
                    <label>Başlık</label>
                    <input type="text" id="inpTopicTitle" class="form-control" placeholder="Örn: Anayasa Hukuku">
                  </div>
                  <div class="col-md-4 mb-3">
                    <label>Sıra</label>
                    <input type="number" id="inpTopicOrder" class="form-control" min="1" placeholder="1">
                  </div>
                  <div class="col-md-6 mb-3">
                    <label>Kategori</label>
                    <select id="inpTopicCategory" class="form-control">
                      <option value="ortak">Ortak</option>
                      <option value="alan">Alan</option>
                    </select>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label>Durum</label>
                    <select id="inpTopicStatus" class="form-control">
                      <option value="true">Aktif</option>
                      <option value="false">Pasif</option>
                    </select>
                  </div>
                </div>

                <div class="alert alert-info mt-2">
                  <small class="text-muted">
                    İpucu: Konuyu kaydettikten sonra sol menüden “Ders/Test” ekleyebilirsin.
                  </small>
                </div>
              </form>
            </div>

            <!-- 2) Lesson/Test Editor -->
            <div id="lessonEditorPanel" style="display:none;">
              <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                <div>
                  <h4 class="mb-0" id="editorTitle">İçerik Düzenle</h4>
                  <small id="editorSubTitle" class="text-muted"></small>
                </div>
                <div class="d-flex gap-2">
                  <button class="btn btn-sm btn-outline-secondary" id="btnBackToTopicMeta">← Konu Ayarları</button>
                  <button class="btn btn-sm btn-danger" id="btnDeleteContent">Sil</button>
                  <button class="btn btn-sm btn-success" id="btnSaveContent">Kaydet</button>
                </div>
              </div>

              <div class="row mb-3">
                <div class="col-md-8">
                  <label>Başlık</label>
                  <input type="text" id="inpLessonTitle" class="form-control" placeholder="Örn: Temel İlkeler">
                </div>
                <div class="col-md-4">
                  <label>Tür</label>
                  <input type="text" id="inpLessonType" class="form-control" disabled>
                </div>
              </div>

              <div class="row mb-3">
                <div class="col-md-4">
                  <label>Durum</label>
                  <select id="inpLessonActive" class="form-control">
                    <option value="true">Aktif</option>
                    <option value="false">Pasif</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label>Sıra</label>
                  <input type="number" id="inpLessonOrder" class="form-control" min="1" placeholder="Otomatik">
                  <small class="text-muted">Boş bırakırsan otomatik (max+1).</small>
                </div>
                <div class="col-md-4 d-flex align-items-end">
                  <button id="btnDuplicateContent" class="btn btn-outline-primary w-100">Kopyala</button>
                </div>
              </div>

              <!-- TEST AREA -->
              <div id="testQuestionsArea" style="display:none;">
                <div class="card bg-light p-3 mb-3">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="m-0">Test Soruları (<span id="qCount">0</span>)</h6>
                    <button class="btn btn-sm btn-primary" id="btnOpenQuestionSelector">+ Soru Seç</button>
                  </div>

                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <small class="text-muted">Seçili soruları sürükle-bırak ile sırala.</small>
                    <label class="d-flex align-items-center gap-2 m-0">
                      <input type="checkbox" id="chkStoreSnapshot">
                      <small>Soruları test içine kopyala (snapshot)</small>
                    </label>
                  </div>

                  <div id="selectedQuestionsList" class="sortable-list bg-white border rounded p-2" style="min-height:120px;">
                    <!-- selected questions -->
                  </div>
                </div>
              </div>

              <!-- LESSON AREA -->
              <div id="lessonMaterialsArea" style="display:none;">
                <div class="card p-3 mb-3">
                  <h6 class="mb-2">Ders İçeriği</h6>
                  <small class="text-muted d-block mb-2">
                    Basit ama güçlü bir model: HTML içerik + Video URL + PDF URL alanları.
                  </small>

                  <div class="mb-3">
                    <label>HTML İçerik</label>
                    <textarea id="inpLessonHtml" class="form-control" rows="8" placeholder="<h2>...</h2>"></textarea>
                  </div>

                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label>Video URL (YouTube vs.)</label>
                      <input id="inpLessonVideoUrl" type="text" class="form-control" placeholder="https://...">
                    </div>
                    <div class="col-md-6 mb-3">
                      <label>PDF URL</label>
                      <input id="inpLessonPdfUrl" type="text" class="form-control" placeholder="https://...">
                    </div>
                  </div>
                </div>
              </div>

              <div class="alert alert-warning">
                <small>
                  Not: Testlerde varsayılan olarak <b>questionIds</b> saklanır. Snapshot açarsan soru metinleri de kopyalanır (doküman boyutu büyür).
                </small>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- QUESTION SELECTOR MODAL -->
    <div id="questionSelectorModal" class="modal-overlay" style="display:none; z-index: 2100;">
      <div class="modal-content admin-modal-content" style="max-width: 900px; height: 85vh;">
        <div class="modal-header">
          <div>
            <h3 class="mb-0">Soru Havuzu</h3>
            <small class="text-muted">Çoklu seçebilir, filtreleyebilir, sayfa sayfa yükleyebilirsin.</small>
          </div>
          <button id="btnCloseQuestionSelector" class="close-btn">&times;</button>
        </div>

        <div class="modal-body-scroll">
          <div class="row g-2 mb-2">
            <div class="col-md-6">
              <input type="text" id="searchPool" class="form-control" placeholder="Soru ara (client-side cache)...">
            </div>
            <div class="col-md-3">
              <select id="poolCategoryFilter" class="form-control">
                <option value="all">Kategori (Tümü)</option>
                <option value="ortak">Ortak</option>
                <option value="alan">Alan</option>
              </select>
            </div>
            <div class="col-md-3">
              <input type="text" id="poolLegislationFilter" class="form-control" placeholder="Mevzuat kodu (örn: 657)">
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center mb-2">
            <div>
              <button id="btnSelectAllVisible" class="btn btn-sm btn-outline-secondary">Görünenleri Seç</button>
              <button id="btnClearPoolSelection" class="btn btn-sm btn-outline-secondary">Seçimi Temizle</button>
            </div>
            <div class="d-flex align-items-center gap-2">
              <small class="text-muted">Seçili: <b id="poolSelectedCount">0</b></small>
              <button id="btnApplyPoolSelection" class="btn btn-sm btn-success">Seçimi Uygula</button>
            </div>
          </div>

          <div id="poolList" class="list-group"></div>

          <div class="mt-3 d-flex justify-content-center">
            <button id="btnLoadMorePool" class="btn btn-outline-primary" style="display:none;">Daha fazla yükle</button>
          </div>

        </div>
      </div>
    </div>
  `;

    bindEvents();
}

function bindEvents() {
    modalElement = document.getElementById("topicModal");
    topicForm = document.getElementById("topicMetaForm");

    document.getElementById("btnNewTopic").addEventListener("click", () => openTopicEditor());
    document.getElementById("btnCloseTopicModal").addEventListener("click", closeTopicModalSafely);
    document.getElementById("btnSaveMeta").addEventListener("click", handleSaveTopicMeta);

    // Sidebar controls
    document.getElementById("contentSearch").addEventListener("input", renderLessonsList);
    document.getElementById("contentFilterType").addEventListener("change", renderLessonsList);
    document.getElementById("contentFilterActive").addEventListener("change", renderLessonsList);
    document.getElementById("btnNormalizeOrders").addEventListener("click", async () => {
        const topicId = document.getElementById("editTopicId").value;
        if (!topicId) return;
        await normalizeLessonOrders(topicId);
        await loadContents(topicId);
        toast("Sıralar düzeltildi.", "success");
    });

    // Add menu (dropdown items)
    document.querySelectorAll("[data-add-type]").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            const type = el.getAttribute("data-add-type");
            addNewContentUI(type);
        });
    });

    // Lesson editor buttons
    document.getElementById("btnBackToTopicMeta").addEventListener("click", () => {
        if (!confirmDiscardIfDirty()) return;
        showTopicMetaPanel();
    });
    document.getElementById("btnDeleteContent").addEventListener("click", deleteCurrentContent);
    document.getElementById("btnSaveContent").addEventListener("click", saveCurrentContent);
    document.getElementById("btnDuplicateContent").addEventListener("click", duplicateCurrentContent);

    // Question selector modal controls
    document.getElementById("btnOpenQuestionSelector").addEventListener("click", openQuestionSelector);
    document.getElementById("btnCloseQuestionSelector").addEventListener("click", closeQuestionSelector);

    document.getElementById("searchPool").addEventListener("input", renderQuestionPool);
    document.getElementById("poolCategoryFilter").addEventListener("change", renderQuestionPool);
    document.getElementById("poolLegislationFilter").addEventListener("input", renderQuestionPool);

    document.getElementById("btnLoadMorePool").addEventListener("click", loadMoreQuestionPool);
    document.getElementById("btnSelectAllVisible").addEventListener("click", selectAllVisibleInPool);
    document.getElementById("btnClearPoolSelection").addEventListener("click", clearPoolTempSelection);
    document.getElementById("btnApplyPoolSelection").addEventListener("click", applyPoolSelection);

    // Dirty tracking (inputs)
    hookDirty("#inpTopicTitle, #inpTopicOrder, #inpTopicCategory, #inpTopicStatus");
    hookDirty("#inpLessonTitle, #inpLessonActive, #inpLessonOrder, #inpLessonHtml, #inpLessonVideoUrl, #inpLessonPdfUrl, #chkStoreSnapshot");

    // Expose some functions if you still use inline onclick somewhere else
    window.openTopicEditor = openTopicEditor;
    window.selectContent = selectContent;
    window.addNewContentUI = addNewContentUI;
}

// ----------------------------
// TOPICS LIST
// ----------------------------
async function loadTopics() {
    const tbody = document.getElementById("topicsTableBody");
    tbody.innerHTML = `<tr><td colspan="6">Yükleniyor...</td></tr>`;

    const q = query(collection(db, "topics"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    tbody.innerHTML = "";
    snapshot.forEach((d) => {
        const t = d.data();
        tbody.innerHTML += `
      <tr>
        <td>${safeNum(t.order)}</td>
        <td><strong>${escapeHtml(t.title || "")}</strong></td>
        <td>${escapeHtml(t.category || "")}</td>
        <td>${safeNum(t.lessonCount || 0)}</td>
        <td>${t.isActive ? "✅" : "❌"}</td>
        <td>
          <button class="btn btn-sm btn-primary" data-edit-topic="${d.id}">Düzenle</button>
        </td>
      </tr>
    `;
    });

    tbody.querySelectorAll("[data-edit-topic]").forEach((btn) => {
        btn.addEventListener("click", () => openTopicEditor(btn.getAttribute("data-edit-topic")));
    });
}

// ----------------------------
// TOPIC EDITOR OPEN/CLOSE
// ----------------------------
async function openTopicEditor(id = null) {
    if (modalElement.style.display === "flex" && !confirmDiscardIfDirty()) return;

    setDirty(false);
    modalElement.style.display = "flex";

    // reset panels
    document.getElementById("lessonsListContainer").innerHTML = "";
    activeLessonId = null;
    activeLessonData = null;
    currentLessons = [];

    showTopicMetaPanel();

    if (id) {
        document.getElementById("editTopicId").value = id;

        const docSnap = await getDoc(doc(db, "topics", id));
        const data = docSnap.exists() ? docSnap.data() : null;

        if (!data) {
            toast("Konu bulunamadı.", "error");
            modalElement.style.display = "none";
            return;
        }

        document.getElementById("topicModalTitle").innerText = `Konu Düzenle`;
        document.getElementById("inpTopicTitle").value = data.title || "";
        document.getElementById("inpTopicOrder").value = safeNum(data.order) || "";
        document.getElementById("inpTopicCategory").value = data.category || "ortak";
        document.getElementById("inpTopicStatus").value = (data.isActive ? "true" : "false");

        await loadContents(id);
    } else {
        document.getElementById("topicModalTitle").innerText = `Yeni Ana Konu`;
        document.getElementById("editTopicId").value = "";
        topicForm.reset();
    }
}

function closeTopicModalSafely() {
    if (!confirmDiscardIfDirty()) return;
    modalElement.style.display = "none";
    setDirty(false);
}

function showTopicMetaPanel() {
    document.getElementById("lessonEditorPanel").style.display = "none";
    document.getElementById("topicMetaPanel").style.display = "block";
}

function showLessonEditorPanel() {
    document.getElementById("topicMetaPanel").style.display = "none";
    document.getElementById("lessonEditorPanel").style.display = "block";
}

// ----------------------------
// CONTENTS (LESSONS/TESTS)
// ----------------------------
async function loadContents(topicId) {
    const container = document.getElementById("lessonsListContainer");
    container.innerHTML = `Yükleniyor...`;

    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snapshot = await getDocs(q);

    currentLessons = [];
    snapshot.forEach((d) => {
        currentLessons.push({ id: d.id, ...d.data() });
    });

    renderLessonsList();
    initSortableLessons();

    // update count on topic (optional reconcile if missing)
    // NOTE: lessonCount is maintained on add/delete, but if older data exists, reconcile once.
    const topicRef = doc(db, "topics", topicId);
    const topicSnap = await getDoc(topicRef);
    if (topicSnap.exists()) {
        const t = topicSnap.data();
        const expected = currentLessons.length;
        if ((t.lessonCount ?? expected) !== expected) {
            await updateDoc(topicRef, { lessonCount: expected, updatedAt: serverTimestamp() });
        }
    }
}

function renderLessonsList() {
    const container = document.getElementById("lessonsListContainer");
    const search = (document.getElementById("contentSearch").value || "").toLowerCase().trim();
    const fType = document.getElementById("contentFilterType").value;
    const fActive = document.getElementById("contentFilterActive").value;

    const filtered = currentLessons.filter((c) => {
        const title = (c.title || "").toLowerCase();
        const matchesSearch = !search || title.includes(search);

        const type = (c.type || "lesson");
        const matchesType = (fType === "all") || (type === fType);

        const isActive = (c.isActive !== false); // default true
        const matchesActive =
            (fActive === "all") ||
            (fActive === "active" && isActive) ||
            (fActive === "passive" && !isActive);

        return matchesSearch && matchesType && matchesActive;
    });

    container.innerHTML = "";
    if (!filtered.length) {
        container.innerHTML = `<div class="text-muted p-2">İçerik yok.</div>`;
        return;
    }

    filtered.forEach((c) => {
        const type = (c.type || "lesson");
        const icon = type === "test" ? "📝" : "📄";
        const active = c.isActive !== false;

        const div = document.createElement("div");
        div.className = `nav-item d-flex justify-content-between align-items-center p-2 border-bottom ${c.id === activeLessonId ? "bg-light" : ""}`;
        div.setAttribute("data-id", c.id);
        div.setAttribute("data-type", type);

        div.innerHTML = `
      <div class="d-flex align-items-center gap-2" style="min-width:0;">
        <span class="drag-handle" title="Sürükle" style="cursor:grab;">⠿</span>
        <span class="badge ${type === "test" ? "bg-primary" : "bg-secondary"}">${type === "test" ? "TEST" : "DERS"}</span>
        <span class="${active ? "" : "text-muted"}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${icon} ${escapeHtml(c.title || "(Başlıksız)")}
        </span>
      </div>
      <div class="d-flex align-items-center gap-2">
        <small class="text-muted">#${safeNum(c.order)}</small>
        <button class="btn btn-sm btn-outline-secondary py-0" data-action="toggle" title="Aktif/Pasif">${active ? "✅" : "❌"}</button>
      </div>
    `;

        // click to select (excluding toggle button)
        div.addEventListener("click", (e) => {
            const actionBtn = e.target.closest("[data-action]");
            if (actionBtn) return;
            selectContent(c.id);
        });

        // toggle active
        div.querySelector('[data-action="toggle"]').addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const topicId = document.getElementById("editTopicId").value;
            await toggleContentActive(topicId, c.id, !(c.isActive !== false));
        });

        container.appendChild(div);
    });
}

function initSortableLessons() {
    const container = document.getElementById("lessonsListContainer");
    if (typeof Sortable === "undefined") return;

    // Only one instance; Sortable attaches internally
    new Sortable(container, {
        animation: 150,
        handle: ".drag-handle",
        onEnd: async () => {
            const topicId = document.getElementById("editTopicId").value;
            if (!topicId) return;
            await persistLessonOrderFromDOM(topicId);
        },
    });
}

async function persistLessonOrderFromDOM(topicId) {
    const items = Array.from(document.querySelectorAll("#lessonsListContainer .nav-item[data-id]"));
    if (!items.length) return;

    const idOrder = items.map((el) => el.getAttribute("data-id"));

    // create map for quick access
    const lessonById = new Map(currentLessons.map((l) => [l.id, l]));
    const batch = writeBatch(db);

    let changed = false;
    idOrder.forEach((id, idx) => {
        const desiredOrder = idx + 1;
        const lesson = lessonById.get(id);
        if (!lesson) return;

        if (safeNum(lesson.order) !== desiredOrder) {
            changed = true;
            batch.update(doc(db, `topics/${topicId}/lessons`, id), {
                order: desiredOrder,
                updatedAt: serverTimestamp(),
            });
            lesson.order = desiredOrder;
        }
    });

    if (!changed) return;

    await batch.commit();

    // keep local array sorted
    currentLessons.sort((a, b) => safeNum(a.order) - safeNum(b.order));
    renderLessonsList();
    toast("Sıralama kaydedildi.", "success");
}

async function normalizeLessonOrders(topicId) {
    const q = query(collection(db, `topics/${topicId}/lessons`), orderBy("order", "asc"));
    const snap = await getDocs(q);

    const batch = writeBatch(db);
    let i = 1;
    let changed = false;

    snap.forEach((d) => {
        const data = d.data();
        const current = safeNum(data.order);
        if (current !== i) {
            changed = true;
            batch.update(doc(db, `topics/${topicId}/lessons`, d.id), {
                order: i,
                updatedAt: serverTimestamp(),
            });
        }
        i++;
    });

    if (changed) await batch.commit();
}

async function toggleContentActive(topicId, lessonId, newActive) {
    try {
        await updateDoc(doc(db, `topics/${topicId}/lessons`, lessonId), {
            isActive: newActive,
            updatedAt: serverTimestamp(),
        });

        const l = currentLessons.find((x) => x.id === lessonId);
        if (l) l.isActive = newActive;

        // if currently open, reflect in editor
        if (activeLessonId === lessonId) {
            document.getElementById("inpLessonActive").value = newActive ? "true" : "false";
        }

        renderLessonsList();
        toast("Durum güncellendi.", "success");
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

// ----------------------------
// SELECT / ADD CONTENT
// ----------------------------
async function selectContent(id) {
    if (!confirmDiscardIfDirty()) return;

    activeLessonId = id;
    activeLessonData = currentLessons.find((c) => c.id === id) || null;

    if (!activeLessonData) {
        toast("İçerik bulunamadı.", "error");
        return;
    }

    showLessonEditorPanel();
    setDirty(false);

    const type = activeLessonData.type || "lesson";
    document.getElementById("editorTitle").innerText = type === "test" ? "📝 Test Düzenle" : "📄 Ders Düzenle";
    document.getElementById("editorSubTitle").innerText = `ID: ${id} • Sıra: #${safeNum(activeLessonData.order)}`;

    // fill common fields
    document.getElementById("inpLessonTitle").value = activeLessonData.title || "";
    document.getElementById("inpLessonType").value = type;
    document.getElementById("inpLessonActive").value = (activeLessonData.isActive !== false) ? "true" : "false";
    document.getElementById("inpLessonOrder").value = safeNum(activeLessonData.order) || "";

    // show type-specific UI
    if (type === "test") {
        document.getElementById("testQuestionsArea").style.display = "block";
        document.getElementById("lessonMaterialsArea").style.display = "none";

        // Backward compatibility: if old "questions" array exists, convert to IDs
        const legacyQuestions = Array.isArray(activeLessonData.questions) ? activeLessonData.questions : null;
        const ids = Array.isArray(activeLessonData.questionIds) ? activeLessonData.questionIds : null;

        selectedQuestionIds = [];
        selectedIdSet = new Set();

        if (ids && ids.length) {
            ids.forEach((qid) => {
                selectedQuestionIds.push(qid);
                selectedIdSet.add(qid);
            });
        } else if (legacyQuestions && legacyQuestions.length) {
            legacyQuestions.forEach((q) => {
                if (q?.id) {
                    selectedQuestionIds.push(q.id);
                    selectedIdSet.add(q.id);
                    // cache minimal from legacy snapshot
                    questionCache.set(q.id, {
                        id: q.id,
                        text: q.text || "",
                        options: q.options || [],
                        correctOption: q.correctOption || "",
                        solution: q.solution || {},
                    });
                }
            });
        }

        document.getElementById("chkStoreSnapshot").checked = !!activeLessonData.storeSnapshot;
        renderSelectedQuestions();
    } else {
        document.getElementById("testQuestionsArea").style.display = "none";
        document.getElementById("lessonMaterialsArea").style.display = "block";

        document.getElementById("inpLessonHtml").value = activeLessonData.contentHtml || "";
        document.getElementById("inpLessonVideoUrl").value = activeLessonData.videoUrl || "";
        document.getElementById("inpLessonPdfUrl").value = activeLessonData.pdfUrl || "";
    }
}

function addNewContentUI(type) {
    if (!confirmDiscardIfDirty()) return;

    activeLessonId = null;
    activeLessonData = null;
    showLessonEditorPanel();
    setDirty(false);

    document.getElementById("editorTitle").innerText = type === "test" ? "📝 Yeni Test" : "📄 Yeni Ders";
    document.getElementById("editorSubTitle").innerText = "Yeni içerik oluşturuyorsun.";

    document.getElementById("inpLessonTitle").value = "";
    document.getElementById("inpLessonType").value = type;
    document.getElementById("inpLessonActive").value = "true";
    document.getElementById("inpLessonOrder").value = "";

    if (type === "test") {
        document.getElementById("testQuestionsArea").style.display = "block";
        document.getElementById("lessonMaterialsArea").style.display = "none";

        selectedQuestionIds = [];
        selectedIdSet = new Set();
        document.getElementById("chkStoreSnapshot").checked = false;
        renderSelectedQuestions();
    } else {
        document.getElementById("testQuestionsArea").style.display = "none";
        document.getElementById("lessonMaterialsArea").style.display = "block";

        document.getElementById("inpLessonHtml").value = "";
        document.getElementById("inpLessonVideoUrl").value = "";
        document.getElementById("inpLessonPdfUrl").value = "";
    }
}

// ----------------------------
// SELECTED QUESTIONS (TEST)
// ----------------------------
function renderSelectedQuestions() {
    const list = document.getElementById("selectedQuestionsList");
    const countEl = document.getElementById("qCount");
    countEl.innerText = selectedQuestionIds.length;

    list.innerHTML = "";

    if (!selectedQuestionIds.length) {
        list.innerHTML = `<div class="text-muted p-2">Henüz soru seçilmedi.</div>`;
        return;
    }

    selectedQuestionIds.forEach((qid, idx) => {
        const q = questionCache.get(qid) || { id: qid, text: "(Soru metni cache'de yok)", category: "", legislationRef: {} };
        const text = (q.text || "").trim();

        const row = document.createElement("div");
        row.className = "d-flex justify-content-between align-items-center p-2 border-bottom bg-white mb-1";
        row.setAttribute("data-qid", qid);
        row.innerHTML = `
      <div style="min-width:0;">
        <span class="drag-handle" style="cursor:grab;">⠿</span>
        <span class="ms-2"><b>${idx + 1}.</b> ${escapeHtml(text.substring(0, 70))}${text.length > 70 ? "..." : ""}</span>
        <div class="text-muted" style="font-size:12px;">
          ${escapeHtml(q.category || "")} ${q.legislationRef?.code ? "• " + escapeHtml(q.legislationRef.code) : ""}
        </div>
      </div>
      <button class="btn btn-sm btn-danger py-0" title="Çıkar">×</button>
    `;

        row.querySelector("button").addEventListener("click", (e) => {
            e.preventDefault();
            removeQuestionById(qid);
        });

        list.appendChild(row);
    });

    // Sortable: reorder selectedQuestionIds from DOM
    if (typeof Sortable !== "undefined") {
        new Sortable(list, {
            animation: 150,
            handle: ".drag-handle",
            onEnd: () => {
                const ids = Array.from(list.querySelectorAll("[data-qid]")).map((el) => el.getAttribute("data-qid"));
                selectedQuestionIds = ids;
                selectedIdSet = new Set(ids);
                setDirty(true);
                renderSelectedQuestions(); // refresh numbering
            },
        });
    }
}

function removeQuestionById(qid) {
    selectedQuestionIds = selectedQuestionIds.filter((x) => x !== qid);
    selectedIdSet.delete(qid);
    setDirty(true);
    renderSelectedQuestions();
}

// ----------------------------
// QUESTION SELECTOR (POOL)
// ----------------------------
async function openQuestionSelector() {
    document.getElementById("questionSelectorModal").style.display = "flex";

    // reset pool state
    questionPool = [];
    poolCursor = null;
    poolHasMore = true;

    document.getElementById("searchPool").value = "";
    document.getElementById("poolCategoryFilter").value = "all";
    document.getElementById("poolLegislationFilter").value = "";

    // temp selection starts from current selected
    updatePoolSelectedCount();

    await loadMoreQuestionPool(true);
}

function closeQuestionSelector() {
    document.getElementById("questionSelectorModal").style.display = "none";
}

async function loadMoreQuestionPool(reset = false) {
    const list = document.getElementById("poolList");
    const btnMore = document.getElementById("btnLoadMorePool");

    if (reset) {
        list.innerHTML = "Yükleniyor...";
    } else {
        btnMore.disabled = true;
        btnMore.innerText = "Yükleniyor...";
    }

    try {
        // Base query: active questions, newest or any stable order.
        // Using orderBy("createdAt","desc") requires field existing. Safer: orderBy("text") not good.
        // We'll assume "createdAt" exists in your questions collection; if not, Firestore will throw.
        // In that case, quickly switch to orderBy("__name__") alternative (not available in modular import easily).
        let qBase = query(
            collection(db, "questions"),
            where("isActive", "==", true),
            orderBy("createdAt", "desc"),
            limit(60)
        );

        if (poolCursor) {
            qBase = query(
                collection(db, "questions"),
                where("isActive", "==", true),
                orderBy("createdAt", "desc"),
                startAfter(poolCursor),
                limit(60)
            );
        }

        const snap = await getDocs(qBase);

        if (reset) questionPool = [];

        if (snap.empty) {
            poolHasMore = false;
        } else {
            const docsArr = [];
            snap.forEach((d) => docsArr.push(d));
            poolCursor = docsArr[docsArr.length - 1];

            // push into pool and cache
            docsArr.forEach((d) => {
                const data = { id: d.id, ...d.data() };
                questionPool.push(data);
                questionCache.set(d.id, data);
            });

            if (docsArr.length < 60) poolHasMore = false;
        }

        renderQuestionPool();

        btnMore.style.display = poolHasMore ? "inline-block" : "none";
        btnMore.disabled = false;
        btnMore.innerText = "Daha fazla yükle";
    } catch (e) {
        // Fallback if createdAt orderBy fails
        console.error(e);

        // fallback 1: without orderBy (will fail if using startAfter), so single-shot:
        try {
            const snap = await getDocs(query(collection(db, "questions"), where("isActive", "==", true), limit(80)));
            questionPool = [];
            snap.forEach((d) => {
                const data = { id: d.id, ...d.data() };
                questionPool.push(data);
                questionCache.set(d.id, data);
            });
            poolHasMore = false;
            renderQuestionPool();
            btnMore.style.display = "none";
            toast("Not: createdAt alanı yoksa sayfalama kapatıldı. (Fallback)", "warn");
        } catch (e2) {
            alert("Soru havuzu yüklenemedi: " + e2.message);
        }
    }
}

function renderQuestionPool() {
    const list = document.getElementById("poolList");
    const search = (document.getElementById("searchPool").value || "").toLowerCase().trim();
    const cat = document.getElementById("poolCategoryFilter").value;
    const law = (document.getElementById("poolLegislationFilter").value || "").trim();

    list.innerHTML = "";

    const filtered = questionPool.filter((q) => {
        const text = ((q.text || "") + " " + (q.question || "")).toLowerCase(); // in case field differs
        const matchesSearch = !search || text.includes(search);

        const matchesCat = (cat === "all") || ((q.category || "").toLowerCase() === cat);
        const code = (q.legislationRef?.code || q.lawCode || "").toString();
        const matchesLaw = !law || code.includes(law);

        return matchesSearch && matchesCat && matchesLaw;
    });

    if (!filtered.length) {
        list.innerHTML = `<div class="text-muted p-2">Sonuç yok.</div>`;
        return;
    }

    filtered.forEach((q) => {
        const qid = q.id;
        const isSelected = selectedIdSet.has(qid);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `list-group-item list-group-item-action ${isSelected ? "active" : ""}`;
        btn.setAttribute("data-qid", qid);

        const snippet = ((q.text || q.question || "") + "").trim().substring(0, 110);

        btn.innerHTML = `
      <div class="d-flex justify-content-between">
        <small>${escapeHtml(q.category || "")}</small>
        <small>${escapeHtml(q.legislationRef?.code || "")}</small>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <div style="text-align:left; min-width:0;">
          ${escapeHtml(snippet)}${snippet.length >= 110 ? "..." : ""}
        </div>
        <div class="ms-2">
          <span class="badge ${isSelected ? "bg-success" : "bg-secondary"}">${isSelected ? "Seçili" : "Seç"}</span>
        </div>
      </div>
    `;

        btn.addEventListener("click", () => togglePoolSelect(qid));
        list.appendChild(btn);
    });

    updatePoolSelectedCount();
}

function togglePoolSelect(qid) {
    if (selectedIdSet.has(qid)) {
        // remove (but keep relative order)
        selectedIdSet.delete(qid);
        selectedQuestionIds = selectedQuestionIds.filter((x) => x !== qid);
    } else {
        selectedIdSet.add(qid);
        selectedQuestionIds.push(qid);
    }
    setDirty(true);
    renderQuestionPool();
    renderSelectedQuestions();
}

function selectAllVisibleInPool() {
    const visibleIds = Array.from(document.querySelectorAll("#poolList [data-qid]"))
        .map((el) => el.getAttribute("data-qid"));

    visibleIds.forEach((qid) => {
        if (!selectedIdSet.has(qid)) {
            selectedIdSet.add(qid);
            selectedQuestionIds.push(qid);
        }
    });

    setDirty(true);
    renderQuestionPool();
    renderSelectedQuestions();
}

function clearPoolTempSelection() {
    selectedQuestionIds = [];
    selectedIdSet = new Set();
    setDirty(true);
    renderQuestionPool();
    renderSelectedQuestions();
}

function applyPoolSelection() {
    // nothing extra needed; selection is live
    closeQuestionSelector();
    toast("Soru seçimi uygulandı.", "success");
}

function updatePoolSelectedCount() {
    const el = document.getElementById("poolSelectedCount");
    if (el) el.innerText = selectedQuestionIds.length;
}

// ----------------------------
// SAVE / DELETE / DUPLICATE CONTENT
// ----------------------------
async function saveCurrentContent() {
    const topicId = document.getElementById("editTopicId").value;
    const title = (document.getElementById("inpLessonTitle").value || "").trim();
    const type = document.getElementById("inpLessonType").value;

    if (!topicId) return alert("Önce ana konuyu kaydedin.");
    if (!title) return alert("Başlık gerekli.");

    const isActive = document.getElementById("inpLessonActive").value === "true";
    const manualOrderRaw = document.getElementById("inpLessonOrder").value;
    let orderVal = manualOrderRaw ? parseInt(manualOrderRaw, 10) : null;
    if (orderVal !== null && (Number.isNaN(orderVal) || orderVal < 1)) orderVal = null;

    // default: if updating keep old order, else max+1
    if (activeLessonId && !orderVal) {
        const old = currentLessons.find((x) => x.id === activeLessonId);
        orderVal = safeNum(old?.order) || 1;
    }
    if (!orderVal) orderVal = getNextLessonOrder();

    const baseData = {
        title,
        type,
        order: orderVal,
        isActive,
        updatedAt: serverTimestamp(),
    };

    // type-specific
    if (type === "test") {
        const storeSnapshot = document.getElementById("chkStoreSnapshot").checked;

        baseData.questionIds = [...selectedQuestionIds];
        baseData.qCount = selectedQuestionIds.length;
        baseData.storeSnapshot = !!storeSnapshot;

        if (storeSnapshot) {
            // snapshot is optional; only use cached data we have
            baseData.questions = selectedQuestionIds
                .map((qid) => questionCache.get(qid))
                .filter(Boolean)
                .map((q) => ({
                    id: q.id,
                    text: q.text || q.question || "",
                    options: q.options || [],
                    correctOption: q.correctOption || "",
                    solution: q.solution || {},
                    category: q.category || "",
                    legislationRef: q.legislationRef || {},
                }));
        } else {
            // avoid legacy snapshot unless user explicitly wants
            baseData.questions = null;
        }
    } else {
        baseData.contentHtml = document.getElementById("inpLessonHtml").value || "";
        baseData.videoUrl = (document.getElementById("inpLessonVideoUrl").value || "").trim();
        baseData.pdfUrl = (document.getElementById("inpLessonPdfUrl").value || "").trim();
    }

    try {
        if (activeLessonId) {
            await updateDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId), baseData);
            toast("İçerik güncellendi.", "success");
        } else {
            baseData.createdAt = serverTimestamp();
            const ref = await addDoc(collection(db, `topics/${topicId}/lessons`), baseData);

            // increment lessonCount
            await updateDoc(doc(db, "topics", topicId), {
                lessonCount: increment(1),
                updatedAt: serverTimestamp(),
            });

            activeLessonId = ref.id;
            toast("İçerik eklendi.", "success");
        }

        // If manual order caused conflicts, normalize
        await normalizeLessonOrders(topicId);
        await loadContents(topicId);

        // re-open the same item in editor (keeps context)
        if (activeLessonId) {
            await selectContent(activeLessonId);
        } else {
            showTopicMetaPanel();
        }

        setDirty(false);
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

async function deleteCurrentContent() {
    if (!activeLessonId) return;
    const topicId = document.getElementById("editTopicId").value;
    if (!topicId) return;

    if (!confirm("Silmek istediğinize emin misiniz?")) return;

    try {
        await deleteDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId));

        // decrement lessonCount
        await updateDoc(doc(db, "topics", topicId), {
            lessonCount: increment(-1),
            updatedAt: serverTimestamp(),
        });

        activeLessonId = null;
        activeLessonData = null;
        setDirty(false);

        await normalizeLessonOrders(topicId);
        await loadContents(topicId);

        showTopicMetaPanel();
        toast("Silindi.", "success");
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

async function duplicateCurrentContent() {
    const topicId = document.getElementById("editTopicId").value;
    if (!topicId) return alert("Önce konu kaydedilmeli.");
    if (!activeLessonId) return alert("Kopyalamak için önce bir içerik seç.");

    const src = currentLessons.find((x) => x.id === activeLessonId);
    if (!src) return alert("Kaynak içerik bulunamadı.");

    try {
        // fetch fresh
        const snap = await getDoc(doc(db, `topics/${topicId}/lessons`, activeLessonId));
        if (!snap.exists()) return alert("Kaynak içerik bulunamadı.");

        const data = snap.data();
        const copy = {
            ...data,
            title: (data.title || "İçerik") + " (Kopya)",
            order: getNextLessonOrder(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        const ref = await addDoc(collection(db, `topics/${topicId}/lessons`), copy);
        await updateDoc(doc(db, "topics", topicId), {
            lessonCount: increment(1),
            updatedAt: serverTimestamp(),
        });

        await normalizeLessonOrders(topicId);
        await loadContents(topicId);

        // open new copy
        await selectContent(ref.id);
        toast("Kopya oluşturuldu.", "success");
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

function getNextLessonOrder() {
    // robust max+1 from currentLessons
    const maxOrder = currentLessons.reduce((m, l) => Math.max(m, safeNum(l.order)), 0);
    return maxOrder + 1;
}

// ----------------------------
// SAVE TOPIC META
// ----------------------------
async function handleSaveTopicMeta() {
    const id = document.getElementById("editTopicId").value;

    const title = (document.getElementById("inpTopicTitle").value || "").trim();
    const category = document.getElementById("inpTopicCategory").value;
    const isActive = document.getElementById("inpTopicStatus").value === "true";
    let orderVal = parseInt(document.getElementById("inpTopicOrder").value, 10);
    if (Number.isNaN(orderVal) || orderVal < 1) orderVal = null;

    if (!title) return alert("Konu başlığı gerekli.");

    const data = {
        title,
        category,
        isActive,
        updatedAt: serverTimestamp(),
    };

    try {
        if (id) {
            // if order empty keep existing
            if (orderVal) data.order = orderVal;

            await updateDoc(doc(db, "topics", id), data);
            toast("Ana konu güncellendi.", "success");
        } else {
            if (!orderVal) orderVal = await getNextTopicOrder();
            data.order = orderVal;

            data.createdAt = serverTimestamp();
            data.lessonCount = 0;
            data.status = "active"; // legacy compatibility if you use it elsewhere

            const ref = await addDoc(collection(db, "topics"), data);
            document.getElementById("editTopicId").value = ref.id;
            toast("Ana konu oluşturuldu.", "success");

            // after creating, load contents area
            await loadContents(ref.id);
        }

        setDirty(false);
        await loadTopics();
    } catch (e) {
        alert("Hata: " + e.message);
    }
}

async function getNextTopicOrder() {
    // max+1 from topics collection
    const snap = await getDocs(query(collection(db, "topics"), orderBy("order", "desc"), limit(1)));
    if (snap.empty) return 1;
    const top = snap.docs[0].data();
    return safeNum(top.order) + 1;
}

// ----------------------------
// DIRTY GUARD + UTILITIES
// ----------------------------
function hookDirty(selector) {
    document.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("input", () => setDirty(true));
        el.addEventListener("change", () => setDirty(true));
    });
}

function setDirty(v) {
    isDirty = !!v;
    const badge = document.getElementById("dirtyBadge");
    if (badge) badge.style.display = isDirty ? "inline-block" : "none";
}

function confirmDiscardIfDirty() {
    if (!isDirty) return true;
    return confirm("Kaydedilmemiş değişiklikler var. Devam edersen kaybolacak. Devam?");
}

function toast(msg, type = "info") {
    // minimal, consistent with your admin UI; fallback alert if no toast system exists
    // If you already have a toast library, replace this function with your app's toast call.
    console.log(`[${type}] ${msg}`);
    // Lightweight UX: use alert only for errors
    if (type === "error") alert(msg);
}

function safeNum(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
}

function escapeHtml(str) {
    return (str ?? "")
        .toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
