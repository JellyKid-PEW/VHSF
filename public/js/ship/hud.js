// Ship view controller: boots the explorer once, wires the HUD, inspector,
// settling, minimap and touch controls, and saves the visitor's place.
import { Explorer } from './explorer.js';
import { sound } from '../sound/engine.js';
import { get, set, KEYS } from '../store.js';
import { perspective, perspectiveInfo, perspectives } from '../perspective.js';

let explorer = null, booting = null;
let roomsData = null, inspectData = null, drafts = null, quotes = {}, quoteRefs = {}, library = null;
const $ = id => document.getElementById(id);

export function shipExplorer() { return explorer; }

export async function ensureShip({ libraryData, toast }) {
  library = libraryData;
  if (explorer) return explorer;
  if (booting) return booting;
  booting = (async () => {
    const [rooms, insp, dr, qr, qt] = await Promise.all([
      fetch('data/ship/rooms.json').then(r => r.json()),
      fetch('data/ship/inspectables.json').then(r => r.json()),
      fetch('data/drafts/perspective-lines.draft.json').then(r => r.json()),
      fetch('data/observations.json').then(r => r.json()),
      fetch('content/quotes.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    roomsData = rooms; inspectData = insp; drafts = dr; quotes = qt;
    quoteRefs = Object.fromEntries(qr.quotes.map(q => [q.id, q]));
    const ex = new Explorer($('ship-host'), hooks(toast));
    await ex.init({ geometryUrl: 'data/ship/geometry.json', roomsUrl: 'data/ship/rooms.json', spotsUrl: 'data/ship/spots.json' });
    ex.addInspectables(insp.items);
    const saved = get(KEYS.ship);
    if (saved) ex.setState(saved);
    else { const s = ex.spots.start; ex.placeAt(s.at[0], s.at[2], s.yaw); }
    ex.reducedMotion = document.documentElement.classList.contains('reduce-motion');
    explorer = ex;
    window.__vhExplorer = ex; // test / debugging handle
    wireHud(ex, toast);
    setInterval(() => { if (explorer) set(KEYS.ship, explorer.getState()); }, 1500);
    window.addEventListener('pagehide', () => set(KEYS.ship, explorer.getState()));
    return ex;
  })();
  return booting;
}

export function saveShipState() { if (explorer) set(KEYS.ship, explorer.getState()); }

function hooks(toast) {
  return {
    onRoom(room) {
      const info = roomsData.rooms[room] || { name: room, statusText: '', developed: false };
      const el = $('hud-room');
      el.querySelector('[data-room-name]').textContent = info.name;
      el.querySelector('[data-room-status]').textContent = info.developed ? '' : info.statusText;
      el.classList.toggle('blockout', !info.developed);
      sound.setRoom(room, info.soundPreset);
      drawMap();
    },
    onFocus(h, label) {
      const p = $('hud-prompt');
      if (!h) { p.hidden = true; $('touch-use').hidden = true; return; }
      p.querySelector('span').textContent = label;
      p.hidden = false;
      $('touch-use').hidden = !document.body.classList.contains('touch-ui');
    },
    onDoor(d, open) { sound.door(open); },
    onInspect(item) { openInspector(item); },
    onSettle(s) {
      document.querySelector('.hud').classList.add('settled');
      $('settled-bar').hidden = false;
      $('settled-where').textContent = s.label;
      $('settle-menu').hidden = true;
      $('inspector').hidden = true;
      saveShipState();
    },
    onStand() {
      document.querySelector('.hud').classList.remove('settled');
      $('settled-bar').hidden = true;
      saveShipState();
    },
    onPointerLock(locked) { $('hud-lock').hidden = !locked; },
    allowPointerLock: () => !document.body.classList.contains('touch-ui'),
    onFrame() { if (!$('minimap').hidden) drawMapMarker(); },
  };
}

function wireHud(ex, toast) {
  $('hud-prompt').addEventListener('click', () => ex.interact());
  $('touch-use').addEventListener('click', () => ex.interact());
  $('btn-stand').addEventListener('click', () => { ex.stand(); ex.canvas.focus(); });
  $('insp-close').addEventListener('click', closeInspector);
  const toggleBtn = (btnId, panelId) => {
    const b = $(btnId), p = $(panelId);
    const set_ = v => { p.hidden = !v; b.setAttribute('aria-pressed', String(v)); if (panelId === 'minimap' && v) drawMap(); };
    b.addEventListener('click', () => set_(p.hidden));
    return set_;
  };
  const mapToggle = toggleBtn('btn-map', 'minimap');
  const helpToggle = toggleBtn('btn-help', 'help');
  $('btn-settle').addEventListener('click', () => {
    const m = $('settle-menu');
    if (!m.hidden) { m.hidden = true; return; }
    renderSettleMenu(ex);
    m.hidden = false;
    m.querySelector('button')?.focus();
  });
  window.addEventListener('keydown', e => {
    if (!ex.running || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'm' || e.key === 'M') mapToggle($('minimap').hidden);
    if (e.key === '?') helpToggle($('help').hidden);
    if (e.key === 'Escape') { $('inspector').hidden = true; $('settle-menu').hidden = true; }
  });
  window.addEventListener('perspectivechange', () => { if (!$('inspector').hidden && currentItem) openInspector(currentItem); });
  initTouch(ex);
}

function renderSettleMenu(ex) {
  const m = $('settle-menu');
  const room = ex.room;
  const here = ex.spots.settle.filter(s => s.room === room);
  m.innerHTML = `<h3>Settle in the ${(roomsData.rooms[room]?.name || 'room').toLowerCase()}</h3>`;
  if (!here.length) {
    m.innerHTML += '<p class="fine">There is nowhere set up to settle in this room yet. The bridge and the galley each have seats.</p>';
    return;
  }
  for (const s of here) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.innerHTML = `${s.label}<small>${s.view}</small>`;
    b.addEventListener('click', () => { ex.settle(s.id); ex.canvas.focus(); });
    m.appendChild(b);
  }
  const p = document.createElement('p'); p.className = 'fine'; p.textContent = 'Settling keeps you still. Look around freely; nothing will prompt you.';
  m.appendChild(p);
}

// ---------- inspector ----------
let currentItem = null;
function chapterLabel(id) {
  const ch = library?.chapters.find(c => c.id === id);
  if (!ch) return id;
  const book = library.books.find(b => b.id === ch.book)?.title || ch.book;
  return `${book} ${String(ch.number).padStart(2, '0')}${ch.title ? ` · ${ch.title}` : ''}`;
}
function openInspector(item) {
  currentItem = item;
  const p = perspectiveInfo();
  $('insp-title').textContent = item.label;
  $('insp-record').textContent = item.shipRecord;
  $('insp-basis').textContent = `Basis: ${item.basis}`;
  const host = $('insp-voices');
  host.innerHTML = '';
  const block = (pid, primary) => {
    const info = perspectiveInfo(pid);
    const wrap = document.createElement('div');
    wrap.className = 'voice';
    wrap.style.setProperty('--vc', info.color);
    const head = `<div class="voice-head"><img src="${info.logo}" alt="" width="34" height="23"><span>${primary ? 'Through ' : ''}${info.name}</span></div>`;
    // source lines relevant to this perspective, most relevant first
    const refs = item.quotes.map(id => quoteRefs[id]).filter(Boolean)
      .filter(r => r.about.includes(pid) || r.viewpoint === pid)
      .sort((a, b) => (b.viewpoint === pid) - (a.viewpoint === pid));
    let html = head;
    let missing = 0;
    for (const r of refs.slice(0, primary ? 3 : 2)) {
      const q = quotes[r.id];
      if (!q) { missing++; continue; }
      const vpName = r.viewpoint === 'ship-record' ? 'ship record' : `${perspectiveInfo(r.viewpoint)?.name || r.viewpoint}’s viewpoint`;
      html += `<blockquote class="quote">${esc(q.text)}<cite>— <a href="#/read/${r.chapter}?b=${q.block}">${esc(chapterLabel(r.chapter))}</a> · ${esc(vpName)}</cite></blockquote>`;
    }
    if (missing) html += `<p class="missing-quotes">${missing} manuscript line${missing > 1 ? 's' : ''} for this view need the chapters built locally (see README).</p>`;
    const line = drafts.lines[item.id]?.[pid];
    if (line) html += `<p class="draft"><span class="badge" title="Newly proposed wording for author review — not manuscript text">Draft</span>${esc(line)}</p>`;
    wrap.innerHTML = html;
    return wrap;
  };
  host.appendChild(block(p.id, true));
  const others = document.createElement('details');
  others.className = 'voices-other';
  others.innerHTML = '<summary>Other perspectives</summary>';
  for (const o of perspectives()) if (o.id !== p.id) others.appendChild(block(o.id, false));
  host.appendChild(others);
  $('inspector').hidden = false;
}
function closeInspector() { $('inspector').hidden = true; currentItem = null; explorer?.canvas.focus(); }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- minimap ----------
let mapGeom = null;
function drawMap() {
  const c = $('minimap'); if (!c || c.hidden || !explorer) return;
  const W = explorer.world;
  const deckY = Math.round((explorer.ground) / 3) * 3 >= -1 ? 0 : -3;
  const floors = W.floors.filter(f => Math.abs(f.y - deckY) < 1.2 && f.room !== 'hull');
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const f of floors) { minX = Math.min(minX, f.x - f.hw); maxX = Math.max(maxX, f.x + f.hw); minZ = Math.min(minZ, f.z - f.hd); maxZ = Math.max(maxZ, f.z + f.hd); }
  const pad = 10, s = Math.min((c.width - pad * 2) / (maxX - minX), (c.height - pad * 2 - 16) / (maxZ - minZ));
  mapGeom = { minX, minZ, s, pad, deckY };
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  for (const f of floors) {
    const dev = roomsData.rooms[f.room]?.developed;
    g.fillStyle = f.room === explorer.room ? 'rgba(232,230,225,.42)' : dev ? 'rgba(232,230,225,.22)' : 'rgba(232,230,225,.08)';
    g.fillRect(pad + (f.x - f.hw - minX) * s, pad + (f.z - f.hd - minZ) * s, f.hw * 2 * s, f.hd * 2 * s);
  }
  g.fillStyle = '#a5a299'; g.font = '11px "Space Mono", monospace';
  g.fillText(deckY === 0 ? 'MAIN DECK · fwd ↑' : 'LOWER DECK · fwd ↑', pad, c.height - 6);
  mapBase = g.getImageData(0, 0, c.width, c.height);
}
let mapBase = null;
function drawMapMarker() {
  const c = $('minimap'); if (!mapGeom || !mapBase) return;
  const deckY = explorer.ground > -1 ? 0 : -3;
  if (deckY !== mapGeom.deckY) { drawMap(); return; }
  const g = c.getContext('2d');
  g.putImageData(mapBase, 0, 0);
  const { minX, minZ, s, pad } = mapGeom;
  const x = pad + (explorer.pos.x - minX) * s, y = pad + (explorer.pos.z - minZ) * s;
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#E05A4F';
  g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  g.strokeStyle = g.fillStyle; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(explorer.yaw) * 12, y + Math.cos(explorer.yaw) * 12); g.stroke();
}

