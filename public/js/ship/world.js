// Builds the visitor-facing Wild Huntress from Roomwright's exported
// geometry (data/ship/geometry.json, layout v34). Nothing is moved: every
// wall, door, stair and fixed fitting is rebuilt from its exported record.
// Static geometry is merged per room and material for speed; doors stay live
// so visitors can operate them.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/addons/BufferGeometryUtils.js';
import { buildObject, MATS } from './objects.js';
import { upgradeMaterials, TILE } from './materials.js';
import { buildDressing } from './dressing.js';

// Roomwright draws several fittings as generic amber "crate" blocks. In the
// visitor build the ones people live with get a believable finish.
const MATERIAL_OVERRIDES = {
  'Nav lock lever bank': 'hullDark',
  'Cooling unit': 'panel',
  'Corner fan': 'hullDark',
  'Sterilizer unit': 'panel',
};

// Editor-only record types that never appear in the visitor build.
const EDITOR_ONLY_TYPES = new Set(['massing']);

export class ShipWorld {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'ship';
    scene.add(this.root);
    this.records = [];
    this.floors = [];          // {room, x, z, hw, hd, y}
    this.treads = [];          // Box3 (stair treads / sills: walkable)
    this.colliders = [];       // Box3 static
    this.grid = new Map();     // spatial hash of colliders
    this.doors = [];           // {rec, group, leafG, leaf, wheel, open, target, ...}
    this.anchors = [];         // {kind:'sit'|'reach', room, pos, rec}
    this.screens = [];
    this.lamps = [];
    this.roomInfo = {};
    this.excluded = [];
    this.facingFixes = [];
  }

  async load({ geometryUrl, roomsUrl }) {
    const [geo, rooms] = await Promise.all([
      fetch(geometryUrl).then(r => r.json()),
      fetch(roomsUrl).then(r => r.json()),
    ]);
    this.version = geo.version;
    this.roomInfo = rooms.rooms;
    this.exclusions = rooms.exclusions || [];
    upgradeMaterials();
    const exclusionNames = new Set(this.exclusions.map(e => e.name));
    geo.objects.forEach((rec, i) => {
      rec.id = `o${i}`;
      if (EDITOR_ONLY_TYPES.has(rec.type)) return;
      if (exclusionNames.has(rec.name)) { this.excluded.push(rec); return; }
      this.records.push(rec);
    });
    this._collectFloors();
    this._fixFacings();
    this._build();
    buildDressing(this);
    this._buildGrid();
    return this;
  }

  recordByName(name, room) {
    return this.records.find(r => r.name === name && (!room || r.room === room));
  }

  _collectFloors() {
    for (const rec of this.records) {
      if (rec.type !== 'floor') continue;
      const rot = Math.abs(Math.sin(rec.rotY || 0)) > 0.5;
      const w = rec.params.width, d = rec.params.depth;
      this.floors.push({
        room: rec.room, name: rec.name, x: rec.pos[0], z: rec.pos[2], y: rec.pos[1] || 0,
        hw: (rot ? d : w) / 2, hd: (rot ? w : d) / 2,
      });
    }
  }

  floorAt(x, z, y) {
    let best = null;
    for (const f of this.floors) {
      if (Math.abs(x - f.x) <= f.hw && Math.abs(z - f.z) <= f.hd && Math.abs(f.y - y) < 1.2) {
        // prefer the smallest containing floor (rooms over overlapping spines)
        if (!best || f.hw * f.hd < best.hw * best.hd) best = f;
      }
    }
    return best;
  }

  // Roomwright stores counters and lockers with their detailed face on local
  // +z. A few exported records face that detail into the wall behind them
  // (footprints are symmetric, so the plan is unaffected). The visitor build
  // mirrors only the face details back into the room and logs each case.
  _fixFacings() {
    for (const rec of this.records) {
      if (rec.type !== 'counter' && rec.type !== 'storage') continue;
      const d = rec.params.depth ?? 0.5;
      const fx = Math.sin(rec.rotY || 0), fz = Math.cos(rec.rotY || 0);
      const y = rec.pos[1] || 0;
      const probe = (s) => this.floorAt(rec.pos[0] + fx * s * (d / 2 + 0.3), rec.pos[2] + fz * s * (d / 2 + 0.3), y);
      const front = probe(1), back = probe(-1);
      if (!front && back) {
        rec.params = { ...rec.params, faceFlip: true };
        this.facingFixes.push(`${rec.room}: ${rec.name}`);
      }
    }
  }

  _build() {
    const buckets = new Map(); // key -> {mat, geos:[], room}
    const tmp = new THREE.Vector3();
    for (const rec of this.records) {
      const g = buildObject(rec);
      if (rec.params.faceFlip) mirrorFaceDetails(g);
      const ov = MATERIAL_OVERRIDES[rec.name];
      if (ov) g.traverse(o => { if (o.isMesh && o.material === MATS.warn) o.material = MATS[ov]; });
      g.userData.record = rec;
      this.root.add(g);
      g.updateMatrixWorld(true);
      const deckY = rec.pos[1] || 0;
      g.traverse(o => {
        if (o.name === 'sitPoint' || o.name === 'reachPoint') {
          this.anchors.push({ kind: o.name === 'sitPoint' ? 'sit' : 'reach', room: rec.room, rec, pos: o.getWorldPosition(new THREE.Vector3()) });
        }
      });
      if (rec.type === 'doorway') { this._registerDoor(rec, g); continue; }
      const meshes = [];
      g.traverse(o => { if (o.isMesh) meshes.push(o); });
      for (const m of meshes) {
        if (m.userData.collidable && rec.type !== 'floor' && rec.type !== 'ceiling' && rec.type !== 'bolts') {
          const bb = new THREE.Box3().setFromObject(m);
          if (rec.type === 'step') this.treads.push(bb);
          else this.colliders.push(bb);
        }
        if (m.userData.isScreen) { this.screens.push(m); continue; }        // kept live for subtle animation
        if (m.material !== MATS.glass && m.material.emissive && m.material.emissiveIntensity > 1.2) { this.lamps.push(m); continue; }
        if (m.material.transparent) continue;                               // glass handled below
        const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
        prepareGeometry(geo, deckY, ROOM_TINT[rec.room] || ROOM_TINT._other);
        const key = `${rec.room}|${m.material.uuid}`;
        if (!buckets.has(key)) buckets.set(key, { mat: m.material, geos: [], room: rec.room });
        buckets.get(key).geos.push(geo);
      }
      // keep live meshes (screens, lamps, glass); drop the merged ones
      const keep = [];
      g.traverse(o => { if (o.isMesh && (o.userData.isScreen || this.lamps.includes(o) || o.material.transparent)) keep.push(o); });
      if (keep.length) {
        for (const k of keep) { k.updateMatrixWorld(true); const wm = k.matrixWorld.clone(); k.removeFromParent(); wm.decompose(k.position, k.quaternion, k.scale); this.root.add(k); }
      }
      g.removeFromParent();
    }
    this.merged = [];
    for (const [key, b] of buckets) {
      const geo = mergeGeometries(b.geos, false);
      b.geos.forEach(x => x.dispose());
      const mat = vertexColoured(b.mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `merged:${key}`;
      mesh.userData.room = b.room;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      this.merged.push(mesh);
    }
  }

  _registerDoor(rec, g) {
    const leafG = g.getObjectByName('doorLeaf');
    const leaf = leafG?.children.find(c => c.isMesh && c.geometry.type === 'BoxGeometry');
    const wheel = leafG?.children.find(c => c.isMesh && c.geometry.type === 'TorusGeometry');
    if (leaf && wheel) {
      // visitor: the manual wheel on both faces, a kick plate and a stencil band
      for (const side of [1, -1]) {
        const w = wheel.clone();
        w.position.set(wheel.position.x - leaf.position.x, wheel.position.y - leaf.position.y, side * 0.06);
        leaf.add(w);
      }
      wheel.visible = false;
      const kick = new THREE.Mesh(new THREE.BoxGeometry(rec.params.doorWidth - 0.06, 0.18, 0.07), MATS.hullDark);
      kick.position.set(0, -(rec.params.doorHeight - 0.02) / 2 + 0.11, 0); leaf.add(kick);
      const band = new THREE.Mesh(new THREE.BoxGeometry(rec.params.doorWidth - 0.04, 0.05, 0.065), MATS.warn);
      band.position.set(0, 0.1, 0); leaf.add(band);
      leaf.children.forEach(c => { c.userData.collidable = false; });
    }
    g.traverse(o => {
      if (!o.isMesh) return;
      let p = o, inLeaf = false;
      while (p && p !== g) { if (p.userData.isDoorLeaf) inLeaf = true; p = p.parent; }
      if (!inLeaf && o.userData.collidable) this.colliders.push(new THREE.Box3().setFromObject(o));
      o.userData.doorId = rec.id;
    });
    const room = rec.room;
    const info = this.roomInfo[room] || {};
    const door = {
      id: rec.id, rec, group: g, leafG, leaf, wheel, room,
      name: rec.name,
      open: rec.params.open ?? 0, target: rec.params.open ?? 0,
      kind: rec.params.kind, params: rec.params,
      // seconds for a full stroke: these are manual hatches, not snap doors
      stroke: rec.params.kind === 'hinged' ? 1.1 : 1.6,
      leafBox: new THREE.Box3(),
      developed: !!info.developed,
    };
    this.doors.push(door);
    applyDoor(door);
  }

  _buildGrid() {
    const CELL = 1.0;
    this.cell = CELL;
    this.colliders.forEach((bb, i) => {
      for (let cx = Math.floor(bb.min.x / CELL); cx <= Math.floor(bb.max.x / CELL); cx++)
        for (let cz = Math.floor(bb.min.z / CELL); cz <= Math.floor(bb.max.z / CELL); cz++) {
          const k = `${cx},${cz}`;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(i);
        }
    });
  }

  // Does a circle at (x,z) radius r hit a collider in [yLo,yHi]?
  hits(x, z, r, yLo, yHi) {
    const C = this.cell, seen = new Set();
    for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++)
      for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
        const list = this.grid.get(`${cx},${cz}`);
        if (!list) continue;
        for (const i of list) {
          if (seen.has(i)) continue; seen.add(i);
          if (circleBox(x, z, r, yLo, yHi, this.colliders[i])) return { type: 'static', i };
        }
      }
    for (const d of this.doors) {
      if (!d.leaf) continue;
      if (Math.abs(d.rec.pos[0] - x) > 2.5 || Math.abs(d.rec.pos[2] - z) > 2.5) continue;
      if (circleBox(x, z, r, yLo, yHi, d.leafBox)) return { type: 'door', door: d };
    }
    return null;
  }

  // Is the straight line a→b (at height y) interrupted by a wall, fitting or
  // a door leaf? Used so visitors cannot reach through bulkheads or shut hatches.
  lineBlocked(a, b, y, ignoreDoor = null, endSlack = 0.35) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const n = Math.ceil(len / 0.04);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (len * (1 - t) < endSlack) break;
      const x = a.x + dx * t, z = a.z + dz * t;
      const list = this.grid.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`);
      if (list) for (const k of list) {
        const bb = this.colliders[k];
        if (x >= bb.min.x && x <= bb.max.x && z >= bb.min.z && z <= bb.max.z && y >= bb.min.y && y <= bb.max.y) return true;
      }
      for (const d of this.doors) {
        if (d === ignoreDoor || !d.leaf) continue;
        const bb = d.leafBox;
        if (x >= bb.min.x && x <= bb.max.x && z >= bb.min.z && z <= bb.max.z && y >= bb.min.y && y <= bb.max.y) return true;
      }
    }
    return false;
  }

  // Walking surface under (x,z) reachable from the current ground: floors and
  // stair treads ≤0.32 m up, ≤0.45 m down (Roomwright's walker rule).
  groundAt(x, z, current) {
    let best = null;
    for (const f of this.floors) {
      if (Math.abs(x - f.x) <= f.hw && Math.abs(z - f.z) <= f.hd) {
        if (f.y <= current + 0.32 && (best === null || f.y > best)) best = f.y;
      }
    }
    for (const bb of this.treads) {
      if (x >= bb.min.x && x <= bb.max.x && z >= bb.min.z && z <= bb.max.z) {
        const y = bb.max.y;
        if (y <= current + 0.32 && (best === null || y > best)) best = y;
      }
    }
    if (best === null) return null;
    if (best < current - 0.45) return null;
    return best;
  }

  roomAt(pos, eye = 1.6) {
    return this.floorAt(pos.x, pos.z, pos.y - eye)?.room || null;
  }

  update(dt) {
    for (const d of this.doors) {
      if (d.open === d.target) continue;
      const step = dt / d.stroke;
      d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
      applyDoor(d);
    }
  }
}

function circleBox(x, z, r, yLo, yHi, bb) {
  if (bb.max.y < yLo || bb.min.y > yHi) return false;
  const cx = Math.max(bb.min.x, Math.min(x, bb.max.x));
  const cz = Math.max(bb.min.z, Math.min(z, bb.max.z));
  return (cx - x) ** 2 + (cz - z) ** 2 < r * r;
}

// Mirror builder detail parts (lips, seams, latches, taps) from local +z to
// -z. The main boxes are centred on the footprint so they are unaffected.
function mirrorFaceDetails(g) {
  g.traverse(o => {
    if (o === g || o.parent !== g) return;
    o.position.z = -o.position.z;
  });
}

// Same transforms as Roomwright's buildDoorway, driven by d.open.
export function applyDoor(d) {
  const p = d.params;
  if (!d.leafG || !d.leaf) return;
  if (p.kind === 'hinged') {
    const s = p.hinge === 'right' ? 1 : -1;
    d.leafG.rotation.y = -s * d.open * (Math.PI / 2) * ((p.swing === 'in') ? -1 : 1);
  } else {
    const dir = p.slideDir ?? 1;
    d.leaf.position.x = dir * d.open * (p.doorWidth - 0.04);
    if (d.wheel) d.wheel.position.x = d.leaf.position.x - 0.25;
  }
  d.group.updateMatrixWorld(true);
  d.leafBox.setFromObject(d.leaf);
}

// World-space box-projected UVs + a height-based ambient-occlusion tint.
// Paint differs by room: refits never matched. Developed rooms get their own
// character; unfinished compartments stay a flat, dull blockout grey.
const ROOM_TINT = {
  bridge: [0.84, 0.9, 1.0], corridor: [0.93, 0.97, 0.93], galley: [1.04, 0.97, 0.86],
  stairwell: [0.9, 0.92, 0.95], _other: [0.82, 0.83, 0.85],
};

function prepareGeometry(geo, deckY, tint) {
  if (geo.index) { const g2 = geo.toNonIndexed(); geo.copy(g2); g2.dispose(); }
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const n = pos.count;
  const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / TILE; uv[i * 2 + 1] = v / TILE;
    const h = y - deckY;
    let ao = 1;
    if (ny < 0.7) ao = 0.62 + 0.38 * Math.min(1, Math.max(0, h / 0.7));   // grime and shadow pool low on verticals
    if (h > 1.95) ao *= 0.86;                                              // overhead corners fall off
    if (nor.getY(i) < -0.7) ao *= 0.8;                                     // undersides
    col[i * 3] = ao * tint[0]; col[i * 3 + 1] = ao * tint[1]; col[i * 3 + 2] = ao * tint[2];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

const vcCache = new Map();
function vertexColoured(mat) {
  if (vcCache.has(mat.uuid)) return vcCache.get(mat.uuid);
  const m = mat.clone();
  m.vertexColors = true;
  vcCache.set(mat.uuid, m);
  return m;
}
