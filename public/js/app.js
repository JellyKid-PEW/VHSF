// Vox Humana — single-page shell. One page, so ship sound, the explorer and
// the reader share a lifetime: moving between them never restarts audio or
// loses the visitor's place aboard.
import { initPerspectives, renderDock } from './perspective.js';
import { initSoundPanel } from './soundpanel.js';
import { sound } from './sound/engine.js';
import { initReader, openChapter, leaveReader, bookTitle, shortLabel } from './reader/reader.js';
import { get, set, KEYS } from './store.js';

const $ = id => document.getElementById(id);
let library = null, shipMod = null, boardedThisSession = false;

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

async function loadLibrary() {
  const r = await fetch('content/library.json').catch(() => null);
  if (r && r.ok) return r.json();
  const m = await fetch('content/manifest.json').then(x => x.json());
  m.chapters.forEach(c => { c.available = false; c.unavailableReason = 'Chapters have not been built for this copy of the site.'; });
  m.unbuilt = true;
  return m;
}

// ---------- console + library lists ----------
function chapterRows(host, { compact }) {
  host.innerHTML = '';
  for (const b of [...library.books].sort((a, z) => a.order - z.order)) {
    const h = document.createElement(compact ? 'div' : 'section');
    h.className = compact ? 'q-book' : 'lib-book';
    if (compact) { h.textContent = b.title; host.appendChild(h); }
    else { h.innerHTML = `<h2>${b.title}</h2>${b.note ? `<p class="book-note">${b.note}</p>` : ''}`; host.appendChild(h); }
    const list = compact ? host : h;
    for (const c of library.chapters.filter(c => c.book === b.id)) {
      const el = document.createElement(c.available ? 'a' : 'div');
      el.className = 'q-row' + (c.available ? '' : ' unavailable');
      el.setAttribute('role', 'listitem');
      if (c.available) el.href = `#/read/${c.id}`;
      else el.setAttribute('aria-disabled', 'true');
      const vp = c.viewpointHolder ? `<span class="vp" title="Record holder">${c.viewpointHolder === 'quenby' ? 'Quenby' : c.viewpointHolder}</span>` : '';
      const num = c.kind === 'epilogue' ? 'EP' : String(c.number).padStart(2, '0');
      const title = c.title ? c.title : `<i>Untitled in the manuscript</i>`;
      el.innerHTML = `<div class="q-num">${num}</div><div class="q-meta"><div class="q-title">${title}${vp}</div>${c.subtitle ? `<div class="q-sub">${c.subtitle}</div>` : ''}</div>
        <div class="q-status">${c.available ? `<span class="ok">Open${c.words ? ` · ${Math.round(c.words / 250)} min` : ''}</span>` : `<span class="na">Not in this build</span>`}</div>`;
      if (!c.available) el.title = c.unavailableReason || 'Not available';
      list.appendChild(el);
    }
  }
}

function renderConsole() {
  chapterRows($('queue-list'), { compact: true });
  const n = library.chapters.filter(c => c.available).length;
  $('queue-foot').textContent = library.unbuilt
    ? 'No chapters are built in this copy. Run the content build to make supplied chapters readable.'
    : `${n} of ${library.chapters.length} chapters available in this build. Chapters marked “Not in this build” cannot be opened yet.`;
  const last = get(KEYS.lastChapter);
  const lastMeta = library.chapters.find(c => c.id === last && c.available);
  $('cta-resume').hidden = !lastMeta;
  if (lastMeta) { $('cta-resume').href = `#/read/${lastMeta.id}`; $('cta-resume').querySelector('[data-resume-label]').textContent = shortLabel(lastMeta); }
}

function renderLibrary() {
  chapterRows($('library'), { compact: false });
  const n = library.chapters.filter(c => c.available).length;
  $('lib-note').textContent = library.unbuilt
    ? 'Chapter text is not part of this copy of the site. Titles are listed; chapters open once the manuscripts are built locally (see README).'
    : `${n} of ${library.chapters.length} chapters are available. Titles follow the supplied manuscripts; some working drafts carry no title yet.`;
  $('lib-return').hidden = !get(KEYS.ship);
}

// ---------- routing ----------
function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query || '');
  if (parts[0] === 'ship') return { route: 'ship' };
  if (parts[0] === 'read' && parts[1]) return { route: 'reader', id: parts[1], block: q.has('b') ? Number(q.get('b')) : null };
  if (parts[0] === 'read') return { route: 'library' };
  return { route: 'console' };
}

