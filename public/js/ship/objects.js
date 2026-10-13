// Ported from Roomwright (JellyKid-PEW/VoxHumanaSF, branch
// claude/roomwright-3d-builder-wg3v5b, roomwright/js/objects.js @ 966244d).
// Builders are kept dimension-for-dimension so the exported geometry.json
// rebuilds exactly as validated in Roomwright. Visitor-build changes are
// limited to materials (textured via materials.js) and are marked "visitor:".
//
// Parametric buildable objects. Every object type has:
//  - schema: editable params (shown in inspector)
//  - build(params): returns a THREE.Group; meshes that block movement carry
//    userData.collidable = true; special anchors carry userData tags.
// Units are meters. Floor surface is y = 0. Object origin: center of footprint on floor.
import * as THREE from 'three';

// ---------- materials: restrained industrial ----------
export const MATS = {
  deck: new THREE.MeshStandardMaterial({ color: 0x3d434c, roughness: 0.85, metalness: 0.35 }),
  deckTread: new THREE.MeshStandardMaterial({ color: 0x2e333b, roughness: 0.95, metalness: 0.2 }),
  hull: new THREE.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.75, metalness: 0.5 }),
  hullDark: new THREE.MeshStandardMaterial({ color: 0x343a45, roughness: 0.8, metalness: 0.45 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x59616e, roughness: 0.6, metalness: 0.6 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x8a6f3c, roughness: 0.5, metalness: 0.7 }),
  seatPad: new THREE.MeshStandardMaterial({ color: 0x5c4a3a, roughness: 0.9, metalness: 0.05 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.3, metalness: 0.1, emissive: 0x1d4d5e, emissiveIntensity: 0.9 }),
  screenOff: new THREE.MeshStandardMaterial({ color: 0x0a1014, roughness: 0.3, metalness: 0.1 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x88aabb, roughness: 0.22, metalness: 0.1, transparent: true, opacity: 0.09, side: THREE.DoubleSide }),
  rail: new THREE.MeshStandardMaterial({ color: 0x707a88, roughness: 0.4, metalness: 0.85 }),
  warn: new THREE.MeshStandardMaterial({ color: 0x9a7524, roughness: 0.7, metalness: 0.3 }),
  bolt: new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.35, metalness: 0.95 }),
  massing: new THREE.MeshStandardMaterial({ color: 0x5b7a99, roughness: 0.9, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
  massingBad: new THREE.MeshStandardMaterial({ color: 0x9a4a4a, roughness: 0.9, metalness: 0.1, transparent: true, opacity: 0.24, depthWrite: false }),
  massingEdge: new THREE.LineBasicMaterial({ color: 0x7fa0c0, transparent: true, opacity: 0.45 }),
  massingEdgeBad: new THREE.LineBasicMaterial({ color: 0xcc7070, transparent: true, opacity: 0.6 }),
  conduit: new THREE.MeshStandardMaterial({ color: 0x6a7280, roughness: 0.45, metalness: 0.8 }),
  conduitOld: new THREE.MeshStandardMaterial({ color: 0x4e4436, roughness: 0.55, metalness: 0.65, emissive: 0x0d1f14, emissiveIntensity: 0.35 }),
};

function box(w, h, d, mat, collidable = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.collidable = collidable;
  return m;
}
function cyl(rTop, rBot, h, mat, seg = 20, collidable = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.collidable = collidable;
  return m;
}

// ---------- builders ----------

function buildFloor(p) {
  const g = new THREE.Group();
  const f = box(p.width, 0.08, p.depth, MATS.deck);
  f.position.y = -0.04;
  f.userData.collidable = false; // floor handled by ground plane logic
  f.userData.walkable = true;
  g.add(f);
  // deck plate seams
  const seams = new THREE.Group();
  const seamMat = MATS.deckTread;
  const nx = Math.max(2, Math.round(p.width / 1.2));
  for (let i = 1; i < nx; i++) {
    const s = box(0.02, 0.004, p.depth * 0.98, seamMat, false);
    s.position.set(-p.width / 2 + (i * p.width / nx), 0.002, 0);
    seams.add(s);
  }
  g.add(seams);
  return g;
}

function buildCeiling(p) {
  const g = new THREE.Group();
  const c = box(p.width, 0.08, p.depth, MATS.hullDark, false);
  c.position.y = p.height + 0.04;
  g.add(c);
  // light channel housings
  const n = Math.max(1, Math.round(p.depth / 1.6));
  for (let i = 0; i < n; i++) {
    const ch = box(p.width * 0.6, 0.05, 0.18, MATS.panel, false);
    ch.position.set(0, p.height - 0.03, -p.depth / 2 + (i + 0.5) * (p.depth / n));
    g.add(ch);
  }
  return g;
}

function buildWall(p) {
  const g = new THREE.Group();
  const w = box(p.length, p.height, p.thickness, MATS.hull);
  w.position.y = p.height / 2;
  g.add(w);
  // panel lines
  const nl = Math.max(1, Math.round(p.length / 1.1));
  for (let i = 1; i < nl; i++) {
    const line = box(0.015, p.height * 0.92, p.thickness + 0.012, MATS.hullDark, false);
    line.position.set(-p.length / 2 + i * (p.length / nl), p.height / 2, 0);
    g.add(line);
  }
  // kick plate
  const kick = box(p.length, 0.14, p.thickness + 0.02, MATS.hullDark, false);
  kick.position.y = 0.07;
  g.add(kick);
  return g;
}

// Wall with a door opening + manual door leaf (sliding or hinged).
// params: length, height, thickness, doorWidth, doorHeight, kind, hinge ('left'|'right'), open (0..1)
function buildDoorway(p) {
  const g = new THREE.Group();
  const sideW = (p.length - p.doorWidth) / 2;
  if (sideW > 0.01) {
    const l = box(sideW, p.height, p.thickness, MATS.hull);
    l.position.set(-(p.doorWidth / 2 + sideW / 2), p.height / 2, 0);
    g.add(l);
    const r = box(sideW, p.height, p.thickness, MATS.hull);
    r.position.set(p.doorWidth / 2 + sideW / 2, p.height / 2, 0);
    g.add(r);
  }
  const headH = p.height - p.doorHeight;
  if (headH > 0.01) {
    const head = box(p.doorWidth, headH, p.thickness, MATS.hull);
    head.position.set(0, p.doorHeight + headH / 2, 0);
    g.add(head);
  }
  // frame
  const frameL = box(0.07, p.doorHeight, p.thickness + 0.05, MATS.trim, false);
  frameL.position.set(-p.doorWidth / 2 - 0.035, p.doorHeight / 2, 0);
  g.add(frameL);
  const frameR = frameL.clone(); frameR.position.x = p.doorWidth / 2 + 0.035;
  g.add(frameR);

  // leaf
  const leafG = new THREE.Group();
  leafG.name = 'doorLeaf';
  const leaf = box(p.doorWidth - 0.02, p.doorHeight - 0.02, 0.06, MATS.panel);
  const open = p.open ?? 0;
  if (p.kind === 'hinged') {
    // pivot at hinge side
    const s = p.hinge === 'right' ? 1 : -1;
    leafG.position.set(s * (p.doorWidth / 2 - 0.01), 0, 0);
    leaf.position.set(-s * (p.doorWidth / 2 - 0.01), p.doorHeight / 2, 0);
    leafG.rotation.y = -s * open * (Math.PI / 2) * ((p.swing === 'in') ? -1 : 1);
  } else {
    // sliding: pocket into the side wall (slideDir: +1 → +x, -1 → -x)
    const dir = p.slideDir ?? 1;
    leaf.position.set(dir * open * (p.doorWidth - 0.04), p.doorHeight / 2, 0);
  }
  // wheel handle — manual door
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 10, 24), MATS.rail);
  wheel.userData.collidable = false;
  wheel.position.set(leaf.position.x - (p.kind === 'hinged' ? 0.2 : 0.25), 1.05, 0.06);
  leafG.add(leaf, wheel);
  leafG.userData.isDoorLeaf = true;
  g.add(leafG);
  g.userData.isDoor = true;
  return g;
}

