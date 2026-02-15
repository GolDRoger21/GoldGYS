import { db, auth } from "../../firebase-config.js";
import { requireAdminOrEditor } from "../../role-guard.js";
import { getConfigPublic } from "./utils.js";
import { mergeWithDefaultPublicConfig } from "../../config-defaults.js";
import { showToast, showConfirm } from "../../notifications.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

export async function init() {
    await requireAdminOrEditor();

    const section = document.getElementById("section-settings");
    if (!section) return;

    try {
        const response = await fetch("/admin/settings.html", { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Ayarlar görünümü yüklenemedi (HTTP ${response.status})`);
        }
        section.innerHTML = await response.text();

        setSidebarActive();
        bindTabSwitching();
        bindSaveButton();
        bindReloadButton();
        bindClearCacheButton();
        bindAssetUploadButtons();
        bindCategoryManager();
        await loadPublicConfigIntoForm();
    } catch (error) {
        console.error("Settings init error:", error);
        section.innerHTML = `<div class="alert alert-danger m-4">Ayarlar yüklenirken bir hata oluştu: ${error.message}</div>`;
    }
}

function setSidebarActive() {
    document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => item.classList.remove("active"));

    const settingsItem = document.querySelector('.sidebar-nav .nav-item[data-tab="settings"]');
    if (settingsItem) settingsItem.classList.add("active");
}

function bindTabSwitching() {
    const tabButtons = document.querySelectorAll("[data-settings-tab]");

    if (!tabButtons.length) return;

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const tabKey = button.dataset.settingsTab;

            // Update button styles
            tabButtons.forEach((btn) => {
                btn.classList.remove("btn-primary");
                btn.classList.add("btn-outline-secondary");
            });
            button.classList.remove("btn-outline-secondary");
            button.classList.add("btn-primary");

            // Hide all tabs
            document.querySelectorAll(".settings-tab-pane").forEach(pane => {
                pane.style.display = "none";
            });

            // Show selected tab
            const targetTab = document.getElementById(`tab-${tabKey}`);
            if (targetTab) {
                targetTab.style.display = "block";
            }
        });
    });
}

function bindSaveButton() {
    const saveBtn = document.getElementById("settingsSaveBtn");
    if (!saveBtn) return;

    saveBtn.addEventListener("click", async () => {
        await savePublicConfigFromForm();
    });
}

function bindReloadButton() {
    const reloadBtn = document.getElementById("settingsReloadBtn");
    if (!reloadBtn) return;

    reloadBtn.addEventListener("click", async () => {
        const confirmed = await showConfirm(
            "Kaydedilmemiş değişiklikler kaybolacak. Ayarları Firestore'dan yeniden yüklemek istediğinize emin misiniz?",
            { title: "Değişiklikleri Geri Al", confirmText: "Evet, Yükle", tone: "warning" }
        );

        if (confirmed) {
            const loaded = await loadPublicConfigIntoForm();
            if (loaded) showToast("Genel ayarlar Firestore'dan yeniden yüklendi.", "success");
        }
    });
}

function bindClearCacheButton() {
    const btn = document.getElementById("settingsClearCacheBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const confirmed = await showConfirm(
            "Tüm yerel veriler (localStorage, sessionStorage) temizlenecek ve sayfa yenilenecek. Devam edilsin mi?",
            { title: "Önbelleği Temizle", confirmText: "Evet, Temizle", tone: "warning" }
        );

        if (confirmed) {
            localStorage.clear();
            sessionStorage.clear();
            if ('caches' in window) {
                try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(key => caches.delete(key)));
                } catch (e) {
                    console.error("Cache storage temizlenirken hata:", e);
                }
            }
            window.location.reload(true);
        }
    });
}

function bindAssetUploadButtons() {
    bindAssetUpload({
        fileInputId: "settingsLogoFile",
        uploadButtonId: "settingsLogoUploadBtn",
        fileNameId: "settingsLogoFileName",
        previewImageId: "settingsLogoPreview",
        placeholderId: "settingsLogoPlaceholder",
        storagePathBase: "site-assets/branding/logo",
        maxSizeBytes: 1 * 1024 * 1024,
        updateData: (url) => ({ "branding.logoUrl": url }),
        assetKey: "branding.logoUrl",
        successMessage: "Logo başarıyla yüklendi.",
        assetLabel: "Logo",
        allowIco: false
    });

    bindAssetUpload({
        fileInputId: "settingsFaviconFile",
        uploadButtonId: "settingsFaviconUploadBtn",
        fileNameId: "settingsFaviconFileName",
        previewImageId: "settingsFaviconPreview",
        placeholderId: "settingsFaviconPlaceholder",
        storagePathBase: "site-assets/branding/favicon",
        maxSizeBytes: 1 * 1024 * 1024,
        updateData: (url) => ({ "branding.faviconUrl": url }),
        assetKey: "branding.faviconUrl",
        successMessage: "Favicon başarıyla yüklendi.",
        assetLabel: "Favicon",
        allowIco: true
    });

    bindAssetUpload({
        fileInputId: "settingsOgImageFile",
        uploadButtonId: "settingsOgImageUploadBtn",
        fileNameId: "settingsOgImageFileName",
        previewImageId: "settingsOgImagePreview",
        placeholderId: "settingsOgImagePlaceholder",
        storagePathBase: "site-assets/seo/og-image",
        maxSizeBytes: 2 * 1024 * 1024,
        updateData: (url) => ({ "seo.ogImageUrl": url }),
        assetKey: "seo.ogImageUrl",
        successMessage: "OG görseli başarıyla yüklendi.",
        assetLabel: "OG görseli",
        allowIco: false
    });
}

function bindAssetUpload({ fileInputId, uploadButtonId, fileNameId, previewImageId, placeholderId, storagePathBase, maxSizeBytes, updateData, assetKey, successMessage, assetLabel, allowIco }) {
    const fileInput = document.getElementById(fileInputId);
    const uploadButton = document.getElementById(uploadButtonId);
    const fileNameText = document.getElementById(fileNameId);
    if (!fileInput || !uploadButton) return;

    const setDefaultFileNameText = () => {
        if (fileNameText) fileNameText.textContent = "Dosya seçilmedi";
    };

    setDefaultFileNameText();

    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0] || null;

        uploadButton.disabled = !file;
        if (!file) {
            setDefaultFileNameText();
            return;
        }

        if (fileNameText) {
            fileNameText.textContent = file.name;
        }

        const validationError = validateImageFile(file, maxSizeBytes, allowIco);
        if (validationError) {
            showToast(validationError, "error");
            fileInput.value = "";
            uploadButton.disabled = true;
            setDefaultFileNameText();
            return;
        }

        showTemporaryPreview(file, previewImageId, placeholderId);
    });

    uploadButton.addEventListener("click", async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            showToast(`${assetLabel} için önce bir dosya seçin.`, "error");
            return;
        }

        const originalText = uploadButton.textContent;
        uploadButton.disabled = true;
        uploadButton.textContent = "Yükleniyor...";

        try {
            const oldUrl = await getCurrentAssetUrl(assetKey);
            await tryDeleteOldAsset(oldUrl);

            const extension = getFileExtension(file);
            const assetRef = ref(storage, `${storagePathBase}.${extension}`);
            await uploadBytes(assetRef, file, { contentType: file.type || undefined });
            const downloadUrl = await getDownloadURL(assetRef);

            await setDoc(doc(db, "config", "public"), {
                ...updateData(downloadUrl),
                meta: {
                    updatedAt: serverTimestamp(),
                    updatedBy: auth.currentUser?.uid || null
                }
            }, { merge: true });

            await loadPublicConfigIntoForm();
            fileInput.value = "";
            setDefaultFileNameText();
            showToast(successMessage, "success");
        } catch (error) {
            console.error(`${assetLabel} yüklenemedi:`, error);
            showToast(`${assetLabel} yüklenemedi: ${error.message}`, "error");
        } finally {
            uploadButton.disabled = !fileInput.files?.length;
            uploadButton.textContent = originalText;
        }
    });
}



function getByPath(obj, path) {
    if (!obj || !path) return undefined;

    return path
        .split(".")
        .reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), obj);
}

async function getCurrentAssetUrl(assetKey) {
    const config = await getConfigPublic();
    return getByPath(config, assetKey) || "";
}

function extractStoragePathFromDownloadUrl(url) {
    if (!url || typeof url !== "string") return null;

    try {
        const parsed = new URL(url);
        const marker = "/o/";
        const startIdx = parsed.pathname.indexOf(marker);
        if (startIdx === -1) return null;

        const encodedPath = parsed.pathname.slice(startIdx + marker.length);
        return encodedPath ? decodeURIComponent(encodedPath) : null;
    } catch {
        return null;
    }
}

async function tryDeleteOldAsset(oldUrl) {
    const objectPath = extractStoragePathFromDownloadUrl(oldUrl);
    if (!objectPath) return;

    try {
        await deleteObject(ref(storage, objectPath));
    } catch {
        // Ignore deletion errors to avoid blocking fresh upload.
    }
}

async function loadPublicConfigIntoForm() {
    try {
        const snapshot = await getDoc(doc(db, "config", "public"));
        const config = mergeWithDefaultPublicConfig(snapshot.exists() ? snapshot.data() : {});

        // Branding
        setFieldValue("settingsSiteName", config?.branding?.siteName || "");
        setFieldValue("settingsSlogan", config?.branding?.slogan || "");
        setFieldValue("settingsFooterText", config?.branding?.footerText || "");

        // Contact
        setFieldValue("settingsSupportEmail", config?.contact?.supportEmail || "");
        setFieldValue("settingsSupportPhone", config?.contact?.supportPhone || "");
        setFieldValue("settingsWhatsappUrl", config?.contact?.whatsappUrl || "");
        setFieldValue("settingsTelegramUrl", config?.contact?.telegramUrl || "");

        // Ticket Categories
        const rawCategories = config?.contact?.ticketCategories;
        ticketCategoriesState = []; // Reset state

        if (Array.isArray(rawCategories)) {
            ticketCategoriesState = rawCategories.map(item => {
                if (typeof item === 'string') return { value: item, label: item };
                return { value: item.value || item.label, label: item.label || item.value };
            }).filter(c => c.label);
        } else if (typeof rawCategories === 'string') {
            // Fallback for legacy string format if any
            // But we likely don't need this if we always save as array now.
            // Just in case:
            ticketCategoriesState = parseTicketCategories(rawCategories);
        }

        renderCategories();

        // SEO
        setFieldValue("settingsDefaultTitle", config?.seo?.defaultTitle || "");
        setFieldValue("settingsDefaultDescription", config?.seo?.defaultDescription || "");
        const keywords = config?.seo?.defaultKeywords;
        if (Array.isArray(keywords)) {
            setFieldValue("settingsDefaultKeywords", keywords.join(", "));
        } else {
            setFieldValue("settingsDefaultKeywords", keywords || "");
        }

        // Features
        setFieldValue("featureMaintenanceMode", config?.features?.maintenanceMode || false);
        setFieldValue("featureAllowRegistration", config?.features?.allowRegistration !== false); // Default true if undefined

        // Exam Rules
        setFieldValue("examRuleDefaultDuration", config?.examRules?.defaultDuration || 120);
        setFieldValue("examRuleTargetCount", config?.examRules?.targetQuestionCount || 80);
        setFieldValue("examRuleWrongImpact", config?.examRules?.wrongImpact || "0");

        // Images/Previews
        updatePreview("settingsLogoPreview", "settingsLogoPlaceholder", config?.branding?.logoUrl || "");
        updatePreview("settingsFaviconPreview", "settingsFaviconPlaceholder", config?.branding?.faviconUrl || "");
        updatePreview("settingsOgImagePreview", "settingsOgImagePlaceholder", config?.seo?.ogImageUrl || "");

        return true;
    } catch (error) {
        console.error("Genel ayarlar okunamadı:", error);
        showToast(`Ayarlar okunurken hata oluştu: ${error.message}`, "error");
        return false;
    }
}

async function savePublicConfigFromForm() {
    const saveBtn = document.getElementById("settingsSaveBtn");

    try {
        const siteName = getFieldValue("settingsSiteName").trim();
        const supportEmail = getFieldValue("settingsSupportEmail").trim();
        const whatsappUrl = getFieldValue("settingsWhatsappUrl").trim();
        const telegramUrl = getFieldValue("settingsTelegramUrl").trim();

        if (!siteName) {
            showToast("Site adı zorunludur.", "error");
            return;
        }

        if (supportEmail && !isValidEmail(supportEmail)) {
            showToast("Destek e-posta adresi geçersiz görünüyor.", "error");
            return;
        }

        if (whatsappUrl && !isValidUrl(whatsappUrl)) {
            showToast("WhatsApp linki geçersiz görünüyor.", "error");
            return;
        }

        if (telegramUrl && !isValidUrl(telegramUrl)) {
            showToast("Telegram linki geçersiz görünüyor.", "error");
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "Kaydediliyor...";
        }

        // Construct payload with dot notation to prevent overwriting nested fields (like images in branding)
        const payload = {
            "branding.siteName": getFieldValue("settingsSiteName").trim(),
            "branding.slogan": getFieldValue("settingsSlogan").trim(),
            "branding.footerText": getFieldValue("settingsFooterText").trim(),

            "contact.supportEmail": getFieldValue("settingsSupportEmail").trim(),
            "contact.supportPhone": getFieldValue("settingsSupportPhone").trim(),
            "contact.whatsappUrl": getFieldValue("settingsWhatsappUrl").trim(),
            "contact.telegramUrl": getFieldValue("settingsTelegramUrl").trim(),
            "contact.ticketCategories": ticketCategoriesState,

            "seo.defaultTitle": getFieldValue("settingsDefaultTitle").trim(),
            "seo.defaultDescription": getFieldValue("settingsDefaultDescription").trim(),
            "seo.defaultKeywords": parseKeywords(getFieldValue("settingsDefaultKeywords")),

            "features.maintenanceMode": getFieldValue("settingsMaintenanceMode"),
            "features.allowRegistration": getFieldValue("settingsAllowRegistration"),

            "examRules.defaultDuration": parseInt(getFieldValue("examRuleDefaultDuration")) || 0,
            "examRules.targetQuestionCount": parseInt(getFieldValue("examRuleTargetCount")) || 80,
            "examRules.wrongImpact": parseFloat(getFieldValue("examRuleWrongImpact")) || 0,
            "examRules.showResultImmediately": getFieldValue("examRuleShowResult"),

            "meta.updatedAt": serverTimestamp(),
            "meta.updatedBy": auth.currentUser?.uid || null
        };

        // Filter out empty keys if needed, or send as is (empty string updates are usually fine)
        // With merge: true and dot notation, specific fields are updated. 
        // Note: Field deletion via FieldValue.delete() is not implemented here, 
        // we assume empty string is a valid value for "clearing".

        await setDoc(doc(db, "config", "public"), payload, { merge: true });

        showToast("Ayarlar başarıyla kaydedildi.", "success");
        await loadPublicConfigIntoForm(); // Reload to ensure UI is in sync
    } catch (error) {
        console.error("Ayarlar kaydedilemedi:", error);
        showToast(`Ayarlar kaydedilemedi: ${error.message}`, "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Kaydet";
        }
    }
}

function updatePreview(imageId, placeholderId, url) {
    const img = document.getElementById(imageId);
    const placeholder = document.getElementById(placeholderId);
    if (!img || !placeholder) return;

    img.onerror = () => {
        img.removeAttribute("src");
        img.style.display = "none";
        placeholder.style.display = "block";
    };

    if (url) {
        img.src = url;
        img.style.display = "block";
        placeholder.style.display = "none";
    } else {
        img.removeAttribute("src");
        img.style.display = "none";
        placeholder.style.display = "block";
    }
}

function showTemporaryPreview(file, imageId, placeholderId) {
    const img = document.getElementById(imageId);
    const placeholder = document.getElementById(placeholderId);
    if (!img || !placeholder) return;

    const fileReader = new FileReader();
    fileReader.onload = () => {
        img.src = String(fileReader.result || "");
        img.style.display = "block";
        placeholder.style.display = "none";
    };
    fileReader.readAsDataURL(file);
}

function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (!field) return;

    if (field.type === 'checkbox') {
        field.checked = !!value;
    } else {
        field.value = value;
    }
}

function getFieldValue(id) {
    const field = document.getElementById(id);
    if (!field) return "";

    if (field.type === 'checkbox') {
        return field.checked;
    }
    return field.value;
}

function isValidEmail(value) {
    if (!value) return true; // Optional fields return true if empty
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUrl(value) {
    if (!value) return true; // Optional fields return true if empty
    try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function parseTicketCategories(value) {
    return (value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [rawValue, ...rest] = line.split("|");
            const categoryValue = (rawValue || "").trim();
            const categoryLabel = (rest.join("|") || rawValue || "").trim();
            if (!categoryValue || !categoryLabel) return null;
            return { value: categoryValue, label: categoryLabel };
        })
        .filter(Boolean);
}

function parseKeywords(value) {
    return (value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function validateImageFile(file, maxSizeBytes, allowIco = false) {
    const isImageMime = (file.type || "").startsWith("image/");
    const isIcoByExtension = allowIco && /\.ico$/i.test(file.name || "");

    if (!isImageMime && !isIcoByExtension) {
        return "Lütfen geçerli bir görsel dosyası seçin.";
    }

    if (file.size > maxSizeBytes) {
        const limitMb = maxSizeBytes / (1024 * 1024);
        return `Dosya boyutu ${limitMb}MB sınırını aşıyor.`;
    }

    return null;
}

function getFileExtension(file) {
    const fromName = (file.name || "").split(".").pop()?.toLowerCase();
    if (fromName) return fromName;

    const mime = (file.type || "").toLowerCase();
    if (mime.includes("png")) return "png";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("svg")) return "svg";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("icon")) return "ico";

    return "png";
}

// --- Ticket Category Manager ---
let ticketCategoriesState = [];

function bindCategoryManager() {
    const addBtn = document.getElementById("btnAddCategory");
    const input = document.getElementById("newCategoryLabel");

    if (addBtn && input) {
        addBtn.addEventListener("click", () => {
            const label = input.value.trim();
            if (label) {
                addCategory(label);
                input.value = "";
                input.focus();
            }
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                addBtn.click();
            }
        });
    }

    // Initial Render call is handled in loadPublicConfigIntoForm
}

function renderCategories() {
    const list = document.getElementById("categoryList");
    if (!list) return;

    list.innerHTML = "";

    if (ticketCategoriesState.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center small">Henüz konu eklenmedi.</li>';
        return;
    }

    ticketCategoriesState.forEach((cat, index) => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";

        const span = document.createElement("span");
        span.textContent = cat.label;

        const btnDelete = document.createElement("button");
        btnDelete.className = "btn btn-sm btn-outline-danger border-0";
        btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
        btnDelete.onclick = () => removeCategory(index);

        li.appendChild(span);
        li.appendChild(btnDelete);
        list.appendChild(li);
    });
}

function addCategory(label) {
    // Generate value/slug from label
    // e.g., "Teknik Destek" -> "Teknik Destek" (Simpler for users) OR "teknik-destek"
    // The previous system used "Value|Label". 
    // If we want to be professional, we can just use the label as both if simple, 
    // or try to slugify. Let's keep it simple: Value = Label (trimmed)
    // Avoid duplicates
    // Check if label exists
    if (ticketCategoriesState.some(c => c.label.toLowerCase() === label.toLowerCase())) {
        showToast("Bu konu zaten listede var.", "warning");
        return;
    }

    ticketCategoriesState.push({ value: label, label: label });
    renderCategories();
}

function removeCategory(index) {
    ticketCategoriesState.splice(index, 1);
    renderCategories();
}
