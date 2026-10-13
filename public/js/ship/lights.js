// Practical lighting. The developed rooms get hand-placed fixtures (ceiling
// channels, console spill, the warm strip under the galley tin shelf); every
// other compartment gets plain ceiling fills generated from its floor plate,
// like Roomwright's. A fixed pool of point lights is re-aimed at the nearest
// fixtures each frame, so shader cost stays constant anywhere aboard.
import * as THREE from 'three';

const POOL = 10;

export class LightRig {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.hemi = new THREE.HemisphereLight(0xc9cdd2, 0x2e2b28, 0.75);
    scene.add(this.hemi);
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 2);
      scene.add(l); this.pool.push(l);
    }
    this.fixtures = this._fixtures();
    this.level = 1;
    this._fixturePanels();
  }

  _fixtures() {
    const W = this.world, F = [];
    const R = (name, room) => W.recordByName(name, room);
    const add = (x, y, z, color, intensity, distance, room, opts = {}) => F.push({ p: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, distance, room, ...opts });
    // bridge: kept low-lit, as she likes it (Next-02) — dim warm
    // overheads, cool console spill that does most of the work
    add(-0.9, 2.12, 0.9, 0xffdcb4, 3.4, 6, 'bridge');
    add(1.2, 2.12, 0.9, 0xffdcb4, 3.4, 6, 'bridge');
    add(0.2, 2.12, -1.0, 0xffe6c8, 1.6, 4, 'bridge');
    add(0.1, 1.15, -1.1, 0x4fb6d0, 1.6, 2.6, 'bridge', { flicker: 0.04, noPanel: true });
    add(1.35, 1.15, -1.0, 0x4fb6d0, 1.2, 2.4, 'bridge', { flicker: 0.05, noPanel: true });
    add(-1.25, 1.12, -0.75, 0xe0a35a, 1.4, 2.6, 'bridge', { noPanel: true });
    add(1.5, 1.9, 2.0, 0xf0e2cc, 1.3, 3.2, 'bridge');
    // corridor: ceiling channels, slightly cooler, one every ~1.6 m
    for (const z of [3.1, 4.6]) add(1.5, 2.05, z, 0xe8eef4, 2.4, 4.2, 'corridor');
    add(0.95, 2.05, 5.05, 0xe8eef4, 2.0, 3.6, 'corridor');
    for (const z of [6.0, 7.3]) add(0.35, 2.05, z, 0xe8eef4, 2.2, 4.0, 'corridor');
    // galley: warm room. Working half forward, eating/lingering half aft.
    add(-0.8, 2.05, 8.9, 0xffe0b8, 3.4, 5.5, 'galley');
    add(-0.8, 2.05, 11.4, 0xffd6a8, 3.6, 5.5, 'galley');
    const shelf = R('Tin shelf', 'galley');
    if (shelf) add(shelf.pos[0] + 0.25, shelf.params.mountHeight - 0.06, shelf.pos[2], 0xffc98a, 1.6, 2.6, 'galley');
    const table = R('Galley table', 'galley');
    if (table) add(table.pos[0], 1.75, table.pos[2], 0xffd2a0, 1.8, 3.0, 'galley');
    const heater = R('Heating / hydration unit', 'galley');
    if (heater) add(heater.pos[0] - 0.3, 1.25, heater.pos[2], 0xffb070, 0.45, 1.4, 'galley');
    // everything else: generated ceiling fills, neutral and modest
    const done = new Set(['bridge', 'corridor', 'galley']);
    for (const f of W.floors) {
      if (done.has(f.room)) continue;
      const long = Math.max(f.hw, f.hd) * 2, along = f.hd >= f.hw ? 'z' : 'x';
      const n = Math.max(1, Math.round(long / 2.6));
      const ceilY = f.y + (f.room === 'cargo-bay' ? 2.9 : 1.95);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        add(f.x + (along === 'x' ? t * long * 0.8 : 0), ceilY, f.z + (along === 'z' ? t * long * 0.8 : 0),
          f.room === 'dome' ? 0x9fb4d0 : 0xdfe6ee, f.room === 'dome' ? 0.4 : Math.min(3.2, 1.2 + f.hw * f.hd * 0.35), Math.max(3.5, long * 0.9), f.room);
      }
    }
    return F;
  }

  // Visible light sources: a lit diffuser panel for every ceiling fixture.
  _fixturePanels() {
    const ceil = this.fixtures.filter(f => f.p.y >= 1.85 && !f.noPanel);
    const geo = new THREE.BoxGeometry(0.62, 0.025, 0.16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xfff1dc, emissiveIntensity: 0.85, roughness: 0.6 });
    const inst = new THREE.InstancedMesh(geo, mat, ceil.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    ceil.forEach((f, i) => {
      const along = this.world.floorAt(f.p.x, f.p.z, f.p.y - 1.9);
      const rotate = along && along.hw > along.hd; // run the panel along the room's long axis
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotate ? 0 : Math.PI / 2);
      m.compose(new THREE.Vector3(f.p.x, f.p.y + 0.06, f.p.z), q, sc);
      inst.setMatrixAt(i, m);
    });
    inst.name = 'light-fixtures';
    this.scene.add(inst);
  }

  setLevel(v) { this.level = v; }

  update(camPos, t, reduced) {
    // nearest fixtures, same deck preferred
    const scored = this.fixtures.map(f => ({ f, d: f.p.distanceToSquared(camPos) + (Math.abs(f.p.y - camPos.y) > 2.4 ? 60 : 0) }));
    scored.sort((a, b) => a.d - b.d);
    for (let i = 0; i < POOL; i++) {
      const l = this.pool[i], s = scored[i];
      if (!s) { l.intensity = 0; continue; }
      const f = s.f;
      l.position.copy(f.p);
      l.color.copy(f.color);
      l.distance = f.distance;
      let k = 1;
      if (f.flicker && !reduced) k = 1 - f.flicker * (0.5 + 0.5 * Math.sin(t * 3.1 + f.p.x * 7));
      l.intensity = f.intensity * k * this.level;
    }
  }
}
