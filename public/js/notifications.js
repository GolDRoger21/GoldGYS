let toastContainer;
let alertContainer;
let alertTimeout;

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

  const textSpan = document.createElement('span');
  textSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Kapat');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => toast.remove());

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  toastContainer.appendChild(toast);

  if (duration !== 'sticky') {
    setTimeout(() => toast.remove(), duration);
  }
}

export function showAlert(message, type = 'info', options = {}) {
  initNotificationContext();
  const { duration = 3800 } = options;

  alertContainer.textContent = message;
  alertContainer.className = `alert-banner ${type}`;
  alertContainer.classList.add('visible');

  if (duration !== 'sticky') {
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => alertContainer.classList.remove('visible'), duration);
  }
}
