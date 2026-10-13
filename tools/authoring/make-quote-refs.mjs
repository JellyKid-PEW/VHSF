// Authoring helper: turns tools/authoring/quotes.local.json (text, gitignored)
// into public/data/observations.json (hash references, committed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha, blockText, resolveRef } from '../lib/quotes.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/authoring/quotes.local.json'), 'utf8'));
const refs = []; let bad = 0;
for (const q of list) {
  const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/content/chapters', q.chapter + '.json'), 'utf8'));
  const block = ch.blocks.findIndex(b => blockText(b).includes(q.text));
  if (block < 0) { console.error('NOT FOUND', q.id, q.chapter); bad++; continue; }
  const ref = { id: q.id, chapter: q.chapter, block, sha256: sha(q.text), viewpoint: q.viewpoint, about: q.about };
  if (!resolveRef(ch, ref)) { console.error('NOT SENTENCE-ALIGNED', q.id); bad++; continue; }
  refs.push(ref);
}
const out = {
  _about: 'Source-grounded observations. Each entry points at a verbatim line in a supplied manuscript chapter by block index and SHA-256; the text itself is not stored here. tools/build-content.mjs resolves them into public/content/quotes.json (local, gitignored) and reports any line that no longer exists in the current draft. viewpoint = whose viewpoint the passage is narrated from; about = which perspectives the line is relevant to.',
  quotes: refs,
};
fs.writeFileSync(path.join(ROOT, 'public/data/observations.json'), JSON.stringify(out, null, 1));
console.log(`${refs.length} refs written, ${bad} problems`);
process.exit(bad ? 1 : 0);
