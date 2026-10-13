// Converts supplied manuscript .docx files into chapter JSON for the reader.
//
//   node tools/build-content.mjs [--src <dir>] [--only next-01,presence-06]
//
// Sources are read from ./manuscripts (gitignored) or --src / $VH_MANUSCRIPTS.
// Output goes to public/content/chapters/ (gitignored) plus
// public/content/library.json (manifest + availability). Chapters listed in
// the manifest whose source file is not found are marked unavailable.
//
// Prose is never edited. Display conversions are limited to: Word italic /
// bold / underline runs; literal Markdown emphasis typed into the drafts
// (**bold**, _italic_) shown as emphasis; "> " console lines and "::" ship
// display lines styled as console text; soft line breaks kept; empty
// paragraphs used as spacing collapsed. Every conversion is counted in the
// chapter's `conversions` field.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readDocx } from './lib/docx.mjs';
import { resolveRef } from './lib/quotes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SRC = path.resolve(opt('--src') || process.env.VH_MANUSCRIPTS || path.join(ROOT, 'manuscripts'));
const ONLY = opt('--only')?.split(',').map(s => s.trim()).filter(Boolean) || null;
const OUT = path.join(ROOT, 'public', 'content');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

function walk(dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith('.docx') && !e.name.startsWith('~$')) out.set(e.name, p);
  }
  return out;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BREAK_RE = /^\s*(·\s*·\s*·|-{3,}|—|\*{3,}|\*\s\*\s\*)\s*$/;

function runsToHtml(runs, conv) {
  let html = '';
  for (const r of runs) {
    let t = esc(r.t).replace(/\n/g, '<br>');
    if (r.caps) t = `<span class="caps">${t}</span>`;
    if (r.u) t = `<u>${t}</u>`;
    if (r.b) t = `<strong>${t}</strong>`;
    if (r.i) t = `<em>${t}</em>`;
    html += t;
  }
  // literal Markdown emphasis typed into the draft text
  html = html.replace(/\*\*([^*<>\n]+?)\*\*/g, (_, x) => { conv.markdownBold++; return `<strong>${x}</strong>`; });
  html = html.replace(/(^|[\s(“‘"'—>])_([^_<>\n]+?)_(?=$|[\s.,;:!?)”’"'—<])/g, (_, pre, x) => { conv.markdownItalic++; return `${pre}<em>${x}</em>`; });
  return html;
}

function convert(doc) {
  const conv = { markdownBold: 0, markdownItalic: 0, consoleLines: 0, sceneBreaks: 0, spacers: 0, listLabels: 0, headings: 0 };
  const ps = doc.paragraphs;
  const empties = ps.filter(p => !p.runs.map(r => r.t).join('').trim() && !p.list).length;
  const emptiesAreSeparators = empties > ps.length * 0.35;   // Presence drafts double-space every paragraph
  const blocks = [];
  let words = 0;
  for (const p of ps) {
    const text = p.runs.map(r => r.t).join('');
    if (!text.trim() && !p.list) {
      if (!emptiesAreSeparators && blocks.length && blocks[blocks.length - 1].type !== 'space') { blocks.push({ type: 'space' }); conv.spacers++; }
      continue;
    }
    words += text.split(/\s+/).filter(Boolean).length;
    if (BREAK_RE.test(text)) { blocks.push({ type: 'break', mark: text.trim() }); conv.sceneBreaks++; continue; }
    if (/^Heading/i.test(p.style) || /^Title$/i.test(p.style)) { blocks.push({ type: 'heading', html: runsToHtml(p.runs, conv) }); conv.headings++; continue; }
    let runs = p.runs, cls = null;
    if (/^>\s?/.test(text)) {
      // strip the Markdown quote marker only
      runs = runs.map((r, i) => i === 0 ? { ...r, t: r.t.replace(/^>\s?/, '') } : r);
      cls = 'console'; conv.consoleLines++;
    } else if (/^::/.test(text.trim())) { cls = 'console'; conv.consoleLines++; }
    let html = runsToHtml(runs, conv);
    if (p.list) { html = `<span class="list-label">${esc(p.list)}</span> ${html}`; conv.listLabels++; }
    blocks.push(cls ? { type: 'p', cls, html } : { type: 'p', html });
  }
  while (blocks.length && blocks[blocks.length - 1].type === 'space') blocks.pop();
  return { blocks, words, conv };
}

function main() {
  const files = walk(SRC);
  fs.mkdirSync(path.join(OUT, 'chapters'), { recursive: true });
  const library = { ...manifest, built: new Date().toISOString(), sourceDir: path.relative(ROOT, SRC) || '.', chapters: [] };
  delete library._about;
  let built = 0, missing = 0;
  for (const ch of manifest.chapters) {
    const entry = { ...ch };
    const src = files.get(ch.source);
    const selected = !ONLY || ONLY.includes(ch.id);
    const outFile = path.join(OUT, 'chapters', `${ch.id}.json`);
    if (!src || !selected) {
      entry.available = false;
      entry.unavailableReason = !src ? 'Manuscript not supplied to this build.' : 'Not selected for this build.';
      if (fs.existsSync(outFile)) fs.rmSync(outFile);
      missing++;
      library.chapters.push(entry);
      continue;
    }
    const raw = fs.readFileSync(src);
    const doc = readDocx(src);
    const { blocks, words, conv } = convert(doc);
    const chapter = {
      id: ch.id, book: ch.book, number: ch.number, kind: ch.kind, title: ch.title, subtitle: ch.subtitle || null,
      source: ch.source, sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
      words, conversions: conv, warnings: doc.warnings, blocks,
    };
    fs.writeFileSync(outFile, JSON.stringify(chapter));
    entry.available = true;
    entry.words = words;
    entry.sourceSha256 = chapter.sourceSha256;
    library.chapters.push(entry);
    built++;
    if (doc.warnings.length) console.warn(`  ${ch.id}: ${doc.warnings.join('; ')}`);
  }
  fs.writeFileSync(path.join(OUT, 'library.json'), JSON.stringify(library, null, 1));
  console.log(`Built ${built} chapter(s) from ${path.relative(ROOT, SRC) || SRC}; ${missing} unavailable.`);
  resolveQuotes();
}

// Resolve hashed observation references against the chapters just built.
function resolveQuotes() {
  const refsFile = path.join(ROOT, 'public', 'data', 'observations.json');
  if (!fs.existsSync(refsFile)) return;
  const { quotes } = JSON.parse(fs.readFileSync(refsFile, 'utf8'));
  const out = {}, lost = [];
  const cache = {};
  for (const ref of quotes) {
    const f = path.join(OUT, 'chapters', `${ref.chapter}.json`);
    if (!fs.existsSync(f)) continue;
    const ch = cache[ref.chapter] ??= JSON.parse(fs.readFileSync(f, 'utf8'));
    const hit = resolveRef(ch, ref);
    if (hit) out[ref.id] = hit; else lost.push(`${ref.id} (${ref.chapter})`);
  }
  fs.writeFileSync(path.join(OUT, 'quotes.json'), JSON.stringify(out));
  console.log(`Resolved ${Object.keys(out).length}/${quotes.length} source-grounded observation line(s).`);
  if (lost.length) console.warn(`  No longer verbatim in the current draft (hidden in the ship): ${lost.join(', ')}`);
}

main();