// Forward viewport wall: hull wall with a wide window band.
// params: length, height, thickness, sillHeight, windowHeight, rake (deg, top leans out)
function buildViewportWall(p) {
  const g = new THREE.Group();
  const sill = box(p.length, p.sillHeight, p.thickness, MATS.hull);
  sill.position.y = p.sillHeight / 2;
  g.add(sill);
  const topH = Math.max(0.02, p.height - p.sillHeight - p.windowHeight);
  const top = box(p.length, topH, p.thickness, MATS.hull);
  top.position.y = p.sillHeight + p.windowHeight + topH / 2;
  g.add(top);
  // mullions split the band into panes
  const panes = Math.max(1, Math.round(p.length / 1.15));
  const paneW = p.length / panes;
  for (let i = 0; i <= panes; i++) {
    const mull = box(0.06, p.windowHeight, p.thickness * 0.8, MATS.hullDark);
    mull.position.set(-p.length / 2 + i * paneW, p.sillHeight + p.windowHeight / 2, 0);
    g.add(mull);
  }
  const glass = box(p.length - 0.04, p.windowHeight - 0.04, 0.02, MATS.glass, true);
  glass.position.y = p.sillHeight + p.windowHeight / 2;
  glass.userData.isWindow = true;
  g.add(glass);
  const rake = (p.rake || 0) * Math.PI / 180;
  if (rake) {
    // lean the whole band outward around the sill line
    [top, glass].forEach(() => {});
    // simple approach: rotate glass + mullions group is complex; keep flat but flag rake in metadata
  }
  g.userData.isViewport = true;
  return g;
}

