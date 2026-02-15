import { db, auth } from "../../firebase-config.js";
import { requireAdminOrEditor } from "../../role-guard.js";
import { showToast } from "../../notifications.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

const TAB_CONTENT = {
    seo: "SEO sekmesine özel gelişmiş ayarlar sonraki adımda eklenecek.",
    features: "Özellik bayrakları ayarları yakında.",
    examRules: "Sınav kuralları ayarları yakında.",
    system: "Sistem ayarları yakında."
};

export async function init() {
    await requireAdminOrEditor();

    const section = document.getElementById("section-settings");
    if (!section) return;

    const response = await fetch("/admin/settings.html", { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Ayarlar görünümü yüklenemedi (HTTP ${response.status})`);
    }

    section.innerHTML = await response.text();
    setSidebarActive();
    bindTabSwitching();
    bindSaveButton();
    bindReloadButton();
    bindAssetUploadButtons();
    await loadPublicConfigIntoForm();
}

function setSidebarActive() {
    document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => item.classList.remove("active"));

    const settingsItem = document.querySelector('.sidebar-nav .nav-item[data-tab="settings"]');
    if (settingsItem) settingsItem.classList.add("active");
}

function bindTabSwitching() {
    const tabButtons = document.querySelectorAll("[data-settings-tab]");
    const content = document.getElementById("settingsTabContent");
    const generalForm = document.getElementById("settingsGeneralForm");
    const saveBtn = document.getElementById("settingsSaveBtn");
    const reloadBtn = document.getElementById("settingsReloadBtn");

    if (!tabButtons.length || !content || !generalForm) return;

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const tabKey = button.dataset.settingsTab;

            tabButtons.forEach((btn) => {
                btn.classList.remove("btn-primary");
                btn.classList.add("btn-outline-secondary");
            });
            button.classList.remove("btn-outline-secondary");
            button.classList.add("btn-primary");

            const isGeneralTab = tabKey === "general";
            generalForm.style.display = isGeneralTab ? "flex" : "none";
            content.style.display = isGeneralTab ? "none" : "block";
            content.textContent = isGeneralTab
                ? ""
                : (TAB_CONTENT[tabKey] || "Bu alan yakında aktif olacak.");

            if (saveBtn) saveBtn.disabled = !isGeneralTab;
            if (reloadBtn) reloadBtn.disabled = !isGeneralTab;
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
        const loaded = await loadPublicConfigIntoForm();
        if (loaded) showToast("Genel ayarlar Firestore'dan yeniden yüklendi.", "success");
    });
}

function bindAssetUploadButtons() {
    bindAssetUpload({
        fileInputId: "settingsLogoFile",
        uploadButtonId: "settingsLogoUploadBtn",
        storagePathBase: "site-assets/branding/logo",
        maxSizeBytes: 1 * 1024 * 1024,
        updateData: (url) => ({ branding: { logoUrl: url } }),
        assetKey: "branding.logoUrl",
        successMessage: "Logo başarıyla yüklendi.",
        assetLabel: "Logo",
        allowIco: false
    });

    bindAssetUpload({
        fileInputId: "settingsFaviconFile",
        uploadButtonId: "settingsFaviconUploadBtn",
        storagePathBase: "site-assets/branding/favicon",
        maxSizeBytes: 1 * 1024 * 1024,
        updateData: (url) => ({ branding: { faviconUrl: url } }),
        assetKey: "branding.faviconUrl",
        successMessage: "Favicon başarıyla yüklendi.",
        assetLabel: "Favicon",
        allowIco: true
    });

    bindAssetUpload({
        fileInputId: "settingsOgImageFile",
        uploadButtonId: "settingsOgImageUploadBtn",
        storagePathBase: "site-assets/seo/og-image",
        maxSizeBytes: 2 * 1024 * 1024,
        updateData: (url) => ({ seo: { ogImageUrl: url } }),
        assetKey: "seo.ogImageUrl",
        successMessage: "OG görseli başarıyla yüklendi.",
        assetLabel: "OG görseli",
        allowIco: false
    });
}

function bindAssetUpload({ fileInputId, uploadButtonId, storagePathBase, maxSizeBytes, updateData, assetKey, successMessage, assetLabel, allowIco }) {
    const fileInput = document.getElementById(fileInputId);
    const uploadButton = document.getElementById(uploadButtonId);
    if (!fileInput || !uploadButton) return;

    uploadButton.addEventListener("click", async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            showToast(`${assetLabel} için önce bir dosya seçin.`, "error");
            return;
        }

        const validationError = validateImageFile(file, maxSizeBytes, allowIco);
        if (validationError) {
            showToast(validationError, "error");
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
            showToast(successMessage, "success");
        } catch (error) {
            console.error(`${assetLabel} yüklenemedi:`, error);
            showToast(`${assetLabel} yüklenemedi: ${error.message}`, "error");
        } finally {
            uploadButton.disabled = false;
            uploadButton.textContent = originalText;
        }
    });
}

async function getConfigPublic() {
    const snapshot = await getDoc(doc(db, "config", "public"));
    return snapshot.data() || {};
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
        const config = snapshot.exists() ? snapshot.data() : {};

        setFieldValue("settingsSiteName", config?.branding?.siteName || "");
        setFieldValue("settingsSlogan", config?.branding?.slogan || "");
        setFieldValue("settingsFooterText", config?.branding?.footerText || "");
        setFieldValue("settingsSupportEmail", config?.contact?.supportEmail || "");
        setFieldValue("settingsSupportPhone", config?.contact?.supportPhone || "");
        setFieldValue("settingsWhatsappUrl", config?.contact?.whatsappUrl || "");
        setFieldValue("settingsTelegramUrl", config?.contact?.telegramUrl || "");

        const ticketCategories = Array.isArray(config?.contact?.ticketCategories)
            ? config.contact.ticketCategories
                .map((item) => {
                    const value = (item?.value || "").trim();
                    const label = (item?.label || "").trim();
                    if (!value && !label) return "";
                    if (!label || label === value) return value;
                    return `${value}|${label}`;
                })
                .filter(Boolean)
                .join("\n")
            : "";
        setFieldValue("settingsTicketCategories", ticketCategories);
        setFieldValue("settingsDefaultTitle", config?.seo?.defaultTitle || "");
        setFieldValue("settingsDefaultDescription", config?.seo?.defaultDescription || "");

        const keywords = config?.seo?.defaultKeywords;
        if (Array.isArray(keywords)) {
            setFieldValue("settingsDefaultKeywords", keywords.join(", "));
        } else {
            setFieldValue("settingsDefaultKeywords", keywords || "");
        }

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

        const payload = {
            branding: {
                siteName,
                slogan: getFieldValue("settingsSlogan").trim(),
                footerText: getFieldValue("settingsFooterText").trim()
            },
            contact: {
                supportEmail,
                supportPhone: getFieldValue("settingsSupportPhone").trim(),
                whatsappUrl,
                telegramUrl,
                ticketCategories: parseTicketCategories(getFieldValue("settingsTicketCategories"))
            },
            seo: {
                defaultTitle: getFieldValue("settingsDefaultTitle").trim(),
                defaultDescription: getFieldValue("settingsDefaultDescription").trim(),
                defaultKeywords: parseKeywords(getFieldValue("settingsDefaultKeywords"))
            },
            meta: {
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || null
            }
        };

        await setDoc(doc(db, "config", "public"), payload, { merge: true });
        showToast("Genel ayarlar başarıyla kaydedildi.", "success");
    } catch (error) {
        console.error("Genel ayarlar kaydedilemedi:", error);
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

function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (field) field.value = value;
}

function getFieldValue(id) {
    const field = document.getElementById(id);
    return field ? field.value : "";
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUrl(value) {
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
