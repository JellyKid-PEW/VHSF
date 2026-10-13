// Ship ambience: generated live with the Web Audio API. No recordings.
//
// Five layers, each a small synthesis graph built from filtered noise,
// low partials and scheduled one-shot events (hull ticks, relay clicks,
// heater cycles, the aft pump running "two beats late"). Nothing starts
// until the visitor explicitly asks for sound. One engine per page; other
// tabs are told to fall silent through a BroadcastChannel.

export const LAYERS = [
  { id: 'drive', label: 'Drive', hint: 'Low drive and the aft pump' },
  { id: 'air', label: 'Ventilation', hint: 'Duct air and the port seam' },
  { id: 'structure', label: 'Structure', hint: 'Hull ticks, frame vibration' },
  { id: 'consoles', label: 'Consoles', hint: 'Electrical hum, relays, status chirps' },
  { id: 'galley', label: 'Galley appliances', hint: 'Heater cycle, cooling unit, water, fan' },
];

// Room presets: balance per layer (0–1). Rooms without their own preset use
// the deck preset named in rooms.json.
export const PRESETS = {
  bridge:   { label: 'Bridge',   mix: { drive: 0.55, air: 0.35, structure: 0.45, consoles: 0.7, galley: 0.08 } },
  corridor: { label: 'Corridor', mix: { drive: 0.6, air: 0.55, structure: 0.5, consoles: 0.2, galley: 0.22 } },
  galley:   { label: 'Galley',   mix: { drive: 0.4, air: 0.5, structure: 0.35, consoles: 0.12, galley: 0.75 } },
  lower:    { label: 'Lower deck', mix: { drive: 0.75, air: 0.45, structure: 0.6, consoles: 0.15, galley: 0.0 } },
  quiet:    { label: 'Quiet',    mix: { drive: 0.35, air: 0.3, structure: 0.25, consoles: 0.1, galley: 0.05 } },
};

const STORE_KEY = 'vh:sound:v1';
const DEFAULTS = { master: 0.6, muted: false, mode: 'follow', mix: { ...PRESETS.bridge.mix }, wasPlaying: false };

function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (s) return { ...DEFAULTS, ...s, mix: { ...DEFAULTS.mix, ...(s.mix || {}) } }; } catch { /* storage blocked */ }
  return structuredClone(DEFAULTS);
}

