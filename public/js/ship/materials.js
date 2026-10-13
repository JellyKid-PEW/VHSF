// Procedural surface materials for the visitor-facing ship.
// Roomwright's MATS palette is kept (same names, same base hues) but each
// material gains a generated texture so surfaces read as worn, used metal,
// leather and composite instead of flat colour. Textures are drawn once into
// canvases with a seeded RNG, so every visit sees the same scuffs.
import * as THREE from 'three';
import { MATS } from './objects.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function canvasTex(size, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Speckle + smudge noise helper.
function grime(g, size, r, { count = 900, alpha = 0.06, dark = true, min = 1, max = 3 } = {}) {
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size, rad = min + r() * (max - min);
    g.fillStyle = dark ? `rgba(0,0,0,${alpha * r()})` : `rgba(255,255,255,${alpha * r()})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
}
// Soft, irregular smudges (radial gradients) — reads as wear, not dots.
function smudges(g, size, r, { count = 30, alpha = 0.08, min = 10, max = 40, dark = true } = {}) {
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size, rad = min + r() * (max - min);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const c = dark ? '0,0,0' : '255,255,255';
    gr.addColorStop(0, `rgba(${c},${alpha * (0.4 + r() * 0.6)})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1 + r(), 0.5 + r() * 0.6); g.translate(-x, -y);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
  }
}
// Vertical drips / streaks from fittings above.
function streaks(g, size, r, { count = 14, alpha = 0.07 } = {}) {
  for (let i = 0; i < count; i++) {
    const x = r() * size, y0 = r() * size * 0.6, len = 40 + r() * 160, w = 1 + r() * 3;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, `rgba(30,24,18,${alpha})`); gr.addColorStop(1, 'rgba(30,24,18,0)');
    g.fillStyle = gr; g.fillRect(x, y0, w, len);
  }
}
function scratches(g, size, r, { count = 60, alpha = 0.18, len = 40, light = true } = {}) {
  g.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI, l = len * (0.3 + r());
    g.strokeStyle = light ? `rgba(220,225,230,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}
function base(g, size, hex) { g.fillStyle = hex; g.fillRect(0, 0, size, size); }

// Each texture covers TILE metres of world space (world-space UVs are
// assigned when static geometry is merged, see world.js).
export const TILE = 1.2;

export function makeTextures() {
  const deck = canvasTex(512, (g, s) => {
    const r = rng(11);
    base(g, s, '#6b7280');
    // plate seams on a 0.6 m grid (two plates per tile)
    grime(g, s, r, { count: 2600, alpha: 0.08, min: 0.5, max: 2 });
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, s, 3); g.fillRect(0, s / 2, s, 3);
    g.fillRect(0, 0, 3, s); g.fillRect(s / 2, 0, 3, s);
    // tread dimples
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 10; y < s; y += 18) for (let x = 10 + ((y / 18) % 2) * 9; x < s; x += 18) {
      g.save(); g.translate(x, y); g.rotate(((x + y) % 36) < 18 ? 0.8 : -0.8);
      g.fillRect(-5, -1.5, 10, 3); g.restore();
    }
    // rivets near seams
    g.fillStyle = 'rgba(200,205,210,0.35)';
    for (const o of [8, s / 2 + 8]) for (let k = 16; k < s; k += 64) {
      g.beginPath(); g.arc(k, o, 2, 0, 7); g.fill();
      g.beginPath(); g.arc(o, k, 2, 0, 7); g.fill();
    }
    scratches(g, s, r, { count: 140, alpha: 0.22, len: 50 });
    smudges(g, s, r, { count: 26, alpha: 0.12, min: 20, max: 70 });
  });
  const wall = canvasTex(512, (g, s) => {
    const r = rng(23);
    // painted panel, slightly blue-grey; two panels per tile
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#8e959d'); grad.addColorStop(1, '#848a92');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    grime(g, s, r, { count: 2600, alpha: 0.05, min: 0.4, max: 1.2 });
    // one panel repainted a slightly different shade, as refits do
    g.fillStyle = 'rgba(120,128,118,0.16)'; g.fillRect(s / 2 + 2, 0, s / 2, s * 0.62);
    smudges(g, s, r, { count: 18, alpha: 0.07, min: 30, max: 90 });
    streaks(g, s, r, { count: 16, alpha: 0.08 });
    // hip-height scuff band where shoulders and carts touch
    g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, s * 0.12, s, s * 0.08);
    // panel seams + fastener rows
    g.fillStyle = 'rgba(18,20,24,0.65)';
    g.fillRect(0, 0, 3, s); g.fillRect(s / 2, 0, 2, s);
    g.fillRect(0, s * 0.62, s, 2);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(3, 0, 1, s); g.fillRect(s / 2 + 2, 0, 1, s); g.fillRect(0, s * 0.62 + 2, s, 1);
    g.fillStyle = 'rgba(30,32,36,0.7)';
    for (let y = 18; y < s; y += 48) { g.beginPath(); g.arc(10, y, 2.2, 0, 7); g.fill(); g.beginPath(); g.arc(s / 2 + 9, y, 2.2, 0, 7); g.fill(); }
    // chipped paint at panel corners showing primer
    g.fillStyle = 'rgba(150,120,90,0.35)';
    for (let i = 0; i < 10; i++) { const x = (r() < 0.5 ? 4 : s / 2 + 3) + r() * 10, y = r() * s; g.fillRect(x, y, 2 + r() * 5, 1 + r() * 3); }
    scratches(g, s, r, { count: 110, alpha: 0.18, len: 26 });
  });
  const dark = canvasTex(256, (g, s) => {
    const r = rng(37);
    base(g, s, '#5a616b');
    grime(g, s, r, { count: 900, alpha: 0.08, min: 0.5, max: 2 });
    scratches(g, s, r, { count: 40, alpha: 0.25, len: 20 });
  });
  const leather = canvasTex(256, (g, s) => {
    const r = rng(41);
    base(g, s, '#8a6a52');
    grime(g, s, r, { count: 2200, alpha: 0.08, min: 0.4, max: 1.4 });
    // creases and shiny wear where people actually sit
    g.strokeStyle = 'rgba(40,24,14,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const x = r() * s, y = r() * s;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10 * r(), y + 14, x + 30 * (r() - 0.5), y + 30); g.stroke();
    }
    const wear = g.createRadialGradient(s * 0.5, s * 0.5, 4, s * 0.5, s * 0.5, s * 0.5);
    wear.addColorStop(0, 'rgba(255,230,200,0.14)'); wear.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = wear; g.fillRect(0, 0, s, s);
  });
  const worktop = canvasTex(512, (g, s) => {
    const r = rng(53);
    base(g, s, '#545a60');
    grime(g, s, r, { count: 2400, alpha: 0.07, min: 0.4, max: 1.6 });
    scratches(g, s, r, { count: 260, alpha: 0.25, len: 26 });
    // mug rings
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = `rgba(30,22,16,${0.12 + r() * 0.1})`; g.lineWidth = 2.5;
      g.beginPath(); g.arc(r() * s, r() * s, 18 + r() * 6, r() * 2, 4 + r() * 2.2); g.stroke();
    }
  });
  const brass = canvasTex(128, (g, s) => {
    const r = rng(61);
    base(g, s, '#a58a52');
    grime(g, s, r, { count: 500, alpha: 0.15, min: 0.4, max: 1.8 });
    scratches(g, s, r, { count: 40, alpha: 0.35, len: 16 });
  });
  const ceiling = canvasTex(256, (g, s) => {
    const r = rng(71);
    base(g, s, '#4e545d');
    grime(g, s, r, { count: 900, alpha: 0.08 });
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
    // perforated acoustic strip
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = s * 0.35; y < s * 0.65; y += 8) for (let x = 12; x < s - 12; x += 8) g.fillRect(x, y, 2, 2);
  });
  const painted = canvasTex(256, (g, s) => {
    const r = rng(83);
    base(g, s, '#9aa1a8');
    grime(g, s, r, { count: 1200, alpha: 0.07, min: 0.5, max: 2 });
    scratches(g, s, r, { count: 60, alpha: 0.25, len: 18, light: false });
    smudges(g, s, r, { count: 10, alpha: 0.08, min: 10, max: 40 });
  });
  const amberPaint = canvasTex(128, (g, s) => {
    const r = rng(97);
    base(g, s, '#b08c3a');
    grime(g, s, r, { count: 500, alpha: 0.16, min: 0.5, max: 2 });
    scratches(g, s, r, { count: 50, alpha: 0.4, len: 14, light: false });
  });
  return { deck, wall, dark, leather, worktop, brass, ceiling, painted, amberPaint };
}

// Swap Roomwright's flat palette for textured versions. Colours are kept in
// the same families; the visitor build is lit by practical lights rather than
// an editor key light, so albedos are lifted slightly to keep spaces legible.
export function upgradeMaterials() {
  const T = makeTextures();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS.deck = std({ color: 0xd2d6dc, map: T.deck, bumpMap: T.deck, bumpScale: 0.6, roughness: 0.82, metalness: 0.35 });
  MATS.deckTread = std({ color: 0x9aa0a8, map: T.dark, roughness: 0.92, metalness: 0.25 });
  MATS.hull = std({ color: 0xd6dade, map: T.wall, bumpMap: T.wall, bumpScale: 0.4, roughness: 0.74, metalness: 0.28 });
  MATS.hullDark = std({ color: 0xbcc2c8, map: T.ceiling, roughness: 0.8, metalness: 0.35 });
  MATS.panel = std({ color: 0xd9dde1, map: T.painted, roughness: 0.62, metalness: 0.4 });
  MATS.trim = std({ color: 0xe0d2b0, map: T.brass, roughness: 0.48, metalness: 0.7 });
  MATS.seatPad = std({ color: 0xe2cfc0, map: T.leather, bumpMap: T.leather, bumpScale: 0.5, roughness: 0.78, metalness: 0.02 });
  MATS.warn = std({ color: 0xe8dcc0, map: T.amberPaint, roughness: 0.66, metalness: 0.3 });
  MATS.rail = std({ color: 0x8c96a2, roughness: 0.32, metalness: 0.85 });
  MATS.worktop = std({ color: 0xd8d8d8, map: T.worktop, roughness: 0.55, metalness: 0.25 });
  MATS.glass = new THREE.MeshStandardMaterial({ color: 0x9fc0d0, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  MATS.screen = std({ color: 0x0a1418, roughness: 0.3, metalness: 0.1, emissive: 0x2b7d92, emissiveIntensity: 1.0 });
  return T;
}
