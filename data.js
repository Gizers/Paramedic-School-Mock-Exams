// ---------------------------------------------------------------
// Manifest + lazy question-bank loading.
// Chapters are fetched on demand and cached in memory, so the app
// starts instantly no matter how large the total bank grows.
// ---------------------------------------------------------------

let manifest = null;
const bankCache = new Map();
const inflight = new Map();

/* The single-file build drops everything into __PMX_INLINE instead of shipping
   sibling data files. Same code path either way — only the source differs. */
const INLINE = (typeof self !== 'undefined' && self.__PMX_INLINE) || null;
export const isInline = !!INLINE;

/** Resolve a slide/diagram filename to something an <img> can use. */
export function mediaUrl(file) {
  if (!file) return '';
  if (INLINE) return (INLINE.media && INLINE.media[file]) || '';
  return 'media/' + file;
}

export function hasMedia(file) {
  if (!file) return false;
  return INLINE ? !!(INLINE.media && INLINE.media[file]) : true;
}

export async function loadManifest() {
  if (manifest) return manifest;
  if (INLINE) {
    manifest = INLINE.manifest;
  } else {
    const r = await fetch('data/manifest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Could not load the question index.');
    manifest = await r.json();
  }
  manifest.chapterById = {};
  manifest.chapters.forEach(c => { manifest.chapterById[c.id] = c; });
  manifest.moduleById = {};
  manifest.modules.forEach(m => { manifest.moduleById[m.id] = m; });
  return manifest;
}

export function mf() { return manifest; }

export function chapter(id) { return manifest.chapterById[id]; }

export function chaptersOf(moduleId) {
  return manifest.chapters.filter(c => c.module === moduleId);
}

export async function loadChapter(id) {
  if (bankCache.has(id)) return bankCache.get(id);
  if (INLINE) {
    const rows = (INLINE.banks && INLINE.banks[id]) || [];
    bankCache.set(id, rows);
    return rows;
  }
  if (inflight.has(id)) return inflight.get(id);
  const p = fetch('data/bank/' + id + '.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('Missing chapter ' + id); return r.json(); })
    .then(j => {
      const rows = j.questions;
      bankCache.set(id, rows);
      inflight.delete(id);
      return rows;
    })
    .catch(e => { inflight.delete(id); throw e; });
  inflight.set(id, p);
  return p;
}

export async function loadChapters(ids) {
  const all = await Promise.all(ids.map(loadChapter));
  return [].concat.apply([], all);
}

/** Every question, loaded. Only used by progress + audit screens. */
export async function loadEverything() {
  return loadChapters(manifest.chapters.map(c => c.id));
}

let questionIndex = null;
/** id -> question, built lazily across whatever has been loaded. */
export async function byId(id) {
  if (!questionIndex) questionIndex = new Map();
  if (questionIndex.has(id)) return questionIndex.get(id);
  const all = await loadEverything();
  all.forEach(q => questionIndex.set(q.id, q));
  return questionIndex.get(id);
}

export function cachedQuestions() {
  const out = [];
  bankCache.forEach(rows => rows.forEach(q => out.push(q)));
  return out;
}

// ---- optional side content -------------------------------------
let meds = null, acros = null;

export async function loadMeds() {
  if (meds) return meds;
  if (INLINE) { meds = INLINE.meds || { classes: [], field: [], home: [], homeCats: [] }; return meds; }
  const r = await fetch('data/meds.json', { cache: 'no-cache' });
  meds = r.ok ? await r.json() : { classes: [], field: [], home: [], homeCats: [] };
  return meds;
}

export async function loadAcronyms() {
  if (acros) return acros;
  if (INLINE) { acros = INLINE.acronyms || { subjects: [], acros: [] }; return acros; }
  const r = await fetch('data/acronyms.json', { cache: 'no-cache' });
  acros = r.ok ? await r.json() : { subjects: [], acros: [] };
  return acros;
}
