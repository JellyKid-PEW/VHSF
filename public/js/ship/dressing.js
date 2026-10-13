// Lived-in dressing for the developed rooms (bridge, forward corridor, galley).
// Everything here is "production-flexible" in the floor plan's terms — mugs,
// slates, cable loops, work lights, personal clutter — and is placed relative
// to the fixed Roomwright records, never moving them. Items cite the
// manuscript line that justifies them where one exists (see
// data/ship/inspectables.json for the visitor-facing text).
import * as THREE from 'three';
import { MATS } from './objects.js';

const M = {};
function mats() {
  if (M.ready) return M;
  const std = o => new THREE.MeshStandardMaterial(o);
  M.ceramic = std({ color: 0xd8d2c4, roughness: 0.45, metalness: 0.0 });
  M.ceramicDark = std({ color: 0x3c4a52, roughness: 0.5, metalness: 0.0 });
  M.tea = std({ color: 0x4a2c16, roughness: 0.2, metalness: 0.0 });
  M.slate = std({ color: 0x1c2024, roughness: 0.35, metalness: 0.3 });
  M.slateScreen = std({ color: 0x0b1416, emissive: 0x3a8b8f, emissiveIntensity: 0.55, roughness: 0.3 });
  M.paper = std({ color: 0xece4cf, roughness: 0.95, metalness: 0 });
  M.tape = std({ color: 0xd9cfae, roughness: 0.8, transparent: true, opacity: 0.85 });
  M.cable = std({ color: 0x1d2024, roughness: 0.7, metalness: 0.1 });
  M.cableRed = std({ color: 0x5a2a24, roughness: 0.7, metalness: 0.1 });
  M.cloth = std({ color: 0x6b6f5e, roughness: 1.0, metalness: 0 });
  M.clothWarm = std({ color: 0x8a5a3c, roughness: 1.0, metalness: 0 });
  M.steel = std({ color: 0xaab2bb, roughness: 0.3, metalness: 0.9 });
  M.blackPlastic = std({ color: 0x222428, roughness: 0.6, metalness: 0.1 });
  M.ledGreen = std({ color: 0x0e1a10, emissive: 0x47d17a, emissiveIntensity: 2.2 });
  M.ledAmber = std({ color: 0x1a140a, emissive: 0xf0a640, emissiveIntensity: 2.0 });
  M.ledBlue = std({ color: 0x0a1218, emissive: 0x5ab8e0, emissiveIntensity: 1.6 });
  M.lightStrip = std({ color: 0x302a20, emissive: 0xffd7a0, emissiveIntensity: 1.8 });
  M.grille = std({ color: 0x3a4048, roughness: 0.7, metalness: 0.6 });
  M.keycap = std({ color: 0x2a2f36, roughness: 0.6, metalness: 0.2 });
  M.ready = true;
  return M;
}

function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.userData.dressing = true; return m; }
const B = (w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), mat);
const C = (rt, rb, h, mat, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

// Place `obj` in a record's local frame (origin = footprint centre on deck).
function atRecord(rec, obj, lx, ly, lz, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(...rec.pos);
  g.rotation.y = rec.rotY || 0;
  obj.position.set(lx, ly, lz);
  obj.rotation.y += rotY;
  g.add(obj);
  return g;
}

function mug(m, { dark = false, full = false } = {}) {
  const g = new THREE.Group();
  const body = C(0.042, 0.038, 0.095, dark ? m.ceramicDark : m.ceramic, 18);
  body.position.y = 0.0475;
  const handle = mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 12, Math.PI), dark ? m.ceramicDark : m.ceramic);
  handle.position.set(0.045, 0.05, 0); handle.rotation.z = -Math.PI / 2;
  g.add(body, handle);
  if (full) { const t = C(0.036, 0.036, 0.004, m.tea); t.position.y = 0.088; g.add(t); }
  return g;
}

function slate(m, lit = true) {
  const g = new THREE.Group();
  const b = B(0.2, 0.012, 0.28, m.slate); b.position.y = 0.006;
  g.add(b);
  if (lit) { const s = B(0.17, 0.002, 0.23, m.slateScreen); s.position.y = 0.013; g.add(s); }
  return g;
}

// A sagging cable between two points (catenary-ish curve).
function cable(m, a, b, sag, mat, r = 0.012) {
  const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  return mesh(new THREE.TubeGeometry(curve, 20, r, 6, false), mat);
}