// Crew console: pedestal + angled screen deck.
// params: width, depth, height, screens (1..3), kind ('seated'|'standing'), lit (bool)
function buildConsole(p) {
  const g = new THREE.Group();
  const bodyH = p.height - 0.02;
  const body = box(p.width, bodyH, p.depth * 0.72, MATS.panel);
  body.position.set(0, bodyH / 2, -p.depth * 0.1);
  g.add(body);
  // angled top with screen(s)
  const deck = new THREE.Group();
  const top = box(p.width, 0.05, p.depth * 0.6, MATS.hullDark);
  deck.add(top);
  const n = p.screens || 1;
  for (let i = 0; i < n; i++) {
    const sw = (p.width / n) - 0.08;
    const scr = box(sw, 0.012, p.depth * 0.42, p.lit === false ? MATS.screenOff : MATS.screen, false);
    scr.userData.isScreen = true;
    scr.position.set(-p.width / 2 + (i + 0.5) * (p.width / n), 0.032, 0);
    deck.add(scr);
  }
  deck.position.set(0, p.height, -p.depth * 0.08);
  deck.rotation.x = -0.28; // ~16° tilt toward operator
  g.add(deck);
  // reach anchor: where a hand must get to
  const reach = new THREE.Object3D();
  reach.name = 'reachPoint';
  reach.position.set(0, p.height + 0.06, p.depth * 0.18);
  g.add(reach);
  g.userData.isConsole = true;
  return g;
}

// Crew seat: swivel pedestal chair.
// params: seatHeight, width, hasArms
function buildSeat(p) {
  const g = new THREE.Group();
  const base = cyl(0.22, 0.3, 0.06, MATS.hullDark);
  base.position.y = 0.03;
  g.add(base);
  const column = cyl(0.05, 0.05, p.seatHeight - 0.1, MATS.rail);
  column.position.y = 0.06 + (p.seatHeight - 0.1) / 2;
  g.add(column);
  const pan = box(p.width, 0.07, 0.46, MATS.seatPad);
  pan.position.y = p.seatHeight;
  g.add(pan);
  const back = box(p.width, 0.55, 0.06, MATS.seatPad);
  back.position.set(0, p.seatHeight + 0.32, -0.22);
  back.rotation.x = 0.12;
  g.add(back);
  if (p.hasArms) {
    for (const s of [-1, 1]) {
      const arm = box(0.05, 0.05, 0.34, MATS.panel);
      arm.position.set(s * (p.width / 2 + 0.03), p.seatHeight + 0.18, -0.02);
      g.add(arm);
    }
  }
  const sit = new THREE.Object3D();
  sit.name = 'sitPoint';
  sit.position.set(0, p.seatHeight + 0.035, 0.03);
  g.add(sit);
  g.userData.isSeat = true;
  return g;
}

// Rail: posts + top tube (+ optional mid tube).
// params: length, height, midRail
function buildRail(p) {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(p.length / 0.9) + 1);
  for (let i = 0; i < n; i++) {
    const post = cyl(0.022, 0.022, p.height, MATS.rail);
    post.position.set(-p.length / 2 + i * (p.length / (n - 1)), p.height / 2, 0);
    g.add(post);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, p.length, 14), MATS.rail);
  tube.rotation.z = Math.PI / 2;
  tube.position.y = p.height;
  tube.castShadow = true; tube.userData.collidable = true;
  g.add(tube);
  if (p.midRail) {
    const mid = tube.clone();
    mid.position.y = p.height * 0.55;
    g.add(mid);
  }
  const feet = new THREE.Object3D(); // where feet can rest
  feet.name = 'footRest';
  feet.position.set(0, p.height, 0);
  g.add(feet);
  g.userData.isRail = true;
  return g;
}

