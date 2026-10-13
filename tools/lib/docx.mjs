// Minimal, dependency-free .docx reader for manuscript chapters.
// Reads word/document.xml (+ numbering.xml) out of the zip and returns
// paragraphs with formatting runs. Text is never rewritten: every character
// in a w:t element reaches the output unchanged.
import fs from 'node:fs';
import zlib from 'node:zlib';

export function readZip(file) {
  const buf = fs.readFileSync(file);
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${file}: not a zip archive`);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.set(name, { method, csize, local });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lnameLen = buf.readUInt16LE(e.local + 26), lextraLen = buf.readUInt16LE(e.local + 28);
      const start = e.local + 30 + lnameLen + lextraLen;
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return data.toString('utf8');
      if (e.method === 8) return zlib.inflateRawSync(data).toString('utf8');
      throw new Error(`unsupported zip method ${e.method}`);
    },
  };
}

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}
// w:i / w:b present and not explicitly off
function flag(rPr, el) {
  const m = rPr.match(new RegExp(`<w:${el}(\\s[^>]*)?/?>`));
  if (!m) return false;
  const v = attr(m[0], 'w:val');
  return !(v === '0' || v === 'false' || v === 'none');
}

function parseNumbering(xml) {
  if (!xml) return null;
  const abstract = new Map();
  for (const m of xml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const lvls = new Map();
    for (const l of m[2].matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      const body = l[2];
      lvls.set(Number(l[1]), {
        start: Number(attr(body.match(/<w:start\b[^>]*>/)?.[0] || '', 'w:val') ?? 1),
        fmt: attr(body.match(/<w:numFmt\b[^>]*>/)?.[0] || '', 'w:val') || 'decimal',
        text: attr(body.match(/<w:lvlText\b[^>]*>/)?.[0] || '', 'w:val') ?? '%1.',
      });
    }
    abstract.set(m[1], lvls);
  }
  const nums = new Map();
  for (const m of xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const a = m[2].match(/<w:abstractNumId\b[^>]*w:val="(\d+)"/);
    if (a) nums.set(m[1], abstract.get(a[1]));
  }
  return nums;
}

function fmtNum(n, fmt) {
  if (fmt === 'decimal') return String(n);
  if (fmt === 'lowerLetter') return String.fromCharCode(96 + n);
  if (fmt === 'upperLetter') return String.fromCharCode(64 + n);
  if (fmt === 'lowerRoman' || fmt === 'upperRoman') {
    const r = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '', k = n; for (const [v, t] of r) while (k >= v) { s += t; k -= v; }
    return fmt === 'upperRoman' ? s.toUpperCase() : s;
  }
  if (fmt === 'bullet') return '';
  return String(n);
}

// Returns { paragraphs: [{ style, list, runs:[{t,i,b,u,caps}] }], warnings }
export function readDocx(file) {
  const zip = readZip(file);
  const xml = zip.read('word/document.xml');
  if (!xml) throw new Error(`${file}: no word/document.xml`);
  const numbering = parseNumbering(zip.read('word/numbering.xml'));
  const counters = new Map();
  const warnings = [];
  if (/<w:(ins|del)\b/.test(xml)) warnings.push('contains tracked changes (w:ins / w:del)');
  if (/<w:commentReference\b/.test(xml)) warnings.push('contains comments');
  const body = xml.slice(xml.indexOf('<w:body'));
  const paragraphs = [];
  for (const pm of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const inner = pm[1] || '';
    const pPr = inner.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] || '';
    const style = attr(pPr.match(/<w:pStyle\b[^>]*>/)?.[0] || '', 'w:val') || '';
    let list = null;
    const numId = attr(pPr.match(/<w:numId\b[^>]*>/)?.[0] || '', 'w:val');
    if (numId && numbering?.get(numId)) {
      const ilvl = Number(attr(pPr.match(/<w:ilvl\b[^>]*>/)?.[0] || '', 'w:val') || 0);
      const lvl = numbering.get(numId).get(ilvl) || { start: 1, fmt: 'decimal', text: '%1.' };
      const key = `${numId}:${ilvl}`;
      const n = counters.has(key) ? counters.get(key) + 1 : lvl.start;
      counters.set(key, n);
      list = lvl.text.replace(`%${ilvl + 1}`, fmtNum(n, lvl.fmt));
    }
    const runs = [];
    // drop paragraph properties so their rPr (paragraph mark formatting) is not read as a run
    const content = inner.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '');
    for (const rm of content.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const r = rm[1];
      const rPr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] || '';
      const fmt = { i: flag(rPr, 'i'), b: flag(rPr, 'b'), u: /<w:u\b/.test(rPr) && !/w:val="none"/.test(rPr.match(/<w:u\b[^>]*>/)?.[0] || ''), caps: flag(rPr, 'caps') };
      let t = '';
      for (const tok of r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\s*\/>|<w:(br|cr)\b[^>]*\/>|<w:tab\/>|<w:noBreakHyphen\/>|<w:softHyphen\/>/g)) {
        if (tok[1] !== undefined) t += decode(tok[1]);
        else if (tok[2]) t += '\n';
        else if (tok[0].startsWith('<w:tab')) t += '\t';
        else if (tok[0].startsWith('<w:noBreakHyphen')) t += '‑';
        else if (tok[0].startsWith('<w:softHyphen')) t += '­';
      }
      if (!t) continue;
      const last = runs[runs.length - 1];
      if (last && last.i === fmt.i && last.b === fmt.b && last.u === fmt.u && last.caps === fmt.caps) last.t += t;
      else runs.push({ t, ...fmt });
    }
    paragraphs.push({ style, list, runs });
  }
  return { paragraphs, warnings };
}
