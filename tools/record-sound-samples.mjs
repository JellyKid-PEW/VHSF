// Records audition clips of the generated ship ambience, straight from the
// site's own sound engine in a headless browser (no microphone, no files in).
//
//   node tools/record-sound-samples.mjs [seconds]     → docs/sound-samples/*.webm
//
// Requires Playwright (npm i -D playwright) and a running site:
//   npm start   (port 8080)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'sound-samples');
const SECONDS = Number(process.argv[2] || 24);
const BASE = process.env.BASE || 'http://localhost:8080/';
fs.mkdirSync(OUT, { recursive: true });

let pw;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) { try { pw = await import(spec); break; } catch { /* next */ } }
if (!pw) throw new Error('Playwright not found (npm i -D playwright)');
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
await page.goto(BASE);
await page.waitForSelector('html[data-ready="1"]');

for (const preset of ['bridge', 'galley']) {
  const b64 = await page.evaluate(async ([preset, seconds]) => {
    const s = window.__vhSound;
    await s.start();
    s.setMaster(0.8);
    s.applyPreset(preset);
    await new Promise(r => setTimeout(r, 3000)); // let the mix settle
    const dest = s.ctx.createMediaStreamDestination();
    s.out.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 96000 });
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(r => { rec.onstop = r; });
    rec.start();
    await new Promise(r => setTimeout(r, seconds * 1000));
    rec.stop(); await done;
    s.out.disconnect(dest);
    const buf = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }, [preset, SECONDS]);
  const file = path.join(OUT, `${preset}-preset.webm`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`wrote ${path.relative(ROOT, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
}
await browser.close();
