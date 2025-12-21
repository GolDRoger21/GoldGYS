const overlayModal = document.querySelector('[data-overlay="modal"]');
const overlayDrawer = document.querySelector('[data-overlay="drawer"]');
const toast = document.querySelector('.ui-toast');

function toggleOverlay(overlay, open) {
  if (!overlay) return;
  overlay.classList.toggle('open', open);
}

function bindTriggers() {
  document.querySelectorAll('[data-action="open-modal"]').forEach(btn =>
    btn.addEventListener('click', () => toggleOverlay(overlayModal, true))
  );

  document.querySelectorAll('[data-action="close-modal"]').forEach(btn =>
    btn.addEventListener('click', () => toggleOverlay(overlayModal, false))
  );

  document.querySelectorAll('[data-action="open-drawer"]').forEach(btn =>
    btn.addEventListener('click', () => toggleOverlay(overlayDrawer, true))
  );

  document.querySelectorAll('[data-action="close-drawer"]').forEach(btn =>
    btn.addEventListener('click', () => toggleOverlay(overlayDrawer, false))
  );

  document.addEventListener('click', event => {
    if (event.target.dataset.action === 'show-toast') {
      showToast();
    }
  });
}

function bindTabs() {
  const tabs = document.querySelectorAll('.ui-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.ui-tab').forEach(btn => btn.classList.toggle('active', btn === tab));
      document.querySelectorAll('.ui-tab-panels > div').forEach(panel =>
        panel.classList.toggle('active', panel.id === target)
      );
    });
  });
}

function bindPagination() {
  const buttons = document.querySelectorAll('.ui-page-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.page === 'prev' || btn.dataset.page === 'next') return;
      buttons.forEach(item => item.classList.toggle('active', item === btn));
    });
  });
}

let toastTimeout;
function showToast() {
  if (!toast) return;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 3000);
}

bindTriggers();
bindTabs();
bindPagination();
