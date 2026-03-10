import { initProfilePage } from "../../profile-page.js";

const PROFILE_STYLE_ID = "user-shell-profile-style";

function ensureProfileStyles() {
    if (document.getElementById(PROFILE_STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = PROFILE_STYLE_ID;
    link.rel = "stylesheet";
    link.href = "/css/profile.css";
    document.head.appendChild(link);
}

function renderProfileTemplate(viewEl) {
    viewEl.innerHTML = `
      <div class="dashboard-container profile-container-fix">
        <div class="profile-sidebar-col">
          <div class="profile-card">
            <div class="profile-cover"></div>
            <div class="profile-avatar-container">
              <img src="" alt="Avatar" id="profileAvatarMain" class="avatar-img" style="display:none;">
              <div class="avatar-placeholder" id="profileAvatarPlaceholder">?</div>
            </div>

            <h2 id="profileNameMain" class="p-name">Yukleniyor...</h2>
            <p id="profileRoleMain" class="p-role">...</p>

            <div class="p-stats-row">
              <div class="stat-item">
                <span class="val" id="statCompleted">0</span>
                <span class="lbl">Test</span>
              </div>
              <div class="stat-item">
                <span class="val" id="statScore">--</span>
                <span class="lbl">Ort.</span>
              </div>
            </div>

            <div class="p-badge">
              <span class="badge-label">Hedef:</span>
              <span class="badge-val" id="displayTarget">...</span>
            </div>
          </div>
        </div>

        <div class="profile-content-col">
          <div class="settings-card">
            <div class="tabs-header">
              <button class="tab-link active" data-tab="personal">Kisisel Bilgiler</button>
              <button class="tab-link" data-tab="security">Guvenlik</button>
            </div>

            <div id="tab-personal" class="tab-body active">
              <form id="profileForm">
                <div class="form-grid">
                  <div class="form-group"><label>Ad</label><input type="text" id="inpAd" required></div>
                  <div class="form-group"><label>Soyad</label><input type="text" id="inpSoyad" required></div>
                  <div class="form-group"><label>E-Posta</label><input type="email" id="inpEmail" disabled class="input-disabled"></div>
                  <div class="form-group"><label>Telefon</label><input type="tel" id="inpPhone"></div>
                  <div class="form-group"><label>Unvan</label><input type="text" id="inpTitle"></div>
                  <div class="form-group">
                    <label>Hedef Sinav</label>
                    <select id="inpExam">
                      <option value="">Seciniz</option>
                      <option value="Yazi Isleri Mudurlugu">Yazi Isleri Mudurlugu</option>
                      <option value="Icra Mudurlugu">Icra Mudurlugu</option>
                      <option value="Gorevde Yukselme">Gorevde Yukselme</option>
                      <option value="Unvan Degisikligi">Unvan Degisikligi</option>
                    </select>
                  </div>
                </div>
                <div class="form-footer">
                  <button type="submit" class="btn-primary">Degisiklikleri Kaydet</button>
                  <span id="saveMessage" class="status-msg"></span>
                </div>
              </form>
            </div>

            <div id="tab-security" class="tab-body">
              <div class="security-alert-box">
                <div class="security-icon" aria-hidden="true">&#128274;</div>
                <div class="security-content">
                  <h4>Sifre Yenileme</h4>
                  <p>Guvenliginiz icin sifrenizi periyodik olarak degistirin.</p>
                  <button id="btnResetPassword" class="btn-primary">Sifre Sifirlama E-postasi Gonder</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
}

export function createProfileShellModule({ viewEl }) {
    let initialized = false;
    const subscriptions = [];

    const clearSubscriptions = () => {
        subscriptions.splice(0).forEach((unsubscribe) => {
            if (typeof unsubscribe !== "function") return;
            try {
                unsubscribe();
            } catch {
                // noop
            }
        });
    };

    return {
        addSubscription(unsubscribe) {
            if (typeof unsubscribe === "function") subscriptions.push(unsubscribe);
        },
        async init() {
            if (initialized) return;
            ensureProfileStyles();
            renderProfileTemplate(viewEl);
            initProfilePage();
            initialized = true;
        },
        async activate() {
            if (!initialized) {
                await this.init();
            }
        },
        async deactivate() {
            clearSubscriptions();
        },
        async dispose() {
            clearSubscriptions();
        }
    };
}