// Storage locker.
function buildStorage(p) {
  const g = new THREE.Group();
  const bodyMat = MATS.panel;
  const b = box(p.width, p.height, p.depth, bodyMat);
  b.position.y = p.height / 2;
  g.add(b);
  const doors = Math.max(1, Math.round(p.width / 0.55));
  for (let i = 0; i < doors; i++) {
    const dw = p.width / doors;
    const seam = box(0.012, p.height * 0.9, 0.012, MATS.hullDark, false);
    seam.position.set(-p.width / 2 + (i + (i ? 0 : 1)) * dw, p.height / 2, p.depth / 2 + 0.005);
    if (i > 0) g.add(seam);
    const latch = box(0.03, 0.12, 0.02, MATS.trim, false);
    latch.position.set(-p.width / 2 + (i + 0.5) * dw + dw * 0.3, p.height * 0.55, p.depth / 2 + 0.015);
    g.add(latch);
  }
  return g;
}

// Step block / short stair.
function buildStep(p) {
  const g = new THREE.Group();
  const n = Math.max(1, p.steps);
  for (let i = 0; i < n; i++) {
    const s = box(p.width, p.rise, p.run, MATS.deckTread);
    s.position.set(0, p.rise * (i + 0.5), -p.run * (n - 1) / 2 + i * p.run);
    s.userData.walkable = true;
    g.add(s);
  }
  return g;
}

// Structural rib/strut.
function buildStrut(p) {
  const g = new THREE.Group();
  const s = box(p.width, p.height, p.depth, MATS.hullDark);
  s.position.y = p.height / 2;
  g.add(s);
  const capT = box(p.width * 1.4, 0.06, p.depth * 1.4, MATS.trim, false);
  capT.position.y = p.height - 0.03;
  g.add(capT);
  return g;
}

function buildTable(p) {
  const g = new THREE.Group();
  const top = box(p.width, 0.05, p.depth, MATS.worktop || MATS.panel); // visitor: worn worktop
  top.position.y = p.height;
  g.add(top);
  const leg = box(p.width * 0.15, p.height, p.depth * 0.15, MATS.hullDark);
  leg.position.y = p.height / 2;
  g.add(leg);
  return g;
}

// Bench: sittable pad on a low frame (viewport bench).
function buildBench(p) {
  const g = new THREE.Group();
  const frame = box(p.width - 0.06, p.height - 0.06, p.depth - 0.06, MATS.hullDark);
  frame.position.y = (p.height - 0.06) / 2;
  g.add(frame);
  const pad = box(p.width, 0.06, p.depth, MATS.seatPad);
  pad.position.y = p.height - 0.03;
  g.add(pad);
  const sit = new THREE.Object3D();
  sit.name = 'sitPoint';
  sit.position.set(0, p.height + 0.005, 0);
  g.add(sit);
  g.userData.isSeat = true;
  return g;
}

// Galley counter: worktop with cabinet base; optional sink recess + status light.
function buildCounter(p) {
  const g = new THREE.Group();
  const baseH = p.height - 0.05;
  const base = box(p.width, baseH, p.depth, MATS.panel);
  base.position.y = baseH / 2;
  g.add(base);
  const top = box(p.width + 0.04, 0.05, p.depth + 0.05, MATS.worktop || MATS.hullDark); // visitor: worn worktop
  top.position.y = p.height - 0.025;
  g.add(top);
  // counter lip
  const lip = box(p.width + 0.04, 0.03, 0.03, MATS.trim, false);
  lip.position.set(0, p.height - 0.015, p.depth / 2 + 0.04);
  g.add(lip);
  // door seams on the cabinet face
  const doors = Math.max(1, Math.round(p.width / 0.5));
  for (let i = 1; i < doors; i++) {
    const seam = box(0.01, baseH * 0.82, 0.012, MATS.hullDark, false);
    seam.position.set(-p.width / 2 + i * (p.width / doors), baseH / 2, p.depth / 2 + 0.006);
    g.add(seam);
  }
  if (p.sink) {
    const basin = box(0.42, 0.02, 0.34, MATS.hullDark, false);
    basin.position.set(p.width / 2 - 0.35, p.height + 0.002, 0);
    g.add(basin);
    const tap = cyl(0.015, 0.015, 0.16, MATS.rail, 8, false);
    tap.position.set(p.width / 2 - 0.35, p.height + 0.08, -p.depth / 2 + 0.1);
    g.add(tap);
    // blinking status light by the sink
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x142014, emissive: 0x2fae62, emissiveIntensity: 1.4 }));
    lamp.position.set(p.width / 2 - 0.12, p.height + 0.02, -p.depth / 2 + 0.06);
    lamp.userData.collidable = false;
    g.add(lamp);
  }
  const reach = new THREE.Object3D();
  reach.name = 'reachPoint';
  reach.position.set(0, p.height + 0.05, p.depth / 2 + 0.15);
  g.add(reach);
  return g;
}

