// Strata integration (JellyKid-PEW/Strata, public/embed.js v0.2.0).
//
// Uses Strata's own embed — ReaderLayer.init / setToken / destroy — loaded
// from the configured Strata server. Nothing here imitates Strata: if the
// server is not reachable, the reader says so and loads nothing.
//
// Constraints inherited from the embed (documented in README):
//  - notes anchor to the n-th p/h1–h6/blockquote/li inside contentSelector,
//    so the chapter body renders only <p> and <h2> blocks, in source order;
//  - saving needs a Strata JWT; the embed has no sign-in UI, so this page
//    signs in against Strata's /api/auth endpoints and hands the token over.
let cfg = null, scriptPromise = null, active = null;

export async function strataConfig() {
  if (cfg) return cfg;
  cfg = await fetch('data/strata.json').then(r => r.json()).catch(() => ({ enabled: false }));
  // allow a local override without editing the committed file
  try { const o = JSON.parse(localStorage.getItem('vh:strata:server') || 'null'); if (o) cfg.serverUrl = o; } catch { /* ignore */ }
  return cfg;
}

export function strataUnmount() {
  if (active && window.ReaderLayer) { try { window.ReaderLayer.destroy(); } catch { /* ignore */ } }
  active = null;
}

async function reachable(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try { const r = await fetch(`${url}/api/health`, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
}

function loadScript(src) {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.dataset.strata = '1';
    s.onload = () => res(window.ReaderLayer); s.onerror = () => { scriptPromise = null; rej(new Error('embed.js failed to load')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export async function strataMount(chapter, slot, statusEl) {
  const c = await strataConfig();
  strataUnmount();
  slot.hidden = false;
  statusEl.textContent = 'Preparing reader notes…';
  const explain = '<p class="fine">Strata notes are your own reading notes and lenses. They are separate from character perspective, which changes only the interface aboard the ship.</p>';
  if (!c.enabled) { slot.hidden = true; return; }
  if (!c.demoChapters?.includes(chapter.id)) {
    statusEl.innerHTML = `<p>Strata is connected to one demonstration chapter in this prototype (${c.demoChapters.map(esc).join(', ')}). This chapter has the same integration point and can be enabled in <code>data/strata.json</code>.</p>${explain}`;
    return;
  }
  statusEl.innerHTML = `<p>Checking the Strata server at <code>${esc(c.serverUrl)}</code>…</p>`;
  const health = await reachable(c.serverUrl);
  if (!health) {
    statusEl.innerHTML = `<p><b>Strata is not running.</b> Reader notes need Strata’s Node backend (Express + sql.js) at <code>${esc(c.serverUrl)}</code>. Nothing is shown here until it answers; see “Strata” in the README to start it.</p>${explain}`;
    return;
  }
  let RL;
  try { RL = await loadScript(`${c.serverUrl}/embed.js`); } catch (e) {
    statusEl.innerHTML = `<p><b>Strata answered, but its embed script did not load</b> from <code>${esc(c.serverUrl)}/embed.js</code>.</p>`;
    return;
  }
  const signal = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim();
  await RL.init({
    workId: `${c.workIdPrefix}${chapter.id}`,
    contentSelector: '#chapter-body',
    sourceTitle: `Vox Humana — ${chapter.title || chapter.id}`,
    apiBase: `${c.serverUrl}/api`,
    triggerLabel: 'Notes',
    panelSide: 'right',
    theme: { '--strata-accent': signal },
  });
  active = chapter.id;
  const token = (() => { try { return localStorage.getItem('strata_token'); } catch { return null; } })();
  statusEl.innerHTML = `<p class="strata-ok">Connected to Strata ${esc(health.version || '')} (embed ${esc(RL.version)}). Select a passage to add a note.</p>${explain}`;
  if (!token) statusEl.appendChild(signInForm(c, RL, statusEl));
  else {
    const p = document.createElement('p'); p.className = 'fine';
    p.innerHTML = 'Signed in to Strata on this browser. <button type="button" class="rd-btn">Sign out</button>';
    p.querySelector('button').onclick = () => { try { localStorage.removeItem('strata_token'); } catch { /* ignore */ } strataMount(chapter, slot, statusEl); };
    statusEl.appendChild(p);
  }
}

function signInForm(c, RL, statusEl) {
  const f = document.createElement('form');
  f.innerHTML = `<p class="fine">Sign in with your Strata account to save notes. Your password goes only to the Strata server above.</p>
    <input name="email" type="email" autocomplete="email" placeholder="Email" required aria-label="Strata email">
    <input name="username" type="text" autocomplete="username" placeholder="Username (new accounts only)" aria-label="Strata username, for new accounts">
    <input name="password" type="password" autocomplete="current-password" placeholder="Password" required minlength="8" aria-label="Strata password">
    <div><button class="rd-btn" value="login">Sign in</button> <button class="rd-btn" value="register">Create account</button></div>
    <p class="fine" data-msg aria-live="polite"></p>`;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const mode = e.submitter?.value || 'login';
    const fd = Object.fromEntries(new FormData(f));
    const msg = f.querySelector('[data-msg]');
    msg.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';
    try {
      const r = await fetch(`${c.serverUrl}/api/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fd) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      RL.setToken(j.token);
      msg.textContent = `Signed in as ${j.user.username}. Select a passage to add a note.`;
      f.querySelectorAll('input, button').forEach(x => { x.disabled = true; });
    } catch (err) { msg.textContent = `Strata said: ${err.message}`; }
  });
  return f;
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
