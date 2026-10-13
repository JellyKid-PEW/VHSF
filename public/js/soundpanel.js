// Sound controls, shared by the console, the ship and the reader.
import { sound, LAYERS, PRESETS } from './sound/engine.js';

export function initSoundPanel() {
  const panel = document.getElementById('sound-panel');
  const btn = document.getElementById('sound-btn');
  const toggle = document.getElementById('sp-toggle');
  const mute = document.getElementById('sp-mute');
  const master = document.getElementById('sp-master');
  const masterOut = document.getElementById('sp-master-out');
  const layersHost = document.getElementById('sp-layers');
  const presetsHost = document.getElementById('sp-presets');
  const modeNote = document.getElementById('sp-mode-note');

  for (const L of LAYERS) {
    const row = document.createElement('label');
    row.className = 'sp-slider';
    row.innerHTML = `<span>${L.label}<small>${L.hint}</small></span><input type="range" min="0" max="100" step="1" data-layer="${L.id}" aria-label="${L.label} level"><output></output>`;
    layersHost.appendChild(row);
    row.querySelector('input').addEventListener('input', e => sound.setLayer(L.id, e.target.value / 100));
  }
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = p.label; b.dataset.preset = id;
    b.addEventListener('click', () => sound.applyPreset(id));
    presetsHost.appendChild(b);
  }
  panel.querySelectorAll('input[name="sp-mode"]').forEach(r => r.addEventListener('change', () => sound.setMode(r.value)));
  toggle.addEventListener('click', () => sound.toggle());
  mute.addEventListener('change', () => sound.setMuted(mute.checked));
  master.addEventListener('input', () => sound.setMaster(master.value / 100));

  const open = (show = panel.hidden) => {
    panel.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    if (show) toggle.focus();
  };
  btn.addEventListener('click', () => open());
  document.getElementById('sp-close').addEventListener('click', () => { open(false); btn.focus(); });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { open(false); btn.focus(); } });
  document.addEventListener('pointerdown', e => {
    if (!panel.hidden && !e.target.closest('#sound-panel, #sound-btn, [data-sound-open]')) open(false);
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-sound-open]')) { open(true); return; }
    if (e.target.closest('[data-sound-toggle]')) { sound.toggle(); return; }
  });

  const render = () => {
    const p = sound.prefs;
    btn.classList.toggle('on', sound.playing && !p.muted);
    btn.querySelector('.sound-state').textContent = !sound.playing ? 'Sound off' : (p.muted ? 'Muted' : 'Sound on');
    toggle.textContent = sound.playing ? 'Stop sound' : (p.wasPlaying ? 'Resume sound' : 'Start sound');
    document.querySelectorAll('[data-sound-toggle]').forEach(b => { b.textContent = sound.playing ? 'Stop ship sound' : 'Start ship sound'; });
    mute.checked = p.muted;
    master.value = Math.round(p.master * 100); masterOut.textContent = master.value;
    panel.querySelectorAll('input[name="sp-mode"]').forEach(r => { r.checked = r.value === p.mode; });
    const roomLabel = PRESETS[sound.roomPreset || 'bridge']?.label || 'Quiet';
    modeNote.textContent = p.mode === 'follow'
      ? `Following the room: ${roomLabel} balance. Moving a slider keeps your own mix.`
      : (sound.modeChangedBy === 'slider' ? 'Keeping your mix. Choose “Follow the room” to let rooms set the balance again.' : 'Keeping your mix while you move.');
    presetsHost.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(p.mode === 'follow' && b.dataset.preset === sound.roomPreset)));
    document.querySelectorAll('[data-listen-room]').forEach(el => { el.textContent = sound.playing ? `${p.mode === 'follow' ? roomLabel : 'Your'} mix` : 'Off'; });
    renderLevels();
  };
  const renderLevels = () => {
    const lv = sound.levels();
    layersHost.querySelectorAll('input[data-layer]').forEach(i => {
      if (document.activeElement !== i) i.value = Math.round((lv[i.dataset.layer] ?? 0) * 100);
      i.nextElementSibling.textContent = Math.round((lv[i.dataset.layer] ?? 0) * 100);
    });
  };
  sound.addEventListener('change', render);
  sound.addEventListener('levels', renderLevels);
  render();
  return { open };
}
