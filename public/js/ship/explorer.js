// First-person exploration of the Wild Huntress.
// Walker rules follow Roomwright's walk mode (ground sampler, slide along
// colliders) with one deliberate change: closed door leaves block, so hatches
// must be opened by hand.
import * as THREE from 'three';
import { ShipWorld, applyDoor } from './world.js';
import { LightRig } from './lights.js';

const EYE = 1.62;          // visitor standing eye height (m)
const RADIUS = 0.22;       // body radius, as Roomwright's walker at ~1.7 m
const WALK = 1.35, BRISK = 2.4;
const REACH = 2.1;         // how far a hand / attention reaches for interaction

export class Explorer {
  constructor(host, hooks = {}) {
    this.host = host;
    this.hooks = hooks;
    this.keys = new Set();
    this.yaw = Math.PI; this.pitch = -0.04;
    this.pos = new THREE.Vector3(0.6, EYE, 0.6);
    this.ground = 0;
    this.running = false;
    this.settled = null;
    this.reducedMotion = false;
    this.touchMove = { x: 0, y: 0 };
    this.lookVel = { yaw: 0, pitch: 0 };
    this.hotspots = [];
    this.focus = null;
    this.room = null;
    this._t = 0;
  }

  async init({ geometryUrl, roomsUrl, spotsUrl }) {
    const canvas = document.createElement('canvas');
    canvas.className = 'ship-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Wild Huntress, first-person view. Use W A S D or arrow keys to move, E to interact.');
    this.host.appendChild(canvas);
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020306);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.world = new ShipWorld(this.scene);
    await this.world.load({ geometryUrl, roomsUrl });
    this.spots = await fetch(spotsUrl).then(r => r.json());
    this.lights = new LightRig(this.scene, this.world);
    this._buildStars();
    this._buildHotspots();
    this._bindInput();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.host);
    this._groundInit();
    this._updateCamera(0);
    return this;
  }

  // ---------- scene extras ----------
  _buildStars() {
    const N = 2400, pos = new Float32Array(N * 3);
    let seed = 987654; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      const r = 160 + rand() * 60, th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.cos(ph) * 0.7; pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd6e0ee, size: 0.45, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.stars);
  }

  _buildHotspots() {
    const W = this.world;
    for (const d of W.doors) {
      const r = d.rec;
      this.hotspots.push({
        kind: 'door', door: d, room: r.room,
        pos: new THREE.Vector3(r.pos[0], (r.pos[1] || 0) + 1.05, r.pos[2]),
        label: () => `${d.target > 0.5 ? 'Close' : 'Open'} ${lc(d.name)}`,
      });
    }
    for (const s of this.spots.settle) {
      this.hotspots.push({ kind: 'settle', spot: s, room: s.room, pos: new THREE.Vector3(...s.at), label: () => s.verb || `Settle — ${s.label}` });
    }
    this.inspectables = [];
  }

  addInspectables(list) {
    for (const it of list) {
      const rec = this.world.recordByName(it.record, it.room);
      if (!rec) { console.warn('inspectable record missing', it.record); continue; }
      const p = new THREE.Vector3(rec.pos[0], rec.pos[1] || 0, rec.pos[2]);
      if (it.offset) p.add(new THREE.Vector3(...it.offset));
      const h = { kind: 'inspect', item: it, room: it.room, pos: p, label: () => `Look at ${it.label.toLowerCase()}` };
      this.hotspots.push(h);
      this.inspectables.push(h);
    }
  }

  // ---------- input ----------
  _bindInput() {
    const c = this.canvas;
    const keyMap = k => k.toLowerCase();
    this._onKeyDown = e => {
      const k = keyMap(e.key);
      if (k === 'escape') this.releasePointer();
      if (!this.running || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'z', 'pageup', 'pagedown'].includes(k)) {
        if (e.target === document.body || e.target === c || e.target.closest?.('.ship-view')) e.preventDefault();
        this.keys.add(k);
        if (this.settled && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].includes(k)) this.stand();
      }
      if (k === 'e' || (k === 'enter' && document.activeElement === c)) { e.preventDefault(); this.interact(); }
      if (k === ' ' && this.settled && document.activeElement === c) { e.preventDefault(); this.stand(); }
    };
    this._onKeyUp = e => this.keys.delete(keyMap(e.key));
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());

    // mouse: click to capture (pointer lock), Esc releases; drag-look always works
    c.addEventListener('click', () => {
      if (document.pointerLockElement === c) { this.interact(); return; }
      if (this.hooks.allowPointerLock?.() !== false && c.requestPointerLock) {
        try { const p = c.requestPointerLock(); if (p?.catch) p.catch(() => {}); } catch { /* ignore */ }
      }
    });
    document.addEventListener('pointerlockchange', () => this.hooks.onPointerLock?.(document.pointerLockElement === c));
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== c) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    let drag = null;
    c.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      if (document.pointerLockElement === c) return;
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', e => {
      if (!drag || e.pointerType === 'touch') return;
      this.look((e.clientX - drag.x) * 0.004, (e.clientY - drag.y) * 0.004);
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { drag = null; });
  }

  look(dx, dy) {
    const k = this.reducedMotion ? 0.8 : 1;
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.25, 1.25);
    if (this.settled) {
      // a settled body turns its head, not its seat
      const base = this.settled.yaw;
      let d = Math.atan2(Math.sin(this.yaw - base), Math.cos(this.yaw - base));
      d = THREE.MathUtils.clamp(d, -1.9, 1.9);
      this.yaw = base + d;
    }
  }

  releasePointer() { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }

  // ---------- lifecycle ----------
  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      if (this.manual) return;            // tests drive frames with step()
      const now = performance.now(); const dt = (now - this._last) / 1000; this._last = now;
      this.tick(Math.min(0.05, dt));
    };
    loop();
  }
  // Deterministic frame stepping (used by the automated walk-through tests).
  // render=false advances the simulation only (used by tests on software GL).
  step(frames = 1, dt = 1 / 30, render = true) { for (let i = 0; i < frames; i++) this.tick(dt, render && i === frames - 1); }
  pause() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.keys.clear();
    this.releasePointer();
  }

  resize() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _groundInit() {
    this.ground = this.world.groundAt(this.pos.x, this.pos.z, 0) ?? 0;
    this.pos.y = this.ground + EYE;
  }

  tick(dt, render = true) {
    this._t += dt;
    this.world.update(dt);
    if (!this.settled) this._move(dt);
    else this._settleFollow(dt);
    this._updateCamera(dt);
    this._ambientMotion(dt);
    this.lights.update(this.camera.position, this._t, this.reducedMotion);
    this._updateFocus();
    const room = this.world.roomAt(this.settled ? new THREE.Vector3(this.settled.at[0], this.ground + EYE, this.settled.at[2]) : this.pos);
    if (room && room !== this.room) { this.room = room; this.hooks.onRoom?.(room); }
    if (render) this.renderer.render(this.scene, this.camera);
    this.hooks.onFrame?.(this);
  }

  _move(dt) {
    const k = this.keys;
    let fwd = 0, side = 0, turn = 0;
    if (k.has('w') || k.has('arrowup')) fwd += 1;
    if (k.has('s') || k.has('arrowdown')) fwd -= 1;
    if (k.has('a')) side -= 1;
    if (k.has('d')) side += 1;
    if (k.has('arrowleft') || k.has('q')) turn += 1;
    if (k.has('arrowright') || k.has('z')) turn -= 1;
    if (k.has('pageup')) this.pitch = Math.min(1.2, this.pitch + dt * 0.9);
    if (k.has('pagedown')) this.pitch = Math.max(-1.2, this.pitch - dt * 0.9);
    fwd += -this.touchMove.y; side += this.touchMove.x;
    this.yaw += turn * dt * (this.reducedMotion ? 1.2 : 1.7);
    if (this.lookVel.yaw || this.lookVel.pitch) this.look(this.lookVel.yaw * dt, this.lookVel.pitch * dt);
    const len = Math.hypot(fwd, side);
    if (len < 0.01) return;
    const speed = (k.has('shift') ? BRISK : WALK) * Math.min(1, len);
    fwd /= Math.max(1, len); side /= Math.max(1, len);
    // forward = look direction projected on the deck
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx; // right-hand vector
    const dx = (fx * fwd + rx * side) * speed * dt, dz = (fz * fwd + rz * side) * speed * dt;
    // substeps keep the circle from tunnelling through thin bulkheads
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.05));
    this.lastBlock = null;
    for (let i = 0; i < n; i++) { this._tryMove(dx / n, 0); this._tryMove(0, dz / n); }
  }

  _tryMove(dx, dz) {
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    const g2 = this.world.groundAt(nx, nz, this.ground);
    if (g2 === null) { this.lastBlock = { type: 'edge' }; return false; }
    const hit = this.world.hits(nx, nz, RADIUS, g2 + 0.15, g2 + EYE + 0.1);
    if (hit) { this.lastBlock = hit; return false; }
    this.pos.x = nx; this.pos.z = nz; this.ground = g2;
    return true;
  }

  _settleFollow(dt) {
    const s = this.settled;
    const target = new THREE.Vector3(s.at[0], s.eyeY, s.at[2]);
    const k = this.reducedMotion ? 1 : Math.min(1, dt * 3.2);
    this.pos.lerp(target, k);
    if (this.pos.distanceToSquared(target) < 1e-6) this.pos.copy(target);   // arrive, then be still
  }

  _updateCamera(dt) {
    if (!this.settled) {
      const target = this.ground + EYE;
      this.pos.y += (target - this.pos.y) * Math.min(1, (dt || 1) * 11);
    }
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.pitch, this.yaw + Math.PI, 0);
  }

  _ambientMotion(dt) {
    // slow star drift: the ship is under way. Reduced motion holds it still.
    if (!this.reducedMotion) this.stars.rotation.y += dt * 0.0016;
    const W = this.world;
    if (W.fanBlades && !this.reducedMotion) W.fanBlades.rotation.z += dt * 2.2;
    const pulse = this.reducedMotion ? 1 : 0.92 + 0.08 * Math.sin(this._t * 0.9);
    for (const s of W.screens) s.material.emissiveIntensity = pulse;
  }

  // ---------- interaction ----------
  _updateFocus() {
    if (this.settled) { this._setFocus(null); return; }
    const cam = this.camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const cands = [];
    for (const h of this.hotspots) {
      // doors are tall targets: aim point follows eye height within the leaf
      let p = h.pos;
      if (h.kind === 'door') {
        // aim at the point on the leaf's height where the view ray crosses it
        const dh = Math.hypot(h.pos.x - cam.x, h.pos.z - cam.z), flat = Math.max(1e-3, Math.hypot(dir.x, dir.z));
        p = h.pos.clone().setY(THREE.MathUtils.clamp(cam.y + (dir.y / flat) * dh, h.pos.y - 0.8, h.pos.y + 0.75));
      }
      const v = p.clone().sub(cam);
      const d = Math.hypot(v.x, v.z);           // reach is measured across the deck
      if (d > REACH + (h.kind === 'door' ? 0.4 : 0) + (h.kind === 'settle' ? 0.5 : 0)) continue;
      if (Math.abs(p.y - cam.y) > 1.9) continue;
      v.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(dir), -1, 1));
      const limit = h.kind === 'door' ? 0.55 : 0.42;
      if (ang > limit) continue;
      cands.push({ h, score: ang * 2 + d * 0.35 });
    }
    cands.sort((a, b) => a.score - b.score);
    let best = null;
    const eyeY = cam.y - 0.25;
    for (const c of cands) {
      // nothing is reachable through a bulkhead or a shut hatch
      if (this.world.lineBlocked(cam, c.h.pos, eyeY, c.h.door || null, c.h.kind === 'door' ? 0.05 : 0.45)) continue;
      best = c.h; break;
    }
    this._setFocus(best);
  }
  _setFocus(h) {
    const label = h ? h.label() : null;
    if (h !== this.focus || label !== this._focusLabel) {
      this.focus = h; this._focusLabel = label;
      this.hooks.onFocus?.(h, label);
    }
  }

  interact(h = this.focus) {
    if (!h) return false;
    if (h.kind === 'door') { this.toggleDoor(h.door); return true; }
    if (h.kind === 'settle') { this.settle(h.spot.id); return true; }
    if (h.kind === 'inspect') { this.hooks.onInspect?.(h.item); return true; }
    return false;
  }

  toggleDoor(d, open) {
    const want = open ?? (d.target < 0.5);
    d.target = want ? 1 : 0;
    this.hooks.onDoor?.(d, want);
  }
  doorById(id) { return this.world.doors.find(d => d.id === id); }

  settle(id) {
    const s = this.spots.settle.find(x => x.id === id);
    if (!s) return false;
    const deckY = s.deckY ?? 0;
    this.settled = { ...s, eyeY: deckY + s.eye };
    this.yaw = s.yaw; this.pitch = s.pitch ?? -0.05;
    this.ground = deckY;
    if (this.reducedMotion) this.pos.set(s.at[0], this.settled.eyeY, s.at[2]);
    this.keys.clear();
    this.hooks.onSettle?.(s);
    return true;
  }
  stand() {
    if (!this.settled) return;
    const s = this.settled;
    this.settled = null;
    const st = s.standAt || s.at;
    this.pos.set(st[0], (s.deckY ?? 0) + EYE, st[2]);
    this.ground = this.world.groundAt(st[0], st[2], s.deckY ?? 0) ?? (s.deckY ?? 0);
    this.hooks.onStand?.(s);
  }

  // ---------- persistence ----------
  getState() {
    return {
      x: +this.pos.x.toFixed(3), z: +this.pos.z.toFixed(3), ground: this.ground,
      yaw: +this.yaw.toFixed(4), pitch: +this.pitch.toFixed(4),
      settled: this.settled?.id || null,
      doors: Object.fromEntries(this.world.doors.map(d => [d.id, d.target])),
    };
  }
  setState(s) {
    if (!s) return;
    if (s.doors) for (const d of this.world.doors) if (d.id in s.doors) { d.target = d.open = s.doors[d.id]; applyDoor(d); }
    if (typeof s.x === 'number' && typeof s.z === 'number') {
      const g = this.world.groundAt(s.x, s.z, s.ground ?? 0);
      if (g !== null && !this.world.hits(s.x, s.z, RADIUS, g + 0.15, g + EYE)) {
        this.pos.set(s.x, g + EYE, s.z); this.ground = g;
      }
    }
    if (typeof s.yaw === 'number') this.yaw = s.yaw;
    if (typeof s.pitch === 'number') this.pitch = s.pitch;
    if (s.settled) this.settle(s.settled);
    this._updateCamera(1);
  }

  // Teleport for tests / guided start; respects collision.
  placeAt(x, z, yaw) {
    const g = this.world.groundAt(x, z, this.ground);
    if (g === null) return false;
    this.pos.set(x, g + EYE, z); this.ground = g;
    if (yaw !== undefined) this.yaw = yaw;
    return true;
  }
}

function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