// ---------- touch ----------
function initTouch(ex) {
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) enableTouchUi();
  window.addEventListener('touchstart', enableTouchUi, { once: true, passive: true });
  function enableTouchUi() { document.body.classList.add('touch-ui'); $('touch').hidden = false; }
  const stick = $('stick'), knob = stick.querySelector('.knob');
  let sid = null, center = null;
  stick.addEventListener('pointerdown', e => {
    sid = e.pointerId; stick.setPointerCapture(sid);
    const r = stick.getBoundingClientRect(); center = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
    if (ex.settled) ex.stand();
    moveStick(e);
  });
  const moveStick = e => {
    if (e.pointerId !== sid) return;
    let dx = (e.clientX - center.x) / center.R, dy = (e.clientY - center.y) / center.R;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    ex.touchMove = { x: dx, y: dy };
    knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
  };
  stick.addEventListener('pointermove', moveStick);
  const end = e => { if (e.pointerId !== sid) return; sid = null; ex.touchMove = { x: 0, y: 0 }; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  // look: drag anywhere on the canvas with touch
  const looks = new Map();
  ex.canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') looks.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }); });
  ex.canvas.addEventListener('pointermove', e => {
    const l = looks.get(e.pointerId); if (!l) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    ex.look(dx * 0.005, dy * 0.005);
    l.moved += Math.abs(dx) + Math.abs(dy); l.x = e.clientX; l.y = e.clientY;
  });
  const lookEnd = e => {
    const l = looks.get(e.pointerId); looks.delete(e.pointerId);
    // a short tap acts like Use
    if (l && l.moved < 8 && performance.now() - l.t < 300) ex.interact();
  };
  ex.canvas.addEventListener('pointerup', lookEnd); ex.canvas.addEventListener('pointercancel', e => looks.delete(e.pointerId));
}
