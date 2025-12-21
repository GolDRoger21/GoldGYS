const ICON_MAP = {
  justice: 'justice',
  book: 'book',
  bolt: 'bolt',
  chart: 'chart',
  shield: 'shield',
  spark: 'spark',
  moon: 'moon',
  sun: 'sun',
  bell: 'bell',
  logout: 'logout',
  user: 'user'
};

export function renderIcon(name, { size = 24, className = 'ui-icon', title } = {}) {
  const symbol = ICON_MAP[name] || ICON_MAP.spark;
  const labelled = Boolean(title);
  const ariaLabel = labelled ? ` aria-label="${title}" role="img"` : ' aria-hidden="true"';
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"${ariaLabel}><use href="/icons/icon-sprite.svg#${symbol}"></use></svg>`;
}

export function hydrateIconPlaceholders(root = document) {
  const targets = root.querySelectorAll('[data-icon]');
  targets.forEach((el) => {
    const name = el.getAttribute('data-icon');
    const sizeAttr = el.getAttribute('data-icon-size');
    const size = sizeAttr ? Number(sizeAttr) : 24;
    const title = el.getAttribute('data-icon-label') || undefined;
    el.innerHTML = renderIcon(name, { size, className: 'ui-icon', title });
  });
}
