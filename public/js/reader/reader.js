// Chapter reader. Renders converted manuscript blocks unchanged, remembers
// position per chapter, and carries the viewpoint boundary: a chapter whose
// record belongs to Quenby opens behind a short in-world notice when the
// visitor is aboard as someone else. The notice is one step, never a wall.
import { get, set, KEYS } from '../store.js';
import { perspective, perspectiveInfo, apply as applyPerspective } from '../perspective.js';
import { strataMount, strataUnmount } from './strata.js';

const $ = id => document.getElementById(id);
const SIZES = [16, 17, 18, 19, 20, 22, 24, 26];
const cache = new Map();
let lib = null, current = null, saveTimer = null;
const seenNotices = new Set();

export function initReader(library) {
  lib = library;
  const prefs = { size: 19, theme: 'night', ...get(KEYS.reader, {}) };
  const view = $('view-reader');
  const applyPrefs = () => {
    view.style.setProperty('--rd-size', `${prefs.size}px`);
    view.classList.toggle('paper', prefs.theme === 'paper');
    $('rd-theme').textContent = prefs.theme === 'paper' ? 'Night' : 'Paper';
    $('rd-theme').setAttribute('aria-label', `Switch to ${prefs.theme === 'paper' ? 'night' : 'paper'} theme`);
    $('rd-smaller').disabled = prefs.size <= SIZES[0];
    $('rd-larger').disabled = prefs.size >= SIZES[SIZES.length - 1];
    set(KEYS.reader, prefs);
  };
  const step = d => {
    const anchor = topBlock();
    const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(prefs.size) + d));
    prefs.size = SIZES[i === -1 ? 3 : i];
    applyPrefs();
    if (anchor) scrollToBlock(anchor.index, anchor.frac, false);
  };
  $('rd-smaller').addEventListener('click', () => step(-1));
  $('rd-larger').addEventListener('click', () => step(1));
  $('rd-theme').addEventListener('click', () => { prefs.theme = prefs.theme === 'paper' ? 'night' : 'paper'; applyPrefs(); });
  window.addEventListener('keydown', e => {
    if (view.hidden || e.target.closest?.('input, textarea')) return;
    if (e.key === '+' || e.key === '=') step(1);
    if (e.key === '-') step(-1);
  });
  window.addEventListener('scroll', () => {
    if (view.hidden || !current) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, 250);
  }, { passive: true });
  // A perspective change mid-chapter never re-gates the text being read.
  applyPrefs();
}

export function leaveReader() {
  if (current) savePosition();
  strataUnmount();
}

export async function openChapter(id, { block = null } = {}) {
  const meta = lib.chapters.find(c => c.id === id);
  const body = $('chapter-body');
  $('rd-notice').hidden = true;
  $('strata-slot').hidden = true;
  strataUnmount();
  if (!meta || !meta.available) {
    current = null;
    $('rd-kicker').textContent = meta ? bookLine(meta) : 'Chapter';
    $('rd-title').textContent = meta?.title || 'This chapter is not in this build';
    $('rd-sub').textContent = '';
    body.dataset.chapter = id;
    body.innerHTML = `<p class="unavail">${meta ? 'This chapter has not been supplied to this build of the site, so it cannot be opened yet.' : 'There is no chapter at this address.'} <a href="#/read">See all chapters</a>.</p>`;
    navLinks(meta);
    $('rd-article').hidden = false;
    return;
  }
  let ch = cache.get(id);
  if (!ch) {
    const r = await fetch(`content/chapters/${id}.json`);
    if (!r.ok) { meta.available = false; return openChapter(id); }
    ch = await r.json(); cache.set(id, ch);
  }
  current = { meta, ch };
  set(KEYS.lastChapter, id);
  $('rd-kicker').textContent = bookLine(meta);
  $('rd-title').textContent = meta.title || `Chapter ${String(meta.number).padStart(2, '0')}`;
  $('rd-sub').textContent = [meta.subtitle, meta.title ? null : 'Untitled in the manuscript'].filter(Boolean).join(' · ');
  $('rd-where').textContent = `${bookTitle(meta.book)} · ${meta.kind === 'epilogue' ? 'Epilogue' : 'Chapter ' + String(meta.number).padStart(2, '0')} · ${ch.words.toLocaleString()} words`;
  body.innerHTML = ch.blocks.map(renderBlock).join('');
  body.dataset.chapter = id;
  navLinks(meta);
  document.title = `${meta.title || bookLine(meta)} — Vox Humana`;
  const gated = renderNotice(meta, true);
  $('rd-article').hidden = gated;
  const restore = () => {
    if (block !== null) { scrollToBlock(block, 0, true); flash(block); }
    else {
      const pos = get(KEYS.readPos(id));
      if (pos) scrollToBlock(pos.index, pos.frac, false); else window.scrollTo(0, 0);
    }
    strataMount(meta, $('strata-slot'), $('strata-status'));
  };
  if (gated) pendingRestore = restore; else requestAnimationFrame(restore);
}
let pendingRestore = null;

