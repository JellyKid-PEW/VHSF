// Quote references: committed data stores only {chapter, block, sha256};
// the text is recovered from the locally built chapter at build time, which
// also proves the quote still exists verbatim in the current draft.
import crypto from 'node:crypto';

export const sha = s => crypto.createHash('sha256').update(s.normalize('NFC')).digest('hex');

export function blockText(b) {
  if (!b.html) return '';
  return b.html.replace(/<span class="list-label">[^<]*<\/span>\s?/, '').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

// Candidate spans start and end at sentence boundaries within one block.
export function sentenceSpans(text) {
  const starts = [0], ends = [text.length];
  const re = /[.?!…—:][”’"')]*\s+/g;
  let m;
  while ((m = re.exec(text))) { ends.push(m.index + m[0].trimEnd().length); starts.push(m.index + m[0].length); }
  const out = [];
  for (const s of starts) for (const e of ends) if (e > s) out.push(text.slice(s, e));
  return out;
}

// Find a quote by hash, trying the hinted block first.
export function resolveRef(chapter, ref) {
  const order = [ref.block, ...chapter.blocks.map((_, i) => i).filter(i => i !== ref.block)];
  for (const i of order) {
    const b = chapter.blocks[i];
    if (!b || b.type !== 'p' && b.type !== 'heading') continue;
    for (const span of sentenceSpans(blockText(b))) if (sha(span) === ref.sha256) return { text: span, block: i };
  }
  return null;
}
