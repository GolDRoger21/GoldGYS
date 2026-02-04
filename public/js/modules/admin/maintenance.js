import { auth, db } from "../../firebase-config.js";
import { showConfirm, showToast } from "../../notifications.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CONFIG_DOC = doc(db, "maintenanceConfig", "main");
const LOGS_COLLECTION = collection(db, "maintenanceLogs");
const TASKS_COLLECTION = collection(db, "maintenanceTasks");

const QUICK_ACTIONS = [
    {
        id: "cache",
        label: "Önbellek Temizliği",
        button: "🧹 Önbellek Temizle",
        summaryKey: "lastCacheClearAt"
    },
    {
        id: "backup",
        label: "Yedekleme",
        button: "💾 Yedek Alındı",
        summaryKey: "lastBackupAt"
    },
    {
        id: "index",
        label: "İndeks Yenileme",
        button: "🧭 İndeks Yenile",
        summaryKey: "lastIndexRebuildAt"
    },
    {
        id: "health",
        label: "Sağlık Kontrolü",
        button: "🩺 Sağlık Kontrolü",
        summaryKey: "lastHealthCheckAt"
    },
    {
        id: "security",
        label: "Erişim Denetimi",
        button: "🔐 Erişim Denetimi",
        summaryKey: "lastSecurityAuditAt"
    },
    {
        id: "performance",
        label: "Performans Raporu",
        button: "📊 Performans Raporu",
        summaryKey: "lastPerformanceAuditAt"
    },
    {
        id: "content",
        label: "İçerik Tutarlılık Taraması",
        button: "🧾 İçerik Taraması",
        summaryKey: "lastContentAuditAt"
    },
    {
        id: "billing",
        label: "Faturalandırma Kontrolü",
        button: "💳 Faturalandırma Kontrolü",
        summaryKey: "lastBillingCheckAt"
    }
];

let hasRendered = false;
let hasBoundEvents = false;

export async function initMaintenancePage() {
    renderInterface();
    bindEvents();
    await Promise.all([loadConfig(), loadTasks(), loadLogs()]);
}