let lastRoute = null;
async function route() {
  const r = parse();
  const views = { console: 'view-console', ship: 'view-ship', library: 'view-library', reader: 'view-reader' };
  if (lastRoute === 'ship' && r.route !== 'ship' && shipMod) { shipMod.saveShipState(); shipMod.shipExplorer()?.pause(); }
  if (lastRoute === 'reader' && r.route !== 'reader') leaveReader();
  for (const [k, id] of Object.entries(views)) $(id).hidden = k !== r.route;
  document.body.className = document.body.className.replace(/\broute-\S+/g, '').trim() + ` route-${r.route}`;
  document.querySelectorAll('.mainnav a').forEach(a => {
    const on = a.dataset.route === r.route || (a.dataset.route === 'read' && (r.route === 'library' || r.route === 'reader'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  lastRoute = r.route;
  if (r.route === 'console') { document.title = 'Vox Humana — Wild Huntress'; renderConsole(); }
  if (r.route === 'library') { document.title = 'Read — Vox Humana'; renderLibrary(); window.scrollTo(0, 0); }
  if (r.route === 'reader') await openChapter(r.id, { block: r.block });
  if (r.route === 'ship') await enterShip();
}

async function enterShip() {
  document.title = 'Aboard the Wild Huntress — Vox Humana';
  window.scrollTo(0, 0);
  const board = $('board');
  if (!boardedThisSession) { board.hidden = false; $('board-go').disabled = $('board-go-sound').disabled = true; }
  try {
    shipMod ||= await import('./ship/hud.js');
    const ex = await shipMod.ensureShip({ libraryData: library, toast });
    $('board-loading').textContent = '';
    $('board-go').disabled = $('board-go-sound').disabled = false;
    if (boardedThisSession) { ex.start(); ex.canvas.focus(); }
    else {
      $('board-h').textContent = `Wild Huntress · ${ex.room ? '' : ''}${get(KEYS.ship) ? 'Where you left off' : 'Bridge'}`;
      $('board-go').focus();
      ex.renderer.render(ex.scene, ex.camera);
    }
  } catch (err) {
    console.error(err);
    board.hidden = true;
    const e = $('ship-error');
    e.hidden = false;
    e.innerHTML = `<h2>The ship view could not start</h2><p>${/WebGL/i.test(String(err)) || !window.WebGLRenderingContext ? 'This browser did not provide WebGL, which the walkable ship needs.' : 'Something went wrong while loading the ship geometry.'} Reading still works: <a href="#/read">open the chapters</a>.</p><p class="fine">${String(err.message || err)}</p>`;
  }
}

function board(withSound) {
  boardedThisSession = true;
  $('board').hidden = true;
  const ex = shipMod.shipExplorer();
  ex.start();
  ex.canvas.focus();
  if (withSound) sound.start();
}

// ---------- comfort prefs ----------
function initComfort() {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const stored = get(KEYS.motion);
  const applyMotion = on => {
    document.documentElement.classList.toggle('reduce-motion', on);
    $('pref-motion').checked = on;
    const ex = shipMod?.shipExplorer(); if (ex) ex.reducedMotion = on;
  };
  applyMotion(stored === null ? mq.matches : !!stored);
  $('pref-motion').addEventListener('change', e => { set(KEYS.motion, e.target.checked); applyMotion(e.target.checked); });
  mq.addEventListener?.('change', e => { if (get(KEYS.motion) === null) applyMotion(e.matches); });
  const tex = get('vh:texture', true);
  document.body.classList.toggle('texture', tex && !document.documentElement.classList.contains('reduce-motion'));
  $('pref-scan').checked = tex;
  $('pref-scan').addEventListener('change', e => { set('vh:texture', e.target.checked); document.body.classList.toggle('texture', e.target.checked); });
}

async function boot() {
  await initPerspectives('data/perspectives.json');
  document.querySelectorAll('[data-dock]').forEach(d => renderDock(d, { variant: d.dataset.dock, label: 'Perspective' }));
  library = await loadLibrary();
  initReader(library);
  initSoundPanel();
  initComfort();
  $('board-go').addEventListener('click', () => board(false));
  $('board-go-sound').addEventListener('click', () => board(true));
  sound.addEventListener('change', () => { if (sound.stoppedBy === 'another-tab' && !sound.playing) toast('Ship sound is playing in another tab, so it stopped here.'); sound.stoppedBy = null; });
  window.addEventListener('perspectivechange', e => toast(`Perspective: ${e.detail.perspective === 'bob' ? 'B.O.B.' : e.detail.perspective === 'iri' ? 'Iri-Six' : e.detail.perspective[0].toUpperCase() + e.detail.perspective.slice(1)}`));
  window.addEventListener('hashchange', route);
  await route();
  document.documentElement.dataset.ready = '1';
}

boot().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<div class="ship-error panel" role="alert" style="position:fixed;left:16px;right:16px;top:80px">The site could not start: ${String(err.message || err)}</div>`);
});