function renderNotice(meta, initial) {
  const holder = meta.viewpointHolder;
  const p = perspective();
  const host = $('rd-notice');
  const key = `${meta.id}|${p}`;
  if (!holder || holder === p || seenNotices.has(key)) { host.hidden = true; if (!initial) revealArticle(); return false; }
  const h = perspectiveInfo(holder), me = perspectiveInfo(p);
  host.innerHTML = `<div class="notice-card">
      <img src="${h.logo}" alt="" width="74" height="49">
      <div>
        <h2 id="rd-notice-h">Record holder · ${h.name}</h2>
        <p>This chapter is held in ${h.name}’s viewpoint. You are aboard as ${me.name}; the record opens exactly as written.</p>
        <div class="btns">
          <button type="button" class="rd-btn" id="notice-open">Open ${h.name}’s record</button>
          <button type="button" class="rd-btn" id="notice-switch">Switch perspective to ${h.name}</button>
        </div>
      </div></div>`;
  host.hidden = false;
  $('rd-article').hidden = true;
  $('notice-open').addEventListener('click', () => { seenNotices.add(key); host.hidden = true; revealArticle(); });
  $('notice-switch').addEventListener('click', () => { seenNotices.add(key); applyPerspective(holder); host.hidden = true; revealArticle(); });
  if (initial) requestAnimationFrame(() => $('notice-open')?.focus());
  return true;
}
function revealArticle() {
  $('rd-article').hidden = false;
  if (pendingRestore) { const f = pendingRestore; pendingRestore = null; requestAnimationFrame(f); }
}

function renderBlock(b, i) {
  if (b.type === 'break') return `<div class="scene-break" role="separator" aria-label="Scene break" data-block="${i}">${esc(b.mark)}</div>`;
  if (b.type === 'space') return `<div class="spacer" aria-hidden="true" data-block="${i}"></div>`;
  if (b.type === 'heading') return `<h2 data-block="${i}">${b.html}</h2>`;
  return `<p data-block="${i}"${b.cls ? ` class="${b.cls}"` : ''}>${b.html}</p>`;
}

function navLinks(meta) {
  const prev = $('rd-prev'), next = $('rd-next');
  const avail = lib.chapters;
  const i = meta ? avail.indexOf(meta) : -1;
  const find = (dir) => { for (let k = i + dir; k >= 0 && k < avail.length; k += dir) if (avail[k].available) return avail[k]; return null; };
  const p = i >= 0 ? find(-1) : null, n = i >= 0 ? find(1) : null;
  prev.hidden = !p; next.hidden = !n;
  if (p) { prev.href = `#/read/${p.id}`; prev.textContent = `← ${shortLabel(p)}`; }
  if (n) { next.href = `#/read/${n.id}`; next.textContent = `${shortLabel(n)} →`; }
  $('rd-return').hidden = !get(KEYS.ship);
}

function topBlock() {
  const blocks = document.querySelectorAll('#chapter-body [data-block]');
  const top = (document.querySelector('.rd-bar')?.getBoundingClientRect().bottom || 0) + 8;
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top) return { index: Number(el.dataset.block), frac: Math.max(0, Math.min(1, (top - r.top) / Math.max(1, r.height))) };
  }
  return null;
}
function scrollToBlock(index, frac = 0, smooth = false) {
  const el = document.querySelector(`#chapter-body [data-block="${index}"]`);
  if (!el) return;
  const top = (document.querySelector('.rd-bar')?.getBoundingClientRect().bottom || 0) + 8;
  const r = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + r.top - top + r.height * frac, behavior: smooth && !document.documentElement.classList.contains('reduce-motion') ? 'smooth' : 'auto' });
}
function flash(index) {
  const el = document.querySelector(`#chapter-body [data-block="${index}"]`);
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}
function savePosition() {
  if (!current || $('rd-article').hidden) return;
  const t = topBlock();
  if (t) set(KEYS.readPos(current.meta.id), { ...t, at: Date.now() });
}

export function bookTitle(id) { return lib.books.find(b => b.id === id)?.title || id; }
export function bookLine(meta) { return `${bookTitle(meta.book)} · ${meta.kind === 'epilogue' ? 'Epilogue' : 'Chapter ' + String(meta.number).padStart(2, '0')}`; }
export function shortLabel(m) { return `${bookTitle(m.book)} ${String(m.number).padStart(2, '0')}${m.title ? ' · ' + m.title : ''}`; }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