// Wall shelf with a row of battered tins.
function buildShelf(p) {
  const g = new THREE.Group();
  const board = box(p.width, 0.035, p.depth, MATS.panel);
  board.position.y = p.mountHeight;
  g.add(board);
  for (const s of [-1, 1]) {
    const bracket = box(0.03, 0.12, p.depth * 0.8, MATS.hullDark, false);
    bracket.position.set(s * (p.width / 2 - 0.06), p.mountHeight - 0.075, 0);
    g.add(bracket);
  }
  const n = p.tins || 0;
  for (let i = 0; i < n; i++) {
    const tin = cyl(0.05, 0.05, 0.11, MATS.warn, 12, false);
    tin.position.set(-p.width / 2 + (i + 0.7) * (p.width / (n + 0.4)), p.mountHeight + 0.073, 0);
    g.add(tin);
  }
  return g;
}

function buildCrate(p) {
  const g = new THREE.Group();
  const c = box(p.width, p.height, p.depth, MATS.warn);
  c.position.y = p.height / 2;
  g.add(c);
  return g;
}

// A scatter of loose bolts (Nova's floor toys). Not collidable.
function buildBolts(p) {
  const g = new THREE.Group();
  const n = p.count || 7;
  let seed = 12345;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n; i++) {
    const bolt = new THREE.Group();
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 6), MATS.bolt);
    head.position.y = 0.028;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.045, 10), MATS.bolt);
    shaft.position.y = 0.0;
    head.castShadow = shaft.castShadow = true;
    bolt.add(head, shaft);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set((rand() - 0.5) * p.spread, 0.016, (rand() - 0.5) * p.spread);
    bolt.rotation.y = rand() * Math.PI * 2;
    bolt.userData.collidable = false;
    g.add(bolt);
  }
  g.userData.isProp = true;
  return g;
}

// Observation dome: segmented cylindrical wall with a low entry arch (local
// +z), a glass band and cap, and a sittable ledge ring at the glass line.
// The walls are individual box segments so collision/nav stays per-segment.
function buildDomeShell(p) {
  const g = new THREE.Group();
  const r = p.radius, wallH = p.wallHeight, segs = 14;
  const archHalf = Math.asin(Math.min(0.9, (p.archWidth / 2) / r)); // angular half-width of the arch
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    // the arch faces local +z (angle 0): skip wall segments inside its span
    const d = Math.atan2(Math.sin(mid), Math.cos(mid));
    const inArch = Math.abs(d) < archHalf;
    const chord = 2 * r * Math.sin((a1 - a0) / 2);
    if (!inArch) {
      const w = box(chord * 1.06, wallH, 0.12, MATS.hull);
      w.position.set(r * Math.sin(mid), wallH / 2, r * Math.cos(mid));
      w.rotation.y = mid;
      g.add(w);
      // ledge segment inside the wall at sitting height (the dusty metal rim)
      const ledge = box(chord * 0.9, 0.06, 0.3, MATS.deckTread);
      ledge.position.set((r - 0.24) * Math.sin(mid), p.ledgeHeight, (r - 0.24) * Math.cos(mid));
      ledge.rotation.y = mid;
      g.add(ledge);
      const ledgeLeg = box(chord * 0.8, p.ledgeHeight, 0.24, MATS.hullDark);
      ledgeLeg.position.set((r - 0.22) * Math.sin(mid), p.ledgeHeight / 2, (r - 0.22) * Math.cos(mid));
      ledgeLeg.rotation.y = mid;
      g.add(ledgeLeg);
    } else {
      // lintel over the arch — "low enough to scrape anyone who walked too
      // proud". The arch cuts up through the glass line; the lintel spans
      // from archHeight to the top of the glass band.
      const top = wallH + p.glassHeight;
      const lintel = box(chord * 1.06, Math.max(0.05, top - p.archHeight), 0.12, MATS.trim);
      lintel.position.set(r * Math.sin(mid), (p.archHeight + top) / 2, r * Math.cos(mid));
      lintel.rotation.y = mid;
      g.add(lintel);
    }
  }
  // sit anchor on the ledge opposite the arch
  const sit = new THREE.Object3D();
  sit.name = 'sitPoint';
  sit.position.set(0, p.ledgeHeight + 0.03, -(r - 0.24));
  g.add(sit);
  // glass band + cap (visual only; the segments below carry collision)
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, p.glassHeight, 24, 1, true), MATS.glass);
  band.position.y = wallH + p.glassHeight / 2;
  band.userData.collidable = false;
  band.userData.isWindow = true;
  g.add(band);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), MATS.glass);
  cap.scale.y = 0.45;
  cap.position.y = wallH + p.glassHeight;
  cap.userData.collidable = false;
  cap.userData.isWindow = true;
  g.add(cap);
  g.userData.isViewport = true;
  return g;
}

