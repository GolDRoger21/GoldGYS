let toastContainer;
let alertContainer;
let alertTimeout;
let confirmOverlay;

function ensureContainer(element, id, className, attributes = {}) {
  if (element) return element;
  const node = document.createElement('div');
  node.id = id;
  node.className = className;
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  document.body.appendChild(node);
  return node;
}

export function initNotificationContext() {
  toastContainer = ensureContainer(
    toastContainer,
    'globalToastContainer',
    'toast-container',
    { 'aria-live': 'polite' }
  );

  alertContainer = ensureContainer(
    alertContainer,
    'globalAlertBanner',
    'alert-banner',
    { role: 'status' }
  );
}

export function showToast(message, type = 'info', options = {}) {
  initNotificationContext();
  const { duration = 3200 } = options;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = getNotificationSymbol(type);

  const content = document.createElement('div');
  content.className = 'toast-content';

  const textSpan = document.createElement('span');
  textSpan.className = 'toast-message';
  textSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Kapat');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => toast.remove());

  content.appendChild(textSpan);
  toast.appendChild(icon);
  toast.appendChild(content);
  toast.appendChild(closeBtn);
  toastContainer.appendChild(toast);

  if (duration !== 'sticky') {
    setTimeout(() => toast.remove(), duration);
  }
}

export function showAlert(message, type = 'info', options = {}) {
  initNotificationContext();
  const { duration = 3800 } = options;

  alertContainer.innerHTML = '';
  const icon = document.createElement('span');
  icon.className = 'alert-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = getNotificationSymbol(type);

  const text = document.createElement('span');
  text.className = 'alert-message';
  text.textContent = message;

  alertContainer.append(icon, text);
  alertContainer.className = `alert-banner ${type}`;
  alertContainer.classList.add('visible');

  if (duration !== 'sticky') {
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => alertContainer.classList.remove('visible'), duration);
  }
}

function getNotificationSymbol(type) {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '!';
    case 'warning':
      return '!';
    case 'info':
    default:
      return 'i';
  }
}

function removeConfirmOverlay() {
  if (confirmOverlay) {
    confirmOverlay.remove();
    confirmOverlay = null;
  }
}

export function showConfirm(message, options = {}) {
  const {
    title = 'Onay',
    confirmText = 'Onayla',
    cancelText = 'Vazgeç',
    tone = 'info'
  } = options;

  return new Promise((resolve) => {
    removeConfirmOverlay();

    confirmOverlay = document.createElement('div');
    confirmOverlay.className = 'confirm-overlay';
    confirmOverlay.setAttribute('role', 'dialog');
    confirmOverlay.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = `confirm-dialog ${tone}`;

    const heading = document.createElement('h3');
    heading.className = 'confirm-title';
    heading.textContent = title;

    const text = document.createElement('p');
    text.className = 'confirm-message';
    text.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'confirm-button ghost';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'confirm-button solid';
    confirmBtn.textContent = confirmText;

    actions.append(cancelBtn, confirmBtn);
    dialog.append(heading, text, actions);
    confirmOverlay.appendChild(dialog);
    document.body.appendChild(confirmOverlay);

    const cleanup = (result) => {
      removeConfirmOverlay();
      document.removeEventListener('keydown', handleKey);
      resolve(result);
    };

    const handleKey = (event) => {
      if (event.key === 'Escape') cleanup(false);
      if (event.key === 'Enter') cleanup(true);
    };

    confirmOverlay.addEventListener('click', (event) => {
      if (event.target === confirmOverlay) cleanup(false);
    });
    cancelBtn.addEventListener('click', () => cleanup(false));
    confirmBtn.addEventListener('click', () => cleanup(true));
    document.addEventListener('keydown', handleKey);

    confirmBtn.focus();
  });
}