function renderInterface() {
    const container = document.getElementById("section-maintenance");
    if (!container || hasRendered) return;

    container.innerHTML = `
        <div class="section-header">
            <h2>🛠️ Bakım Merkezi</h2>
            <p class="text-muted">Sistem bakımını planlayın, kayıt altına alın ve kritik aksiyonları tek panelden yönetin.</p>
        </div>

        <div class="maintenance-grid">
            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>🔧 Bakım Modu</h3>
                        <p class="text-muted">Kullanıcıları planlı bakım penceresinde bilgilendirin.</p>
                    </div>
                    <span id="maintenanceModeBadge" class="badge badge-secondary">Kapalı</span>
                </div>
                <form id="maintenanceModeForm" class="form-stack">
                    <label class="form-check">
                        <input type="checkbox" id="maintenanceModeToggle">
                        <span>Bakım modunu aktif et</span>
                    </label>
                    <div class="form-row">
                        <label class="form-label">Bakım Mesajı</label>
                        <textarea id="maintenanceMessage" class="form-control" rows="3" placeholder="Örn: 22:00-23:30 arası bakım yapılacaktır."></textarea>
                    </div>
                    <div class="form-row two-col">
                        <div>
                            <label class="form-label">Başlangıç</label>
                            <input type="datetime-local" id="maintenanceWindowStart" class="form-control">
                        </div>
                        <div>
                            <label class="form-label">Bitiş</label>
                            <input type="datetime-local" id="maintenanceWindowEnd" class="form-control">
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-primary" id="maintenanceSaveBtn">💾 Kaydet</button>
                    </div>
                </form>
            </div>

            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>⚡ Hızlı Aksiyonlar</h3>
                        <p class="text-muted">Tek tıkla bakım aksiyonu ekleyin ve günlüğe kaydedin.</p>
                    </div>
                </div>
                <div class="maintenance-actions">
                    ${QUICK_ACTIONS.map((action) => `
                        <button class="btn btn-secondary" data-maintenance-action="${action.id}" data-label="${action.label}">
                            ${action.button}
                        </button>
                    `).join("")}
                </div>
                <div class="maintenance-summary">
                    <div>
                        <span class="text-muted">Son Yedek:</span>
                        <strong id="maintenanceLastBackup">-</strong>
                    </div>
                    <div>
                        <span class="text-muted">Son Önbellek Temizliği:</span>
                        <strong id="maintenanceLastCache">-</strong>
                    </div>
                    <div>
                        <span class="text-muted">Son İndeks Yenileme:</span>
                        <strong id="maintenanceLastIndex">-</strong>
                    </div>
                    <div>
                        <span class="text-muted">Son Sağlık Kontrolü:</span>
                        <strong id="maintenanceLastHealth">-</strong>
                    </div>
                    <div>
                        <span class="text-muted">Son Erişim Denetimi:</span>
                        <strong id="maintenanceLastSecurity">-</strong>
                    </div>
                    <div>
                        <span class="text-muted">Son Performans Raporu:</span>
                        <strong id="maintenanceLastPerformance">-</strong>
                    </div>
                    <div>
                        <span class="text-muted">Son İçerik Taraması:</span>
                        <strong id="maintenanceLastContent">-</strong>
                    </div>
                    <div>
                        <span class="text-muted">Son Faturalandırma Kontrolü:</span>
                        <strong id="maintenanceLastBilling">-</strong>
                    </div>
                </div>
            </div>

            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>📌 Bakım Rehberi</h3>
                        <p class="text-muted">Günlük/haftalık yapılması önerilen kontrol listesi.</p>
                    </div>
                </div>
                <ul class="maintenance-checklist">
                    <li>Günlük: Bildirim kuyruğunu ve hata raporlarını kontrol edin.</li>
                    <li>Haftalık: Önbellek temizliği + kritik sayfa performans raporu.</li>
                    <li>Aylık: Yedekleri doğrulayın, erişim yetkilerini denetleyin.</li>
                    <li>Periyodik: Deneme ve içerik tutarlılık taraması yapın.</li>
                    <li>3 Aylık: Faturalandırma limitlerini ve kullanım trendlerini gözden geçirin.</li>
                </ul>
                <div class="maintenance-note">
                    Bu panelde oluşturduğunuz görev ve loglar ekip içi takip için saklanır.
                </div>
            </div>
        </div>

        <div class="maintenance-grid mt-4">
            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>🗂️ Planlı Bakım Görevleri</h3>
                        <p class="text-muted">Planlı işleri oluşturun, takip edin ve tamamlandı olarak işaretleyin.</p>
                    </div>
                </div>
                <form id="maintenanceTaskForm" class="form-stack">
                    <div class="form-row">
                        <label class="form-label">Görev Başlığı</label>
                        <input type="text" id="maintenanceTaskTitle" class="form-control" placeholder="Örn: Haftalık yedek kontrolü" required>
                    </div>
                    <div class="form-row two-col">
                        <div>
                            <label class="form-label">Sıklık</label>
                            <select id="maintenanceTaskFrequency" class="form-control">
                                <option value="daily">Günlük</option>
                                <option value="weekly">Haftalık</option>
                                <option value="monthly">Aylık</option>
                                <option value="quarterly">3 Aylık</option>
                                <option value="yearly">Yıllık</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label">Öncelik</label>
                            <select id="maintenanceTaskPriority" class="form-control">
                                <option value="high">Yüksek</option>
                                <option value="medium" selected>Orta</option>
                                <option value="low">Düşük</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row two-col">
                        <div>
                            <label class="form-label">Hedef Tarih</label>
                            <input type="date" id="maintenanceTaskDueDate" class="form-control">
                        </div>
                        <div>
                            <label class="form-label">Notlar</label>
                            <input type="text" id="maintenanceTaskNotes" class="form-control" placeholder="Opsiyonel açıklama">
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">➕ Görev Ekle</button>
                    </div>
                </form>

                <div class="table-responsive">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Görev</th>
                                <th>Sıklık</th>
                                <th>Öncelik</th>
                                <th>Durum</th>
                                <th class="text-end">İşlem</th>
                            </tr>
                        </thead>
                        <tbody id="maintenanceTasksBody"></tbody>
                    </table>
                </div>
            </div>

            <div class="card p-4">
                <div class="card-header">
                    <div>
                        <h3>📒 Bakım Günlüğü</h3>
                        <p class="text-muted">Son bakım aksiyonlarının kayıtlarını görüntüleyin.</p>
                    </div>
                </div>
                <div id="maintenanceLogsList" class="maintenance-log-list">
                    <div class="text-muted">Yükleniyor...</div>
                </div>
            </div>
        </div>
    `;

    hasRendered = true;
}

