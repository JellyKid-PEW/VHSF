// Character perspective: interface accent, selected observations, emphasis.
// It never changes the ship or chapter prose. Compatible with the original
// console's events: sets --signal / --signal-dim and dispatches
// `perspectivechange` on window (detail {perspective, signal, signalDim, logo}).
import { get, set, KEYS } from './store.js';

let data = null;
let current = null;

export async function initPerspectives(url) {
  data = await fetch(url).then(r => r.json());
  const saved = get(KEYS.perspective);
  // accept the original site's stored key too ("voxhumana-perspective")
  let legacy = null;
  try { legacy = localStorage.getItem('voxhumana-perspective'); } catch { /* ignore */ }
  const fromLegacy = data.list.find(p => p.legacyKey === legacy)?.id;
  apply(data.list.some(p => p.id === saved) ? saved : (fromLegacy || data.default), { silent: true });
  return data;
}

export const perspectives = () => data.list;
export const perspective = () => current;
export const perspectiveInfo = (id = current) => data.list.find(p => p.id === id);

export function apply(id, { silent = false } = {}) {
  const p = perspectiveInfo(id) || perspectiveInfo(data.default);
  current = p.id;
  const root = document.documentElement;
  root.dataset.perspective = p.id;
  root.style.setProperty('--signal', p.color);
  root.style.setProperty('--signal-dim', p.dim);
  document.querySelectorAll('[data-perspective-seal]').forEach(img => { img.src = p.logo; img.alt = `${p.name} seal`; });
  document.querySelectorAll('[data-perspective-name]').forEach(el => { el.textContent = p.name; });
  set(KEYS.perspective, p.id);
  syncDocks();
  if (!silent) window.dispatchEvent(new CustomEvent('perspectivechange', { detail: { perspective: p.id, signal: p.color, signalDim: p.dim, logo: p.logo } }));
}

// Crew rail (from the original console's concept D), usable in several docks.
export function renderDock(host, { variant = 'rail', label = 'Perspective' } = {}) {
  host.innerHTML = '';
  host.classList.add('lens-dock', `lens-${variant}`);
  const group = document.createElement('div');
  group.className = 'lens-group';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  if (variant === 'rail') {
    const l = document.createElement('div'); l.className = 'lens-label'; l.textContent = label; host.appendChild(l);
  }
  for (const p of data.list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lens-item';
    b.dataset.p = p.id;
    b.style.setProperty('--c', p.color);
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="lens-ini" aria-hidden="true">${p.initial}</span><span class="lens-bar" aria-hidden="true"></span><span class="lens-meta"><b>${p.name}</b><i>${p.notices}</i></span>`;
    b.addEventListener('click', () => apply(p.id));
    b.addEventListener('keydown', e => {
      const ids = data.list.map(x => x.id), i = ids.indexOf(current);
      if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); apply(ids[(i + 1) % ids.length]); group.querySelector(`[data-p="${current}"]`).focus(); }
      if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); apply(ids[(i + ids.length - 1) % ids.length]); group.querySelector(`[data-p="${current}"]`).focus(); }
    });
    group.appendChild(b);
  }
  host.appendChild(group);
  syncDocks();
}

function syncDocks() {
  document.querySelectorAll('.lens-item').forEach(b => {
    const on = b.dataset.p === current;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
}
