// Fluent-style tooltips for elements with [data-tip], plus info tips for files.
const tip = document.getElementById('tooltip');
let timer = null;
let current = null;

export function showTip(text, x, y) {
  tip.textContent = text;
  tip.style.left = '0px';
  tip.style.top = '0px';
  tip.classList.add('show');
  const r = tip.getBoundingClientRect();
  const left = Math.min(Math.max(4, x), innerWidth - r.width - 4);
  let top = y;
  if (top + r.height > innerHeight - 4) top = y - r.height - 28;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, top)}px`;
}

export function hideTip() {
  clearTimeout(timer);
  current = null;
  tip.classList.remove('show');
}

export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el === current) return;
    if (!el) {
      if (current) hideTip();
      return;
    }
    hideTip();
    current = el;
    timer = setTimeout(() => {
      if (!document.body.contains(el) || !el.dataset.tip) return;
      const r = el.getBoundingClientRect();
      showTip(el.dataset.tip, r.left + r.width / 2 - 20, r.bottom + 8);
    }, 650);
  });
  document.addEventListener('mousedown', hideTip, true);
  document.addEventListener('keydown', hideTip, true);
}