function bindEvents() {
    if (hasBoundEvents) return;

    const saveBtn = document.getElementById("maintenanceSaveBtn");
    if (saveBtn) saveBtn.addEventListener("click", handleSaveConfig);

    const actionButtons = document.querySelectorAll("[data-maintenance-action]");
    actionButtons.forEach((btn) => {
        btn.addEventListener("click", () => handleQuickAction(btn));
    });

    const taskForm = document.getElementById("maintenanceTaskForm");
    if (taskForm) {
        taskForm.addEventListener("submit", handleTaskSubmit);
    }

    const tasksBody = document.getElementById("maintenanceTasksBody");
    if (tasksBody) {
        tasksBody.addEventListener("click", handleTaskAction);
    }

    hasBoundEvents = true;
}

async function loadConfig() {
    const modeToggle = document.getElementById("maintenanceModeToggle");
    const messageInput = document.getElementById("maintenanceMessage");
    const windowStart = document.getElementById("maintenanceWindowStart");
    const windowEnd = document.getElementById("maintenanceWindowEnd");

    try {
        const snap = await getDoc(CONFIG_DOC);
        const data = snap.exists() ? snap.data() : {};

        if (modeToggle) modeToggle.checked = !!data.maintenanceMode;
        if (messageInput) messageInput.value = data.message || "";
        if (windowStart) windowStart.value = toLocalInputValue(data.windowStart);
        if (windowEnd) windowEnd.value = toLocalInputValue(data.windowEnd);

        updateMaintenanceBadge(!!data.maintenanceMode, data.windowStart, data.windowEnd);
        updateSummary({
            lastBackupAt: data.lastBackupAt,
            lastCacheClearAt: data.lastCacheClearAt,
            lastIndexRebuildAt: data.lastIndexRebuildAt,
            lastHealthCheckAt: data.lastHealthCheckAt,
            lastSecurityAuditAt: data.lastSecurityAuditAt,
            lastPerformanceAuditAt: data.lastPerformanceAuditAt,
            lastContentAuditAt: data.lastContentAuditAt,
            lastBillingCheckAt: data.lastBillingCheckAt
        });

        // Preview button handler (dynamic inject if missing)
        let previewBtn = document.getElementById("maintenancePreviewBtn");
        if (!previewBtn) {
            const formActions = document.querySelector("#maintenanceModeForm .form-actions");
            if (formActions) {
                previewBtn = document.createElement("button");
                previewBtn.type = "button";
                previewBtn.id = "maintenancePreviewBtn";
                previewBtn.className = "btn btn-outline-secondary";
                previewBtn.innerHTML = "👁️ Önizle";
                previewBtn.style.marginLeft = "10px";
                previewBtn.onclick = () => window.open("/maintenance.html?force=true", "_blank");
                formActions.appendChild(previewBtn);
            }
        }

    } catch (error) {
        console.error("Bakım ayarları yüklenemedi:", error);
        showToast("Bakım ayarları yüklenemedi.", "error");
    }
}

async function handleSaveConfig() {
    const modeToggle = document.getElementById("maintenanceModeToggle");
    const messageInput = document.getElementById("maintenanceMessage");
    const windowStart = document.getElementById("maintenanceWindowStart");
    const windowEnd = document.getElementById("maintenanceWindowEnd");

    const payload = {
        maintenanceMode: !!modeToggle?.checked,
        message: messageInput?.value?.trim() || "",
        windowStart: parseDateInput(windowStart?.value),
        windowEnd: parseDateInput(windowEnd?.value),
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserLabel()
    };

    try {
        await setDoc(CONFIG_DOC, payload, { merge: true });
        updateMaintenanceBadge(payload.maintenanceMode, payload.windowStart, payload.windowEnd);
        showToast("Bakım ayarları güncellendi.", "success");
    } catch (error) {
        console.error("Bakım ayarları kaydedilemedi:", error);
        showToast("Bakım ayarları kaydedilemedi.", "error");
    }
}

async function handleQuickAction(button) {
    const action = button.dataset.maintenanceAction;
    const label = button.dataset.label || "Bakım aksiyonu";
    if (!action) return;

    const shouldProceed = await showConfirm(`${label} işlemini günlüğe eklemek istiyor musunuz?`, {
        title: "Bakım Aksiyonu",
        confirmText: "Kaydet",
        cancelText: "Vazgeç"
    });
    if (!shouldProceed) return;

    try {
        await addDoc(LOGS_COLLECTION, {
            action,
            label,
            status: "completed",
            createdAt: serverTimestamp(),
            createdBy: getCurrentUserLabel()
        });

        const updateFields = {
            updatedAt: serverTimestamp()
        };

        const actionConfig = QUICK_ACTIONS.find((entry) => entry.id === action);
        if (actionConfig?.summaryKey) {
            updateFields[actionConfig.summaryKey] = serverTimestamp();
        }

        await setDoc(CONFIG_DOC, updateFields, { merge: true });
        await Promise.all([loadConfig(), loadLogs()]);
        showToast("Bakım aksiyonu kaydedildi.", "success");
    } catch (error) {
        console.error("Bakım aksiyonu kaydedilemedi:", error);
        showToast("Bakım aksiyonu kaydedilemedi.", "error");
    }
}