// ---------- registry ----------
// Hull massing volume: a translucent honest-mass box (tankage, machinery,
// gear bays, unbuilt deck volume). Never collides, never blocks walking —
// it reserves believable hull volume around the walkable interior.
// params: width, depth, height, lift (base offset above the record's deck y)
function buildMassing(p) {
  const g = new THREE.Group();
  const bad = p.tint === 'anomaly';
  const geo = new THREE.BoxGeometry(p.width, p.height, p.depth);
  const m = new THREE.Mesh(geo, bad ? MATS.massingBad : MATS.massing);
  m.castShadow = false; m.receiveShadow = false;
  m.userData.collidable = false;
  m.position.y = (p.lift ?? 0) + p.height / 2;
  g.add(m);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), bad ? MATS.massingEdgeBad : MATS.massingEdge);
  edges.position.copy(m.position);
  g.add(edges);
  return g;
}

// Conduit run: a bundle of parallel lines along local z at a mount height.
// era 'ancient' renders the unmapped pre-refit harness. Never collides.
// params: length, lines, gauge, mountHeight, era
function buildConduit(p) {
  const g = new THREE.Group();
  const n = Math.max(1, Math.round(p.lines ?? 2));
  const gauge = p.gauge ?? 0.07;
  const mat = p.era === 'ancient' ? MATS.conduitOld : MATS.conduit;
  const pitch = gauge * 1.7;
  for (let i = 0; i < n; i++) {
    const line = box(gauge, gauge, p.length, mat, false);
    line.position.set((i - (n - 1) / 2) * pitch, (p.mountHeight ?? 1.9) + gauge / 2, 0);
    g.add(line);
  }
  // clamps every ~1.6 m
  const clamps = Math.max(1, Math.floor(p.length / 1.6));
  for (let c = 0; c < clamps; c++) {
    const cl = box(n * pitch + gauge, 0.03, 0.06, mat, false);
    cl.position.set(0, (p.mountHeight ?? 1.9) + gauge + 0.015, -p.length / 2 + (c + 0.5) * (p.length / clamps));
    g.add(cl);
  }
  return g;
}