class SoundEngine extends EventTarget {
  constructor() {
    super();
    this.prefs = load();
    this.ctx = null;
    this.playing = false;
    this.room = 'bridge';
    this.presetFor = room => PRESETS[room] ? room : 'quiet';
    this.effective = { ...this.prefs.mix };
    this.layerGains = {};
    this.timers = [];
    this.id = Math.random().toString(36).slice(2);
    try {
      this.bc = new BroadcastChannel('vh-sound');
      this.bc.onmessage = e => { if (e.data?.type === 'playing' && e.data.id !== this.id && this.playing) this.stop('another-tab'); };
    } catch { /* no BroadcastChannel */ }
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...this.prefs, wasPlaying: this.playing })); } catch { /* ignore */ }
  }
  emit() { this.dispatchEvent(new Event('change')); }

  // ---- public API ----
  async start() {
    if (this.playing) return;
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.playing = true;
    this._applyMaster(1.2);
    this._applyMix(0.8);
    this._startScheduler();
    this.bc?.postMessage({ type: 'playing', id: this.id });
    this.save(); this.emit();
  }
  stop(reason = 'user') {
    if (!this.playing) return;
    this.playing = false;
    this.stoppedBy = reason;
    this._stopScheduler();
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(0, t, 0.25);
      setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, 1200);
    }
    if (reason === 'user') this.save();
    this.emit();
  }
  toggle() { return this.playing ? this.stop() : this.start(); }
  setMaster(v) { this.prefs.master = clamp01(v); this._applyMaster(0.15); this.save(); this.emit(); }
  setMuted(m) { this.prefs.muted = !!m; this._applyMaster(0.3); this.save(); this.emit(); }
  setLayer(id, v) {
    // adjusting a layer is choosing your own balance: stop following rooms
    if (this.prefs.mode === 'follow') { this.prefs.mix = { ...this.effective }; this.prefs.mode = 'keep'; this.modeChangedBy = 'slider'; }
    this.prefs.mix[id] = clamp01(v);
    this._applyMix(0.2); this.save(); this.emit();
  }
  setMode(mode) {
    this.prefs.mode = mode === 'keep' ? 'keep' : 'follow';
    this.modeChangedBy = 'user';
    if (this.prefs.mode === 'keep') this.prefs.mix = { ...this.effective };
    this._applyMix(3); this.save(); this.emit();
  }
  applyPreset(name) {
    const p = PRESETS[name]; if (!p) return;
    this.prefs.mix = { ...p.mix }; this.prefs.mode = 'keep'; this.modeChangedBy = 'preset';
    this._applyMix(2.5); this.save(); this.emit();
  }
  setRoom(room, presetName) {
    this.room = room;
    this.roomPreset = presetName && PRESETS[presetName] ? presetName : this.presetFor(room);
    if (this.prefs.mode === 'follow') this._applyMix(3.5);
    this.emit();
  }
  levels() { return { ...this.effective }; }

  // One-shot: a manual hatch. Called from the explorer.
  door(open) {
    if (!this.playing || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.02;
    const src = c.createBufferSource(); src.buffer = this.noise.brown;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(open ? 260 : 420, t); bp.frequency.linearRampToValueAtTime(open ? 520 : 240, t + 1.3);
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.18); g.gain.setValueAtTime(0.5, t + 1.05); g.gain.linearRampToValueAtTime(0, t + 1.45);
    src.connect(bp).connect(g).connect(this.fx);
    src.start(t, Math.random() * 3); src.stop(t + 1.6);
    this._thump(t + 1.45, 0.5, 70, this.fx);
  }

  // ---- graph ----
  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const c = this.ctx = new AC({ latencyHint: 'playback' });
    this.noise = makeNoise(c);
    this.out = c.createGain(); this.out.gain.value = 0;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 8; limiter.attack.value = 0.004; limiter.release.value = 0.25;
    this.out.connect(limiter).connect(c.destination);
    this.fx = c.createGain(); this.fx.gain.value = 0.6; this.fx.connect(this.out);
    for (const L of LAYERS) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.out);
      this.layerGains[L.id] = g;
    }
    this._driveGraph(this.layerGains.drive);
    this._airGraph(this.layerGains.air);
    this._structureGraph(this.layerGains.structure);
    this._consoleGraph(this.layerGains.consoles);
    this._galleyGraph(this.layerGains.galley);
  }

  _loop(buf, dest, { offset = 0, rate = 1 } = {}) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.connect(dest); s.start(this.ctx.currentTime, offset);
    return s;
  }
  _filter(type, f, q = 0.7, gain = 0) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; }
  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _lfo(freq, depth, target, type = 'sine') {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this._gain(depth); o.connect(g).connect(target); o.start();
    return o;
  }
  _osc(type, f, gain, dest, detune = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = this._gain(gain); o.connect(g).connect(dest); o.start();
    return { o, g };
  }

  _driveGraph(dest) {
    const c = this.ctx;
    // body: brown noise rumble, slowly breathing
    const body = this._gain(0.55);
    this._loop(this.noise.brown, this._filter('lowpass', 140, 0.5)).connect(body);
    body.connect(this._filter('highpass', 24, 0.7)).connect(dest);
    this._lfo(0.061, 0.18, body.gain);
    // tonal core: a slightly sharp, beating set of low partials
    // (the slightly-sharp residual buzz of Presence-01)
    const tone = this._gain(0.0);
    const lp = this._filter('lowpass', 260, 0.6);
    tone.connect(lp).connect(dest);
    this._osc('sine', 43.0, 0.32, tone);
    this._osc('sine', 86.6, 0.12, tone);
    this._osc('triangle', 130.1, 0.035, tone);
    this._osc('sine', 44.3, 0.18, tone);       // beating against 43 Hz
    tone.gain.value = 0.42;
    // syncopated drive pulse (the off-kilter rhythm of Next-01)
    this.drivePulse = this._gain(0.0);
    this._osc('sine', 58, 1, this.drivePulse);
    this.drivePulse.connect(this._filter('lowpass', 120, 0.7)).connect(dest);
    this.driveDest = dest;
  }

  _airGraph(dest) {
    // broadband duct air
    const air = this._gain(0.55);
    this._loop(this.noise.pink, this._filter('bandpass', 520, 0.45), { offset: 1.3 }).connect(air);
    air.connect(this._filter('highshelf', 2200, 0.7, -12)).connect(dest);
    this._lfo(0.043, 0.12, air.gain);
    this.airGust = air;
    // port duct seam: a thin whistle-whisper that wanders
    const seamBp = this._filter('bandpass', 1750, 9);
    const seam = this._gain(0.11);
    this._loop(this.noise.white, seamBp, { offset: 2.2 }).connect(seam).connect(dest);
    this._lfo(0.031, 220, seamBp.frequency);
    this._lfo(0.07, 0.05, seam.gain);
    // grille hiss
    const hiss = this._gain(0.03);
    this._loop(this.noise.white, this._filter('bandpass', 5200, 0.8), { offset: 0.4 }).connect(hiss).connect(dest);
  }

  _structureGraph(dest) {
    // frame vibration: felt more than heard
    const vib = this._gain(0.55);
    this._loop(this.noise.brown, this._filter('lowpass', 55, 0.9), { offset: 3.1, rate: 0.8 }).connect(vib).connect(dest);
    this._osc('sine', 31.5, 0.22, dest);
    this.structDest = dest;
  }

  _consoleGraph(dest) {
    // electrical: mains-like hum with odd harmonics, very low
    const hum = this._gain(0.06);
    hum.connect(this._filter('lowpass', 900, 0.5)).connect(dest);
    this._osc('sawtooth', 120, 0.12, hum);
    this._osc('sine', 240, 0.25, hum);
    this._osc('sine', 360, 0.12, hum, 4);
    // "wire hiss": a narrow, high band of noise
    const wire = this._gain(0.02);
    this._loop(this.noise.white, this._filter('bandpass', 7400, 2.5), { offset: 2.9 }).connect(wire).connect(dest);
    // electronics cooling whir
    const whir = this._gain(0.06);
    this._loop(this.noise.pink, this._filter('bandpass', 310, 3), { offset: 0.8 }).connect(whir).connect(dest);
    this.consoleDest = dest;
  }

  _galleyGraph(dest) {
    const c = this.ctx;
    // heater: the auxiliary heater's misaligned note (Next-02) — two close partials beating, cycling on/off
    this.heater = this._gain(0);
    const hlp = this._filter('lowpass', 700, 0.7);
    this.heater.connect(hlp).connect(dest);
    this._osc('sawtooth', 112.4, 0.10, this.heater);
    this._osc('sine', 116.9, 0.35, this.heater);
    this._osc('sine', 224.8, 0.12, this.heater);
    // cooling unit compressor: low throb with a shiver at start
    this.cooler = this._gain(0);
    const shiver = this._gain(1);              // amplitude wobble at start-up
    this.coolerShiverDepth = this._gain(0);
    this._lfo(7.5, 1, this.coolerShiverDepth);
    this.coolerShiverDepth.connect(shiver.gain);
    // standby bed: appliances are never fully silent — a low transformer hum
    // and the small fan in the heater's housing
    const standby = this._gain(0.05);
    standby.connect(this._filter('lowpass', 400, 0.7)).connect(dest);
    this._osc('sine', 100, 0.6, standby);
    this._osc('sine', 150, 0.25, standby, 6);
    const housing = this._gain(0.07);
    this._loop(this.noise.pink, this._filter('bandpass', 900, 1.2), { offset: 5.1 }).connect(housing).connect(dest);
    this._osc('triangle', 49.6, 0.5, shiver);
    this._loop(this.noise.brown, this._filter('lowpass', 200, 0.6), { offset: 4.4 }).connect(this._gain(0.6)).connect(shiver);
    shiver.connect(this.cooler);
    this.cooler.connect(this._filter('lowpass', 180, 0.7)).connect(dest);
    this.galleyDest = dest;
  }

  // ---- events ----
  _startScheduler() {
    this._stopScheduler();
    const every = (fn, min, max) => {
      const run = () => { if (!this.playing) return; fn(); const id = setTimeout(run, (min + Math.random() * (max - min)) * 1000); this.timers.push(id); };
      const id = setTimeout(run, (1.5 + Math.random() * min * 0.5) * 1000); this.timers.push(id);
    };
    this._drivePattern();
    every(() => this._hullTick(), 4, 16);
    every(() => this._creak(), 18, 45);
    every(() => this._relay(), 3, 11);
    every(() => this._chirp(), 22, 55);
    every(() => this._heaterCycle(), 26, 60);
    every(() => this._coolerCycle(), 40, 90);
    every(() => this._water(), 35, 80);
    every(() => this._fanTick(), 30, 70);
    every(() => this._gust(), 9, 20);
  }
  _stopScheduler() { this.timers.forEach(clearTimeout); this.timers = []; clearInterval(this._pulseTimer); }

  _drivePattern() {
    // irregular four-beat figure, plus the aft pump running "two beats late"
    const pattern = [0, 0.58, 1.07, 1.94];
    const cycle = 2.6;
    let next = this.ctx.currentTime + 0.1, n = 0;
    const tick = () => {
      if (!this.playing) return;
      while (next < this.ctx.currentTime + 1.0) {
        for (const off of pattern) this._pulse(next + off, off === 0 ? 0.32 : 0.18);
        if (n % 3 === 2) this._thump(next + cycle * 0.5 + (Math.random() < 0.35 ? 0.42 : 0), 0.32, 64, this.driveDest);
        next += cycle; n++;
      }
    };
    tick();
    this._pulseTimer = setInterval(tick, 400);
  }
  _pulse(t, amt) {
    const g = this.drivePulse.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(amt, t + 0.06);
    g.setTargetAtTime(0.0001, t + 0.08, 0.16);
  }
  _thump(t, amt, f, dest) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amt, t + 0.012); g.gain.setTargetAtTime(0.0001, t + 0.03, 0.09);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.7);
  }
  _ping(t, f, q, amt, decay, dest, buf = this.noise.white) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf;
    const bp = this._filter('bandpass', f, q);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amt, t + 0.002); g.gain.setTargetAtTime(0.0001, t + 0.004, decay);
    s.connect(bp).connect(g).connect(dest); s.start(t, Math.random() * 4); s.stop(t + decay * 8 + 0.05);
  }
  _hullTick() {
    // "hull ticks": a resonant metallic tick, sometimes doubled
    const t = this.ctx.currentTime + 0.05;
    const f = [1180, 1660, 2310, 2950][Math.floor(Math.random() * 4)];
    this._ping(t, f, 18, 0.9, 0.035, this.structDest);
    this._ping(t, f * 2.71, 22, 0.25, 0.02, this.structDest);
    if (Math.random() < 0.3) this._ping(t + 0.11 + Math.random() * 0.1, f * 1.07, 18, 0.5, 0.03, this.structDest);
  }
  _creak() {
    // a slow frame groan: band-limited noise swept down
    const c = this.ctx, t = c.currentTime + 0.05, dur = 0.9 + Math.random() * 0.8;
    const s = c.createBufferSource(); s.buffer = this.noise.brown;
    const bp = this._filter('bandpass', 420, 7);
    bp.frequency.setValueAtTime(380 + Math.random() * 200, t); bp.frequency.exponentialRampToValueAtTime(160 + Math.random() * 60, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(this.structDest); s.start(t, Math.random() * 5); s.stop(t + dur + 0.1);
  }
  _relay() {
    const t = this.ctx.currentTime + 0.05;
    this._ping(t, 3200, 4, 0.5, 0.004, this.consoleDest);
    if (Math.random() < 0.5) this._ping(t + 0.045, 2600, 4, 0.35, 0.004, this.consoleDest);
  }
  _chirp() {
    // soft two-tone status chirp, rounded and quiet: not a beep track
    const c = this.ctx, t = c.currentTime + 0.05;
    const notes = Math.random() < 0.5 ? [660, 990] : [880, 740];
    notes.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); const s = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.05, s + 0.02); g.gain.setTargetAtTime(0.0001, s + 0.05, 0.05);
      o.connect(g).connect(this.consoleDest); o.start(s); o.stop(s + 0.5);
    });
  }
  _heaterCycle() {
    // on for 12–30 s, then off "with a click she could feel more than hear"
    const c = this.ctx, t = c.currentTime + 0.05, dur = 12 + Math.random() * 18;
    const g = this.heater.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.32, t + 1.5);
    g.setValueAtTime(0.32, t + dur); g.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    this._ping(t + dur + 0.2, 1900, 6, 0.6, 0.006, this.galleyDest);
    this._thump(t + dur + 0.2, 0.25, 90, this.galleyDest);
  }
  _coolerCycle() {
    const c = this.ctx, t = c.currentTime + 0.05, dur = 18 + Math.random() * 20;
    const g = this.cooler.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(0.3, t + 0.6);
    g.setValueAtTime(0.3, t + dur); g.linearRampToValueAtTime(0.0001, t + dur + 1.2);
    // start-up shiver (draft voice: "It shivers when it starts")
    const d = this.coolerShiverDepth.gain;
    d.cancelScheduledValues(t); d.setValueAtTime(0.45, t); d.setTargetAtTime(0, t + 0.3, 0.5);
    this._thump(t, 0.3, 55, this.galleyDest);
  }
  _water() {
    // water generator refill and the stuttering filter (Next-07)
    const c = this.ctx, t0 = c.currentTime + 0.05, n = 5 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.18 + Math.random() * 0.35);
      const f = 380 + Math.random() * 520;
      this._ping(t, f, 9, 0.25, 0.03 + Math.random() * 0.03, this.galleyDest, this.noise.pink);
    }
    const s = c.createBufferSource(); s.buffer = this.noise.pink;
    const bp = this._filter('bandpass', 2400, 1.5);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.1, t0 + 0.4); g.gain.linearRampToValueAtTime(0.0001, t0 + 3.5);
    s.connect(bp).connect(g).connect(this.galleyDest); s.start(t0); s.stop(t0 + 3.6);
  }
  _fanTick() {
    // "The fan in the corner ticked once, then went patient."
    const t = this.ctx.currentTime + 0.05;
    this._ping(t, 4100, 10, 0.35, 0.005, this.galleyDest);
  }
  _gust() {
    const c = this.ctx, t = c.currentTime + 0.05, g = this.airGust.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.5 + Math.random() * 0.25, t + 2.5); g.linearRampToValueAtTime(0.55, t + 6);
  }

  // ---- levels ----
  _targetMix() {
    if (this.prefs.mode === 'keep') return this.prefs.mix;
    return PRESETS[this.roomPreset || this.presetFor(this.room)].mix;
  }
  _applyMix(seconds) {
    const target = this._targetMix();
    this._animateEffective(target, seconds);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const L of LAYERS) {
      const g = this.layerGains[L.id].gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.setTargetAtTime(curve(target[L.id] ?? 0), t, Math.max(0.05, seconds / 3));
    }
  }
  _animateEffective(target, seconds) {
    const from = { ...this.effective }, start = performance.now();
    cancelAnimationFrame(this._effRaf);
    const step = () => {
      const k = seconds <= 0 ? 1 : Math.min(1, (performance.now() - start) / (seconds * 1000));
      const e = 1 - Math.pow(1 - k, 3);
      for (const L of LAYERS) this.effective[L.id] = from[L.id] + ((target[L.id] ?? 0) - from[L.id]) * e;
      this.dispatchEvent(new Event('levels'));
      if (k < 1) this._effRaf = requestAnimationFrame(step);
    };
    step();
  }
  _applyMaster(seconds) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.out.gain;
    const v = this.playing && !this.prefs.muted ? curve(this.prefs.master) * 0.9 : 0;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(v, t, Math.max(0.03, seconds / 3));
  }
}

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
const curve = v => v * v; // perceptual-ish slider taper

function makeNoise(c) {
  // Generate a little extra, then crossfade the head with the continuation
  // past the end, so the loop point is seamless (no click, no level dip).
  const fade = Math.floor(c.sampleRate * 0.08);
  const mk = (seconds, fill) => {
    const L = Math.floor(c.sampleRate * seconds);
    const x = new Float32Array(L + fade); fill(x);
    const b = c.createBuffer(1, L, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < L; i++) d[i] = x[i];
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = x[i] * k + x[L + i] * (1 - k); }
    return b;
  };
  const white = mk(6.1, d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  const pink = mk(7.3, d => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  });
  const brown = mk(8.7, d => {
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  });
  return { white, pink, brown };
}

// Singleton: navigating inside the app never builds a second engine.
export const sound = (window.__vhSound ||= new SoundEngine());