async function handleTaskSubmit(event) {
    event.preventDefault();

    const titleEl = document.getElementById("maintenanceTaskTitle");
    const frequencyEl = document.getElementById("maintenanceTaskFrequency");
    const priorityEl = document.getElementById("maintenanceTaskPriority");
    const dueDateEl = document.getElementById("maintenanceTaskDueDate");
    const notesEl = document.getElementById("maintenanceTaskNotes");

    if (!titleEl?.value.trim()) {
        showToast("Görev başlığı zorunludur.", "error");
        return;
    }

    try {
        await addDoc(TASKS_COLLECTION, {
            title: titleEl.value.trim(),
            frequency: frequencyEl?.value || "weekly",
            priority: priorityEl?.value || "medium",
            dueDate: parseDateInput(dueDateEl?.value),
            notes: notesEl?.value?.trim() || "",
            status: "planned",
            createdAt: serverTimestamp(),
            createdBy: getCurrentUserLabel()
        });

        titleEl.value = "";
        if (notesEl) notesEl.value = "";
        if (dueDateEl) dueDateEl.value = "";
        showToast("Görev eklendi.", "success");
        await loadTasks();
    } catch (error) {
        console.error("Görev eklenemedi:", error);
        showToast("Görev eklenemedi.", "error");
    }
}