export const OBJECT_TYPES = {
  massing: {
    label: 'Hull massing',
    build: buildMassing,
    defaults: { width: 2, depth: 2, height: 2, lift: 0 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.2, max: 20, step: 0.1 },
      { key: 'depth', label: 'Depth (m)', min: 0.2, max: 20, step: 0.1 },
      { key: 'height', label: 'Height (m)', min: 0.2, max: 12, step: 0.1 },
      { key: 'lift', label: 'Base offset (m)', min: -8, max: 8, step: 0.1 },
      { key: 'tint', label: 'Tint', options: ['normal', 'anomaly'] },
    ],
  },
  conduit: {
    label: 'Conduit run',
    build: buildConduit,
    defaults: { length: 4, lines: 2, gauge: 0.07, mountHeight: 1.9, era: 'modern' },
    schema: [
      { key: 'length', label: 'Length (m)', min: 0.5, max: 30, step: 0.1 },
      { key: 'lines', label: 'Lines', min: 1, max: 6, step: 1 },
      { key: 'gauge', label: 'Gauge (m)', min: 0.03, max: 0.4, step: 0.01 },
      { key: 'mountHeight', label: 'Mount height (m)', min: 0, max: 3, step: 0.05 },
      { key: 'era', label: 'Era', options: ['modern', 'ancient'] },
    ],
  },
  floor: {
    label: 'Floor',
    build: buildFloor,
    defaults: { width: 6, depth: 5 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 1, max: 30, step: 0.1 },
      { key: 'depth', label: 'Depth (m)', min: 1, max: 30, step: 0.1 },
    ],
  },
  ceiling: {
    label: 'Ceiling',
    build: buildCeiling,
    defaults: { width: 6, depth: 5, height: 2.3 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 1, max: 30, step: 0.1 },
      { key: 'depth', label: 'Depth (m)', min: 1, max: 30, step: 0.1 },
      { key: 'height', label: 'Height (m)', min: 1.6, max: 6, step: 0.05 },
    ],
  },
  wall: {
    label: 'Wall',
    build: buildWall,
    defaults: { length: 4, height: 2.3, thickness: 0.16 },
    schema: [
      { key: 'length', label: 'Length (m)', min: 0.3, max: 30, step: 0.1 },
      { key: 'height', label: 'Height (m)', min: 0.5, max: 6, step: 0.05 },
      { key: 'thickness', label: 'Thickness (m)', min: 0.05, max: 0.6, step: 0.01 },
    ],
  },
  doorway: {
    label: 'Door',
    build: buildDoorway,
    defaults: { length: 2.4, height: 2.3, thickness: 0.16, doorWidth: 0.85, doorHeight: 2.0, kind: 'sliding', hinge: 'left', swing: 'in', open: 0 },
    schema: [
      { key: 'length', label: 'Wall length (m)', min: 1, max: 12, step: 0.1 },
      { key: 'height', label: 'Wall height (m)', min: 1.8, max: 6, step: 0.05 },
      { key: 'doorWidth', label: 'Door width (m)', min: 0.5, max: 2.4, step: 0.05 },
      { key: 'doorHeight', label: 'Door height (m)', min: 1.6, max: 2.6, step: 0.05 },
      { key: 'kind', label: 'Mechanism', options: ['sliding', 'hinged'] },
      { key: 'hinge', label: 'Hinge side', options: ['left', 'right'] },
      { key: 'swing', label: 'Swing', options: ['in', 'out'] },
      { key: 'open', label: 'Open (0–1)', min: 0, max: 1, step: 0.05 },
    ],
  },
  viewport: {
    label: 'Viewport wall',
    build: buildViewportWall,
    defaults: { length: 5.6, height: 2.3, thickness: 0.18, sillHeight: 0.95, windowHeight: 0.95, rake: 0 },
    schema: [
      { key: 'length', label: 'Length (m)', min: 1, max: 20, step: 0.1 },
      { key: 'height', label: 'Height (m)', min: 1.8, max: 6, step: 0.05 },
      { key: 'sillHeight', label: 'Sill height (m)', min: 0.3, max: 2, step: 0.05 },
      { key: 'windowHeight', label: 'Window height (m)', min: 0.3, max: 2.5, step: 0.05 },
    ],
  },
  console: {
    label: 'Console',
    build: buildConsole,
    defaults: { width: 1.2, depth: 0.75, height: 0.92, screens: 2, kind: 'seated', lit: true },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.4, max: 5, step: 0.05 },
      { key: 'depth', label: 'Depth (m)', min: 0.3, max: 1.6, step: 0.05 },
      { key: 'height', label: 'Height (m)', min: 0.6, max: 1.4, step: 0.02 },
      { key: 'screens', label: 'Screens', min: 1, max: 4, step: 1 },
    ],
  },
  seat: {
    label: 'Crew seat',
    build: buildSeat,
    defaults: { seatHeight: 0.46, width: 0.52, hasArms: true },
    schema: [
      { key: 'seatHeight', label: 'Seat height (m)', min: 0.3, max: 0.7, step: 0.01 },
      { key: 'width', label: 'Width (m)', min: 0.4, max: 0.9, step: 0.02 },
      { key: 'hasArms', label: 'Armrests', options: [true, false] },
    ],
  },
  rail: {
    label: 'Rail',
    build: buildRail,
    defaults: { length: 2.2, height: 0.92, midRail: true },
    schema: [
      { key: 'length', label: 'Length (m)', min: 0.4, max: 12, step: 0.1 },
      { key: 'height', label: 'Height (m)', min: 0.5, max: 1.3, step: 0.02 },
      { key: 'midRail', label: 'Mid rail', options: [true, false] },
    ],
  },
  storage: {
    label: 'Storage locker',
    build: buildStorage,
    defaults: { width: 1.1, height: 1.8, depth: 0.5 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.3, max: 4, step: 0.05 },
      { key: 'height', label: 'Height (m)', min: 0.3, max: 2.4, step: 0.05 },
      { key: 'depth', label: 'Depth (m)', min: 0.2, max: 1.2, step: 0.05 },
    ],
  },
  step: {
    label: 'Steps',
    build: buildStep,
    defaults: { width: 1.6, rise: 0.16, run: 0.3, steps: 2 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.4, max: 6, step: 0.1 },
      { key: 'rise', label: 'Rise (m)', min: 0.08, max: 0.3, step: 0.01 },
      { key: 'run', label: 'Run (m)', min: 0.2, max: 0.5, step: 0.01 },
      { key: 'steps', label: 'Steps', min: 1, max: 12, step: 1 },
    ],
  },
  strut: {
    label: 'Structural rib',
    build: buildStrut,
    defaults: { width: 0.22, height: 2.3, depth: 0.22 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.08, max: 1, step: 0.02 },
      { key: 'height', label: 'Height (m)', min: 0.5, max: 6, step: 0.05 },
      { key: 'depth', label: 'Depth (m)', min: 0.08, max: 1, step: 0.02 },
    ],
  },
  table: {
    label: 'Table',
    build: buildTable,
    defaults: { width: 1.2, depth: 0.8, height: 0.74 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.3, max: 3, step: 0.05 },
      { key: 'depth', label: 'Depth (m)', min: 0.3, max: 2, step: 0.05 },
      { key: 'height', label: 'Height (m)', min: 0.4, max: 1.2, step: 0.02 },
    ],
  },
  domeShell: {
    label: 'Observation dome',
    build: buildDomeShell,
    defaults: { radius: 1.25, wallHeight: 1.0, glassHeight: 0.95, archWidth: 0.85, archHeight: 1.78, ledgeHeight: 0.4 },
    schema: [
      { key: 'radius', label: 'Radius (m)', min: 0.8, max: 4, step: 0.05 },
      { key: 'wallHeight', label: 'Wall height (m)', min: 0.5, max: 2, step: 0.05 },
      { key: 'glassHeight', label: 'Glass band (m)', min: 0.3, max: 2, step: 0.05 },
      { key: 'archHeight', label: 'Arch height (m)', min: 1.4, max: 2.2, step: 0.02 },
      { key: 'ledgeHeight', label: 'Ledge height (m)', min: 0.2, max: 0.7, step: 0.02 },
    ],
  },
  counter: {
    label: 'Counter',
    build: buildCounter,
    defaults: { width: 1.6, depth: 0.55, height: 0.9, sink: true },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.5, max: 4, step: 0.05 },
      { key: 'depth', label: 'Depth (m)', min: 0.3, max: 1, step: 0.05 },
      { key: 'height', label: 'Height (m)', min: 0.6, max: 1.2, step: 0.02 },
      { key: 'sink', label: 'Sink', options: [true, false] },
    ],
  },
  shelf: {
    label: 'Wall shelf',
    build: buildShelf,
    defaults: { width: 1.0, depth: 0.24, mountHeight: 1.3, tins: 3 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.3, max: 2.5, step: 0.05 },
      { key: 'mountHeight', label: 'Height (m)', min: 0.5, max: 2, step: 0.05 },
      { key: 'tins', label: 'Tins', min: 0, max: 8, step: 1 },
    ],
  },
  bench: {
    label: 'Bench',
    build: buildBench,
    defaults: { width: 1.3, height: 0.42, depth: 0.45 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.4, max: 3, step: 0.05 },
      { key: 'height', label: 'Height (m)', min: 0.25, max: 0.7, step: 0.01 },
      { key: 'depth', label: 'Depth (m)', min: 0.25, max: 1, step: 0.05 },
    ],
  },
  crate: {
    label: 'Crate',
    build: buildCrate,
    defaults: { width: 0.7, height: 0.6, depth: 0.7 },
    schema: [
      { key: 'width', label: 'Width (m)', min: 0.2, max: 2, step: 0.05 },
      { key: 'height', label: 'Height (m)', min: 0.2, max: 2, step: 0.05 },
      { key: 'depth', label: 'Depth (m)', min: 0.2, max: 2, step: 0.05 },
    ],
  },
  bolts: {
    label: 'Loose bolts',
    build: buildBolts,
    defaults: { count: 7, spread: 0.6 },
    schema: [
      { key: 'count', label: 'Count', min: 1, max: 30, step: 1 },
      { key: 'spread', label: 'Spread (m)', min: 0.2, max: 2, step: 0.1 },
    ],
  },
};

// Build a THREE group for an object record {type, params}.
export function buildObject(record) {
  const def = OBJECT_TYPES[record.type];
  if (!def) throw new Error(`Unknown object type ${record.type}`);
  const params = { ...def.defaults, ...record.params };
  const g = def.build(params);
  g.userData.objectId = record.id;
  g.userData.objectType = record.type;
  g.position.set(...record.pos);
  g.rotation.y = record.rotY || 0;
  return g;
}
