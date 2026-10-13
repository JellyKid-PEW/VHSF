// localStorage wrappers: every read/write is guarded so the site works with
// storage blocked (private windows, previews).
export function get(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function set(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export const KEYS = {
  perspective: 'vh:perspective',
  ship: 'vh:ship:v1',
  reader: 'vh:reader:v1',
  readPos: id => `vh:reader:pos:${id}`,
  lastChapter: 'vh:reader:last',
  motion: 'vh:motion',
  boarded: 'vh:ship:boarded',
  notices: 'vh:notices:seen',
};