async function handleTaskAction(event) {
    const button = event.target.closest("button[data-task-action]");
    if (!button) return;

    const action = button.dataset.taskAction;
    const docId = button.dataset.taskId;
    if (!docId) return;

    const docRef = doc(db, "maintenanceTasks", docId);

    if (action === "complete") {
        try {
            await updateDoc(docRef, {
                status: "completed",
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            showToast("Görev tamamlandı olarak işaretlendi.", "success");
            await loadTasks();
        } catch (error) {
            console.error("Görev güncellenemedi:", error);
            showToast("Görev güncellenemedi.", "error");
        }
        return;
    }

    if (action === "delete") {
        const shouldDelete = await showConfirm("Görevi silmek istediğinize emin misiniz?", {
            title: "Görev Sil",
            confirmText: "Sil",
            cancelText: "Vazgeç"
        });
        if (!shouldDelete) return;

        try {
            await deleteDoc(docRef);
            showToast("Görev silindi.", "success");
            await loadTasks();
        } catch (error) {
            console.error("Görev silinemedi:", error);
            showToast("Görev silinemedi.", "error");
        }
    }
}

async function loadTasks() {
    const body = document.getElementById("maintenanceTasksBody");
    if (!body) return;

    try {
        const q = query(TASKS_COLLECTION, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        if (snap.empty) {
            body.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">Henüz bakım görevi oluşturulmadı.</td>
                </tr>
            `;
            return;
        }

        body.innerHTML = snap.docs.map((docSnap) => {
            const data = docSnap.data();
            const statusBadge = data.status === "completed"
                ? "<span class=\"badge badge-success\">Tamamlandı</span>"
                : "<span class=\"badge badge-warning\">Planlandı</span>";

            const priorityLabel = getPriorityLabel(data.priority);
            const frequencyLabel = getFrequencyLabel(data.frequency);

            return `
                <tr>
                    <td>
                        <div class="maintenance-task-title">${escapeHtml(data.title || "-")}</div>
                        <div class="text-muted small">${escapeHtml(data.notes || "")}</div>
                    </td>
                    <td>${frequencyLabel}</td>
                    <td>${priorityLabel}</td>
                    <td>${statusBadge}</td>
                    <td class="text-end">
                        <div class="maintenance-task-actions">
                            ${data.status !== "completed" ? `<button class="btn btn-success btn-sm" data-task-action="complete" data-task-id="${docSnap.id}">Tamamla</button>` : ""}
                            <button class="btn btn-danger btn-sm" data-task-action="delete" data-task-id="${docSnap.id}">Sil</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        console.error("Görevler yüklenemedi:", error);
        body.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted">Görevler yüklenemedi.</td>
            </tr>
        `;
    }
}

async function loadLogs() {
    const container = document.getElementById("maintenanceLogsList");
    if (!container) return;

    try {
        const q = query(LOGS_COLLECTION, orderBy("createdAt", "desc"), limit(10));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `<div class="text-muted">Henüz bakım kaydı yok.</div>`;
            return;
        }

        container.innerHTML = snap.docs.map((docSnap) => {
            const data = docSnap.data();
            const statusClass = data.status === "completed" ? "badge-success" : "badge-warning";
            const createdAt = formatDate(data.createdAt);

            return `
                <div class="maintenance-log-item">
                    <div>
                        <div class="maintenance-log-title">${escapeHtml(data.label || data.action || "Bakım")}</div>
                        <div class="text-muted small">${createdAt}${data.createdBy ? ` • ${escapeHtml(data.createdBy)}` : ""}</div>
                    </div>
                    <span class="badge ${statusClass}">${data.status === "completed" ? "Tamamlandı" : "Planlandı"}</span>
                </div>
            `;
        }).join("");
    } catch (error) {
        console.error("Bakım logları yüklenemedi:", error);
        container.innerHTML = `<div class="text-muted">Bakım logları yüklenemedi.</div>`;
    }
}

function updateMaintenanceBadge(isActive, windowStart, windowEnd) {
    const badge = document.getElementById("maintenanceModeBadge");
    if (!badge) return;

    if (isActive) {
        badge.className = "badge badge-success";
        const startLabel = formatDate(windowStart);
        const endLabel = formatDate(windowEnd);
        badge.textContent = windowStart || windowEnd ? `Aktif • ${startLabel} - ${endLabel}` : "Aktif";
    } else {
        badge.className = "badge badge-secondary";
        badge.textContent = "Kapalı";
    }
}

function updateSummary({
    lastBackupAt,
    lastCacheClearAt,
    lastIndexRebuildAt,
    lastHealthCheckAt,
    lastSecurityAuditAt,
    lastPerformanceAuditAt,
    lastContentAuditAt,
    lastBillingCheckAt
}) {
    const lastBackupEl = document.getElementById("maintenanceLastBackup");
    const lastCacheEl = document.getElementById("maintenanceLastCache");
    const lastIndexEl = document.getElementById("maintenanceLastIndex");
    const lastHealthEl = document.getElementById("maintenanceLastHealth");
    const lastSecurityEl = document.getElementById("maintenanceLastSecurity");
    const lastPerformanceEl = document.getElementById("maintenanceLastPerformance");
    const lastContentEl = document.getElementById("maintenanceLastContent");
    const lastBillingEl = document.getElementById("maintenanceLastBilling");

    if (lastBackupEl) lastBackupEl.textContent = formatDate(lastBackupAt);
    if (lastCacheEl) lastCacheEl.textContent = formatDate(lastCacheClearAt);
    if (lastIndexEl) lastIndexEl.textContent = formatDate(lastIndexRebuildAt);
    if (lastHealthEl) lastHealthEl.textContent = formatDate(lastHealthCheckAt);
    if (lastSecurityEl) lastSecurityEl.textContent = formatDate(lastSecurityAuditAt);
    if (lastPerformanceEl) lastPerformanceEl.textContent = formatDate(lastPerformanceAuditAt);
    if (lastContentEl) lastContentEl.textContent = formatDate(lastContentAuditAt);
    if (lastBillingEl) lastBillingEl.textContent = formatDate(lastBillingCheckAt);
}

function formatDate(value) {
    if (!value) return "-";
    const date = value.toDate ? value.toDate() : value instanceof Date ? value : null;
    if (!date || Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("tr-TR");
}

function toLocalInputValue(value) {
    if (!value) return "";
    const date = value.toDate ? value.toDate() : value instanceof Date ? value : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function parseDateInput(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function getCurrentUserLabel() {
    const user = auth.currentUser;
    if (!user) return "Bilinmiyor";
    return user.displayName || user.email || user.uid;
}

function getPriorityLabel(priority) {
    switch (priority) {
        case "high":
            return "Yüksek";
        case "low":
            return "Düşük";
        default:
            return "Orta";
    }
}

function getFrequencyLabel(frequency) {
    switch (frequency) {
        case "daily":
            return "Günlük";
        case "weekly":
            return "Haftalık";
        case "monthly":
            return "Aylık";
        case "quarterly":
            return "3 Aylık";
        case "yearly":
            return "Yıllık";
        default:
            return "-";
    }
}

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => {
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return map[char] || char;
    });
}