export function buildDressing(world) {
  const m = mats();
  const root = new THREE.Group();
  root.name = 'dressing';
  const R = (name, room) => world.recordByName(name, room);
  const add = (o) => root.add(o);

  // ---------------- bridge ----------------
  const helm = R('Helm console', 'bridge');
  const copilot = R('Copilot console', 'bridge');
  const aux = R('Auxiliary console', 'bridge');
  for (const con of [helm, copilot, aux].filter(Boolean)) {
    const p = con.params;
    // physical controls along the front lip of the angled deck
    const row = new THREE.Group();
    const n = Math.round(p.width / 0.07);
    for (let i = 0; i < n; i++) {
      const k = B(0.04, 0.018, 0.04, m.keycap);
      k.position.set(-p.width / 2 + 0.06 + i * ((p.width - 0.12) / (n - 1)), 0, 0);
      row.add(k);
    }
    add(atRecord(con, row, 0, p.height - 0.06, p.depth * 0.26));
    // worn grab edge
    const edge = B(p.width, 0.025, 0.035, MATS.rail);
    add(atRecord(con, edge, 0, p.height - 0.1, p.depth * 0.3));
  }
  if (helm) {
    // "She rested the mug on the console rim." (Next-10)
    add(atRecord(helm, mug(m, { full: true }), 0.48, helm.params.height - 0.05, helm.params.depth * 0.27));
    // the helm's open kneehole panel already exists as a record; a loose cable
    // loop spills from it (Next-01: wire casing peeled back)
    const a = new THREE.Vector3(-0.2, 0.3, 0.1), b = new THREE.Vector3(0.25, 0.02, 0.3);
    add(atRecord(helm, cable(m, a, b, 0.05, m.cableRed, 0.01), 0, 0, 0));
  }
  if (copilot) {
    // occupancy strip / status lights
    const strip = B(0.3, 0.012, 0.02, m.ledBlue);
    add(atRecord(copilot, strip, -0.25, copilot.params.height - 0.12, copilot.params.depth * 0.32));
  }
  if (aux) {
    // "A small light glowed on the auxiliary occupancy strip." (VH1_B3_04)
    const occ = B(0.22, 0.012, 0.02, m.ledAmber);
    add(atRecord(aux, occ, 0.3, aux.params.height - 0.12, aux.params.depth * 0.31));
    add(atRecord(aux, slate(m), -0.25, aux.params.height + 0.02, 0.02, 0.3));
  }
  const fwdRail = R('Forward rail', 'bridge');
  if (fwdRail) {
    // "Lights along the forward rail blinked green, then held." (Next-01)
    const g = new THREE.Group();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const led = B(0.03, 0.012, 0.012, m.ledGreen);
      led.position.set(-fwdRail.params.length / 2 + 0.2 + i * ((fwdRail.params.length - 0.4) / (n - 1)), 0, 0.035);
      g.add(led);
    }
    add(atRecord(fwdRail, g, 0, fwdRail.params.height - 0.04, 0));
  }
  const stationRail = R('Station rail', 'bridge');
  if (stationRail) {
    // "The datapad sat on the rail between them." (Presence-02)
    add(atRecord(stationRail, slate(m, false), 0, stationRail.params.height + 0.03, 0, 0.2));
  }
  const levers = R('Nav lock lever bank', 'bridge');
  if (levers) {
    // "The nav locks clicked." — three physical course-hold levers
    for (let i = 0; i < 3; i++) {
      const lv = new THREE.Group();
      const stem = C(0.009, 0.009, 0.16, m.steel, 8); stem.position.y = 0.08;
      const knob = C(0.018, 0.018, 0.035, m.blackPlastic, 10); knob.position.y = 0.17;
      lv.add(stem, knob); lv.rotation.x = -0.35 + i * 0.05;
      add(atRecord(levers, lv, -0.08 + i * 0.08, levers.params.height, 0));
    }
  }
  const bridgeFloor = R('Bridge deck', 'bridge');
  if (bridgeFloor) {
    // overhead speaker grille: B.O.B. "hummed from the overhead" (Presence-02)
    const gr = C(0.14, 0.14, 0.02, m.grille, 24);
    add(atRecord(bridgeFloor, gr, 0.2, 2.2, 0.4));
    // overhead cable tray along the starboard side
    const tray = B(0.18, 0.05, 3.6, MATS.hullDark);
    add(atRecord(bridgeFloor, tray, 1.9, 2.12, 0.2));
    add(atRecord(bridgeFloor, cable(m, new THREE.Vector3(1.85, 2.1, -1.4), new THREE.Vector3(1.85, 2.1, 0.4), 0.12, m.cable), 0, 0, 0));
    add(atRecord(bridgeFloor, cable(m, new THREE.Vector3(1.95, 2.1, -0.6), new THREE.Vector3(1.95, 2.1, 1.6), 0.09, m.cable, 0.009), 0, 0, 0));
  }
  const cradle = R('Pilot cradle', 'bridge');
  if (cradle) {
    // a folded jacket over the cradle arm (production-flexible clutter)
    const jacket = B(0.12, 0.05, 0.36, m.clothWarm);
    jacket.rotation.z = 0.25;
    add(atRecord(cradle, jacket, 0.33, cradle.params.seatHeight + 0.21, -0.02));
  }

  // ---------------- forward corridor ----------------
  const fwdRun = R('Main corridor deck (forward run)', 'corridor');
  if (fwdRun) {
    // "Cables draped in lazy curves from ceiling hooks." (Next-11)
    for (let i = 0; i < 3; i++) {
      const z0 = -1.1 + i * 0.85;
      add(atRecord(fwdRun, cable(m, new THREE.Vector3(-0.42, 2.1, z0), new THREE.Vector3(-0.42, 2.1, z0 + 0.75), 0.16 + 0.04 * i, i % 2 ? m.cable : m.cableRed, 0.01), 0, 0, 0));
      const hook = mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 10, Math.PI), m.steel);
      hook.rotation.x = Math.PI; add(atRecord(fwdRun, hook, -0.42, 2.12, z0));
    }
  }
  const aftRun = R('Main corridor deck (aft run)', 'corridor');
  if (aftRun) {
    add(atRecord(aftRun, cable(m, new THREE.Vector3(0.42, 2.1, -1.2), new THREE.Vector3(0.42, 2.1, 0.9), 0.14, m.cable), 0, 0, 0));
  }

  // ---------------- galley ----------------
  const counter = R('Galley counter run + sink', 'galley');
  if (counter) {
    const p = counter.params, front = p.faceFlip ? -1 : 1, top = p.height;
    // index card taped over the sink (Presence-06)
    const sinkX = p.width / 2 - 0.35;
    const card = B(0.125, 0.076, 0.003, m.paper);
    add(atRecord(counter, card, sinkX, top + 0.42, -front * (p.depth / 2 + 0.01)));
    const tape = B(0.05, 0.015, 0.004, m.tape);
    add(atRecord(counter, tape, sinkX - 0.04, top + 0.455, -front * (p.depth / 2 + 0.008)));
    // splashback panel along the wall
    const splash = B(p.width, 0.45, 0.02, MATS.panel);
    add(atRecord(counter, splash, 0, top + 0.25, -front * (p.depth / 2 + 0.005)));
    // kettle on the working stretch
    const kettle = new THREE.Group();
    const kb = C(0.07, 0.085, 0.17, m.steel, 20); kb.position.y = 0.085;
    const kh = mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI), m.blackPlastic); kh.position.y = 0.18;
    const ks = C(0.012, 0.02, 0.08, m.steel, 8); ks.position.set(0.09, 0.12, 0); ks.rotation.z = -0.9;
    kettle.add(kb, kh, ks);
    add(atRecord(counter, kettle, -0.15, top, front * 0.05));
    // a dish rack by the sink, three mugs on the run, a towel over the lip
    const rack = B(0.32, 0.06, 0.26, m.steel); rack.material = m.steel;
    add(atRecord(counter, rack, sinkX - 0.42, top + 0.03, 0));
    add(atRecord(counter, mug(m), sinkX - 0.5, top + 0.06, 0.04));
    add(atRecord(counter, mug(m, { dark: true }), sinkX - 0.36, top + 0.06, -0.06));
    add(atRecord(counter, mug(m, { full: true }), -0.6, top, front * 0.12));
    const towel = B(0.32, 0.22, 0.012, m.cloth);
    add(atRecord(counter, towel, -0.95, top - 0.12, front * (p.depth / 2 + 0.05)));
    // cutting board + covered container on the prep stretch
    const board = B(0.36, 0.018, 0.26, m.clothWarm); board.material = MATS.panel;
    add(atRecord(counter, board, 0.35, top + 0.009, front * 0.02));
    const tub = C(0.08, 0.08, 0.09, M.ceramicDark, 16);
    add(atRecord(counter, tub, -1.1, top + 0.045, -front * 0.12));
  }
  const shelf = R('Tin shelf', 'galley');
  if (shelf) {
    // practical strip light under the tin shelf, warm
    const strip = B(shelf.params.width * 0.9, 0.015, 0.03, m.lightStrip);
    add(atRecord(shelf, strip, 0, shelf.params.mountHeight - 0.03, 0.04));
  }
  const heater = R('Heating / hydration unit', 'galley');
  if (heater) {
    const p = heater.params, f = p.faceFlip ? -1 : 1;
    // control face: indicator, dispenser bay, water spout (Next-07 water generator)
    const panel = B(0.3, 0.12, 0.01, m.slate);
    add(atRecord(heater, panel, 0, 1.18, f * (p.depth / 2 + 0.006)));
    const led = B(0.03, 0.012, 0.01, m.ledAmber);
    add(atRecord(heater, led, 0.1, 1.2, f * (p.depth / 2 + 0.012)));
    const bay = B(0.36, 0.3, 0.02, m.blackPlastic);
    add(atRecord(heater, bay, 0, 0.82, f * (p.depth / 2 + 0.006)));
    const spout = C(0.012, 0.012, 0.06, m.steel, 8);
    add(atRecord(heater, spout, 0, 0.94, f * (p.depth / 2 - 0.02)));
    add(atRecord(heater, mug(m), 0, 0.68 + 0.0, f * (p.depth / 2 - 0.08)));
    const shelfLip = B(0.36, 0.02, 0.12, m.steel);
    add(atRecord(heater, shelfLip, 0, 0.67, f * (p.depth / 2 - 0.05)));
  }
  const cooler = R('Cooling unit', 'galley');
  if (cooler) {
    const p = cooler.params;
    const handle = B(0.3, 0.025, 0.03, m.steel);
    add(atRecord(cooler, handle, 0, p.height - 0.08, -(p.depth / 2 + 0.02)));
    const vent = B(0.4, 0.08, 0.01, m.grille);
    add(atRecord(cooler, vent, 0, 0.08, -(p.depth / 2 + 0.006)));
  }
  const table = R('Galley table', 'galley');
  if (table) {
    const h = table.params.height + 0.025;
    add(atRecord(table, mug(m, { full: true }), -0.35, h, 0.18));
    add(atRecord(table, mug(m, { dark: true }), 0.4, h, -0.2));
    add(atRecord(table, slate(m), 0.1, h, 0.05, 0.4));
    const cloth = B(0.3, 0.01, 0.22, m.cloth); add(atRecord(table, cloth, -0.25, h + 0.005, -0.2, 0.2));
    // spoons in a cup — "Somewhere aft, a spoon wobbled and held." (Next-11)
    const cup = C(0.035, 0.03, 0.08, m.ceramic, 14);
    add(atRecord(table, cup, 0.48, h + 0.04, 0.22));
    for (let i = 0; i < 2; i++) {
      const sp = C(0.004, 0.004, 0.14, m.steel, 6);
      sp.rotation.z = (i ? 0.2 : -0.15);
      add(atRecord(table, sp, 0.48 + (i ? 0.01 : -0.01), h + 0.1, 0.22));
    }
  }
  const bench = R('Galley bench', 'galley');
  if (bench) {
    // a folded blanket at the bench end
    const bl = B(0.42, 0.07, 0.36, m.clothWarm);
    add(atRecord(bench, bl, -bench.params.width / 2 + 0.28, bench.params.height + 0.035, 0));
  }
  const fan = R('Corner fan', 'galley');
  if (fan) {
    // "The fan in the corner ticked once, then went patient." (Presence-06)
    const ring = mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20), m.grille);
    const hub = C(0.03, 0.03, 0.03, m.blackPlastic, 10); hub.rotation.x = Math.PI / 2;
    const g = new THREE.Group(); g.add(ring, hub);
    const blades = new THREE.Group(); blades.name = 'fanBlades';
    for (let i = 0; i < 3; i++) { const bl = B(0.075, 0.03, 0.004, MATS.panel); bl.position.x = 0.045; const piv = new THREE.Group(); piv.rotation.z = i * 2.094; piv.add(bl); blades.add(piv); }
    g.add(blades);
    add(atRecord(fan, g, 0, fan.params.height + 0.12, 0.05));
    world.fanBlades = blades;
  }
  const cabinet = R('Galley cabinet', 'galley');
  if (cabinet) {
    // magnet board / notes on the cabinet face — no legible text invented
    const f = cabinet.params.faceFlip ? -1 : 1;
    const note = B(0.09, 0.12, 0.003, m.paper);
    add(atRecord(cabinet, note, 0.18, 1.3, f * (cabinet.params.depth / 2 + 0.004)));
  }

  world.root.add(root);
  world.dressing = root;
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh && o.material.emissive && o.material.emissiveIntensity > 1.2) world.lamps.push(o); });
}
