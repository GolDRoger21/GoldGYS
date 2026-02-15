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
        bindAssetUrlInputs();
        bindCategoryManager();
        bindLegalEditor();
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

            tabButtons.forEach((btn) => {
                btn.classList.remove("btn-primary", "is-active");
                btn.classList.add("btn-outline-secondary");
                btn.setAttribute("aria-selected", "false");
            });

            button.classList.remove("btn-outline-secondary");
            button.classList.add("btn-primary", "is-active");
            button.setAttribute("aria-selected", "true");

            document.querySelectorAll(".settings-tab-pane").forEach((pane) => {
                pane.classList.remove("is-active");
            });

            const targetTab = document.getElementById(`tab-${tabKey}`);
            if (targetTab) {
                targetTab.classList.add("is-active");
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

function bindAssetUrlInputs() {
    const bindings = [
        { inputId: "settingsLogoUrl", imageId: "settingsLogoPreview", placeholderId: "settingsLogoPlaceholder" },
        { inputId: "settingsFaviconUrl", imageId: "settingsFaviconPreview", placeholderId: "settingsFaviconPlaceholder" },
        { inputId: "settingsOgImageUrl", imageId: "settingsOgImagePreview", placeholderId: "settingsOgImagePlaceholder" }
    ];

    bindings.forEach(({ inputId, imageId, placeholderId }) => {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.addEventListener("input", () => {
            updatePreview(imageId, placeholderId, input.value.trim());
        });
    });
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
        setFieldValue("settingsLogoUrl", config?.branding?.logoUrl || "");
        setFieldValue("settingsFaviconUrl", config?.branding?.faviconUrl || "");
        setFieldValue("settingsOgImageUrl", config?.seo?.ogImageUrl || "");

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

        // Legal
        setFieldValue("settingsAcikRizaUrl", config?.legal?.acikRizaUrl || "");
        setFieldValue("settingsAydinlatmaMetniUrl", config?.legal?.aydinlatmaMetniUrl || "");
        setFieldValue("settingsGizlilikSozlesmesiUrl", config?.legal?.gizlilikSozlesmesiUrl || "");
        setFieldValue("settingsUyelikSozlesmesiUrl", config?.legal?.uyelikSozlesmesiUrl || "");
        setFieldValue("settingsKullanimSartlariUrl", config?.legal?.kullanimSartlariUrl || "");
        setFieldValue("settingsShowMembershipAgreementSeparately", config?.legal?.showMembershipAgreementSeparately !== false);

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
        setFieldValue("settingsMaintenanceMode", config?.features?.maintenanceMode || false);
        setFieldValue("settingsAllowRegistration", config?.features?.allowRegistration !== false); // Default true if undefined

        // Exam Rules
        setFieldValue("examRuleDefaultDuration", config?.examRules?.defaultDuration || 120);
        setFieldValue("examRuleTargetCount", config?.examRules?.targetQuestionCount || 80);
        setFieldValue("examRuleWrongImpact", config?.examRules?.wrongImpact || "0");
        setFieldValue("examRuleShowResult", config?.examRules?.showResultImmediately !== false);

        // System
        setSystemVersion(config?.system?.version || "-");
        setLastUpdateInfo(config?.meta || null);

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
        const logoUrl = getFieldValue("settingsLogoUrl").trim();
        const faviconUrl = getFieldValue("settingsFaviconUrl").trim();
        const ogImageUrl = getFieldValue("settingsOgImageUrl").trim();

        const legalUrls = [
            getFieldValue("settingsAcikRizaUrl").trim(),
            getFieldValue("settingsAydinlatmaMetniUrl").trim(),
            getFieldValue("settingsGizlilikSozlesmesiUrl").trim(),
            getFieldValue("settingsUyelikSozlesmesiUrl").trim(),
            getFieldValue("settingsKullanimSartlariUrl").trim()
        ];

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

        if (logoUrl && !isValidSiteUrl(logoUrl)) {
            showToast("Logo URL alanı geçersiz. Mutlak (https://) veya göreli (/path) bir adres girin.", "error");
            return;
        }

        if (faviconUrl && !isValidSiteUrl(faviconUrl)) {
            showToast("Favicon URL alanı geçersiz. Mutlak (https://) veya göreli (/path) bir adres girin.", "error");
            return;
        }

        if (ogImageUrl && !isValidSiteUrl(ogImageUrl)) {
            showToast("OG görsel URL alanı geçersiz. Mutlak (https://) veya göreli (/path) bir adres girin.", "error");
            return;
        }

        if (legalUrls.some((url) => url && !isValidSiteUrl(url))) {
            showToast("Yasal sayfa URL alanlarında geçersiz bir değer var. Mutlak veya göreli URL kullanın.", "error");
            return;
        }

        const duration = parsePositiveInt(getFieldValue("examRuleDefaultDuration"), 120, { min: 1, max: 360 });
        const targetCount = parsePositiveInt(getFieldValue("examRuleTargetCount"), 80, { min: 1, max: 500 });
        const wrongImpact = parseFloatOrDefault(getFieldValue("examRuleWrongImpact"), 0.25);

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "Kaydediliyor...";
        }

        // Construct payload with dot notation to prevent overwriting nested fields (like images in branding)
        const payload = {
            "branding.siteName": getFieldValue("settingsSiteName").trim(),
            "branding.slogan": getFieldValue("settingsSlogan").trim(),
            "branding.footerText": getFieldValue("settingsFooterText").trim(),
            "branding.logoUrl": logoUrl,
            "branding.faviconUrl": faviconUrl,

            "contact.supportEmail": getFieldValue("settingsSupportEmail").trim(),
            "contact.supportPhone": getFieldValue("settingsSupportPhone").trim(),
            "contact.whatsappUrl": getFieldValue("settingsWhatsappUrl").trim(),
            "contact.telegramUrl": getFieldValue("settingsTelegramUrl").trim(),
            "contact.ticketCategories": ticketCategoriesState,

            "seo.defaultTitle": getFieldValue("settingsDefaultTitle").trim(),
            "seo.defaultDescription": getFieldValue("settingsDefaultDescription").trim(),
            "seo.defaultKeywords": parseKeywords(getFieldValue("settingsDefaultKeywords")),
            "seo.ogImageUrl": ogImageUrl,

            "legal.acikRizaUrl": getFieldValue("settingsAcikRizaUrl").trim(),
            "legal.aydinlatmaMetniUrl": getFieldValue("settingsAydinlatmaMetniUrl").trim(),
            "legal.gizlilikSozlesmesiUrl": getFieldValue("settingsGizlilikSozlesmesiUrl").trim(),
            "legal.uyelikSozlesmesiUrl": getFieldValue("settingsUyelikSozlesmesiUrl").trim(),
            "legal.kullanimSartlariUrl": getFieldValue("settingsKullanimSartlariUrl").trim(),
            "legal.showMembershipAgreementSeparately": getFieldValue("settingsShowMembershipAgreementSeparately"),

            "features.maintenanceMode": getFieldValue("settingsMaintenanceMode"),
            "features.allowRegistration": getFieldValue("settingsAllowRegistration"),

            "examRules.defaultDuration": duration,
            "examRules.targetQuestionCount": targetCount,
            "examRules.wrongImpact": wrongImpact,
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

function isValidSiteUrl(value) {
    if (!value) return true;

    if (value.startsWith("/")) return true;
    return isValidUrl(value);
}

function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function parseFloatOrDefault(value, fallback) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : fallback;
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

    const countBadge = document.getElementById("categoryCountBadge");
    if (countBadge) {
        countBadge.textContent = `${ticketCategoriesState.length} konu`;
    }

    list.innerHTML = "";

    if (ticketCategoriesState.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center small">Henüz konu eklenmedi.</li>';
        return;
    }

    ticketCategoriesState.forEach((cat, index) => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center py-2";

        const span = document.createElement("span");
        span.textContent = cat.label;

        const btnDelete = document.createElement("button");
        btnDelete.className = "btn btn-sm btn-outline-danger";
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
    if (index < 0 || index >= ticketCategoriesState.length) return;
    ticketCategoriesState.splice(index, 1);
    renderCategories();
}

function setSystemVersion(version) {
    const versionElement = document.getElementById("settingsSystemVersion");
    if (!versionElement) return;
    versionElement.textContent = version;
}

function setLastUpdateInfo(meta) {
    const container = document.getElementById("settingsLastUpdateInfo");
    if (!container) return;

    const updatedBy = meta?.updatedBy || "bilinmiyor";
    const updatedAtRaw = meta?.updatedAt;
    const updatedAt = formatTimestamp(updatedAtRaw);

    if (!updatedAt) {
        container.innerHTML = '<i class="fas fa-clock me-2"></i> Henüz ayar güncellemesi kaydedilmemiş.';
        return;
    }

    container.innerHTML = `<i class="fas fa-clock me-2"></i> Son güncelleme: <strong>${updatedAt}</strong> · Güncelleyen: <code>${updatedBy}</code>`;
}

function formatTimestamp(value) {
    if (!value) return "";
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

// --- Ticket Category Manager ---
// ... (existing Manager Code) ...
// (I will preserve the existing manager code in the output, just appending new logic after it)

// --- Legal Page Editor ---
let quillEditor = null;
let currentLegalSlug = null;
let legalModalFallbackCleanup = null;
let legalModalTriggerElement = null;

function bindLegalEditor() {
    const modalEl = document.getElementById("legalEditorModal");
    if (modalEl) {
        modalEl.querySelectorAll('[data-bs-dismiss="modal"]').forEach((btn) => {
            btn.addEventListener("click", () => closeLegalModal(modalEl));
        });

        modalEl.addEventListener("click", (event) => {
            if (event.target === modalEl) {
                closeLegalModal(modalEl);
            }
        });
    }

    // Edit Buttons
    document.querySelectorAll(".btn-edit-content").forEach(btn => {
        btn.addEventListener("click", async () => {
            legalModalTriggerElement = btn;
            const slug = btn.dataset.slug;
            const title = btn.dataset.title;
            await openLegalEditor(slug, title);
        });
    });

    // Save Button
    const saveBtn = document.getElementById("btnSaveLegalContent");
    if (saveBtn) {
        saveBtn.addEventListener("click", saveLegalContent);
    }
}

async function loadQuillLibrary() {
    if (window.Quill) return;

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.quilljs.com/1.3.6/quill.snow.css";
    document.head.appendChild(link);

    // Load JS
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.quilljs.com/1.3.6/quill.js";
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

async function openLegalEditor(slug, title) {
    currentLegalSlug = slug;
    document.getElementById("legalEditorTitle").textContent = `${title} Düzenle`;

    // Show Modal
    const modalEl = document.getElementById("legalEditorModal");
    showLegalModal(modalEl);

    // Init Quill if needed
    if (!quillEditor) {
        await loadQuillLibrary();
        quillEditor = new Quill('#legalEditorContainer', {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['link', 'clean']
                ]
            }
        });
    }

    // Load Content
    quillEditor.setContents([]); // Clear
    quillEditor.setText("Yükleniyor...");
    quillEditor.disable();

    try {
        const docRef = doc(db, "legal_pages", slug);
        const snap = await getDoc(docRef);

        quillEditor.setText(""); // Clear loading text
        if (snap.exists() && snap.data().content) {
            // We store HTML, so use clipboard matchers or simple html insertion
            // Quill 1.3 doesn't have native HTML set, use clipboard
            const delta = quillEditor.clipboard.convert(snap.data().content);
            quillEditor.setContents(delta, 'silent');
        } else {
            // Try to fetch from the actual HTML file as fallback if it's the first time?
            // That's complex. Let's start empty or with a placeholder.
            // Or maybe user copies from existing page.
            // For now, start empty if no DB content.
        }
    } catch (error) {
        console.error("Error loading legal content:", error);
        showToast("İçerik yüklenirken hata oluştu.", "error");
    } finally {
        quillEditor.enable();
    }
}

async function saveLegalContent() {
    if (!quillEditor || !currentLegalSlug) return;

    const btn = document.getElementById("btnSaveLegalContent");
    const originalText = btn.textContent;
    btn.textContent = "Kaydediliyor...";
    btn.disabled = true;

    try {
        // Get HTML
        const html = quillEditor.root.innerHTML;

        await setDoc(doc(db, "legal_pages", currentLegalSlug), {
            content: html,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid || "admin",
            title: document.getElementById("legalEditorTitle").textContent.replace(" Düzenle", "")
        }, { merge: true });

        showToast("İçerik başarıyla güncellendi.", "success");

        // Hide Modal
        const modalEl = document.getElementById("legalEditorModal");
        closeLegalModal(modalEl);

    } catch (error) {
        console.error("Error saving legal content:", error);
        showToast("Kaydetme başarısız: " + error.message, "error");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function showLegalModal(modalEl) {
    if (!modalEl) return;

    const bootstrapModalApi = window.bootstrap?.Modal;
    if (bootstrapModalApi) {
        const modal = bootstrapModalApi.getOrCreateInstance(modalEl);
        modal.show();
        return;
    }

    modalEl.style.display = "block";
    modalEl.classList.add("show");
    modalEl.removeAttribute("aria-hidden");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("role", "dialog");
    document.body.classList.add("modal-open");

    const onKeydown = (event) => {
        if (event.key === "Escape") {
            closeLegalModal(modalEl);
        }
    };

    document.addEventListener("keydown", onKeydown);
    legalModalFallbackCleanup = () => {
        document.removeEventListener("keydown", onKeydown);
    };
}

function closeLegalModal(modalEl) {
    if (!modalEl) return;

    const bootstrapModalApi = window.bootstrap?.Modal;
    if (bootstrapModalApi) {
        const activeElement = document.activeElement;
        if (activeElement && modalEl.contains(activeElement)) {
            activeElement.blur();
        }
        const modal = bootstrapModalApi.getInstance(modalEl);
        if (modal) modal.hide();
        if (legalModalTriggerElement && typeof legalModalTriggerElement.focus === "function") {
            legalModalTriggerElement.focus();
        }
        return;
    }

    const activeElement = document.activeElement;
    if (activeElement && modalEl.contains(activeElement)) {
        activeElement.blur();
    }

    modalEl.classList.remove("show");
    modalEl.style.display = "none";
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.removeAttribute("aria-modal");
    document.body.classList.remove("modal-open");

    if (typeof legalModalFallbackCleanup === "function") {
        legalModalFallbackCleanup();
    }
    legalModalFallbackCleanup = null;

    if (legalModalTriggerElement && typeof legalModalTriggerElement.focus === "function") {
        legalModalTriggerElement.focus();
    }
}
