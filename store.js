// ---------------------------------------------------------------
// Persistence. IndexedDB when available, localStorage as fallback.
// Everything is per-device and private; nothing leaves the browser.
// ---------------------------------------------------------------

const DB_NAME = 'pmx';
const DB_VER = 1;
const STORES = ['kv', 'cards', 'sessions'];

let dbp = null;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('no idb'));
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); }
    catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('idb blocked'));
  }).catch(() => null);
  return dbp;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function idbReq(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

// ---- localStorage fallback -------------------------------------
const LS = {
  key: (s, k) => 'pmx:' + s + ':' + k,
  get(s, k) {
    try { const v = localStorage.getItem(LS.key(s, k)); return v == null ? undefined : JSON.parse(v); }
    catch (e) { return undefined; }
  },
  set(s, k, v) { try { localStorage.setItem(LS.key(s, k), JSON.stringify(v)); } catch (e) { /* quota */ } },
  del(s, k) { try { localStorage.removeItem(LS.key(s, k)); } catch (e) {} },
  all(s) {
    const out = [];
    try {
      const pre = 'pmx:' + s + ':';
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(pre) === 0) {
          try { out.push([k.slice(pre.length), JSON.parse(localStorage.getItem(k))]); } catch (e) {}
        }
      }
    } catch (e) {}
    return out;
  }
};

// ---- public API ------------------------------------------------
export async function get(store, key) {
  const db = await openDB();
  if (!db) return LS.get(store, key);
  try { return await idbReq(tx(db, store, 'readonly').get(key)); }
  catch (e) { return LS.get(store, key); }
}

export async function set(store, key, val) {
  const db = await openDB();
  if (!db) return LS.set(store, key, val);
  try { await idbReq(tx(db, store, 'readwrite').put(val, key)); }
  catch (e) { LS.set(store, key, val); }
}

export async function del(store, key) {
  const db = await openDB();
  if (!db) return LS.del(store, key);
  try { await idbReq(tx(db, store, 'readwrite').delete(key)); }
  catch (e) { LS.del(store, key); }
}

/** Returns [[key, value], ...] for a whole store. */
export async function entries(store) {
  const db = await openDB();
  if (!db) return LS.all(store);
  try {
    const os = tx(db, store, 'readonly');
    if (os.getAllKeys && os.getAll) {
      const [ks, vs] = await Promise.all([idbReq(os.getAllKeys()), idbReq(tx(db, store, 'readonly').getAll())]);
      return ks.map((k, i) => [k, vs[i]]);
    }
    return await new Promise(res => {
      const out = [];
      const c = os.openCursor();
      c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.push([cur.key, cur.value]); cur.continue(); };
      c.onerror = () => res(out);
    });
  } catch (e) { return LS.all(store); }
}

export async function putMany(store, pairs) {
  const db = await openDB();
  if (!db) { pairs.forEach(([k, v]) => LS.set(store, k, v)); return; }
  try {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    pairs.forEach(([k, v]) => os.put(v, k));
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  } catch (e) { pairs.forEach(([k, v]) => LS.set(store, k, v)); }
}

export async function clearAll() {
  const db = await openDB();
  if (db) {
    try {
      await Promise.all(STORES.map(s => idbReq(db.transaction(s, 'readwrite').objectStore(s).clear())));
    } catch (e) {}
  }
  try {
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('pmx:') === 0) kill.push(k);
    }
    kill.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

// ---- settings --------------------------------------------------
const DEFAULT_SETTINGS = {
  mode: 'instant',      // instant | sim
  count: 30,
  timer: 0,             // seconds per question, 0 = off
  shuffleOptions: true,
  showSlides: true,
  srsOn: true
};

let settingsCache = null;

export async function settings() {
  if (settingsCache) return settingsCache;
  const s = await get('kv', 'settings');
  settingsCache = Object.assign({}, DEFAULT_SETTINGS, s || {});
  return settingsCache;
}

export async function saveSettings(patch) {
  const s = await settings();
  settingsCache = Object.assign(s, patch);
  await set('kv', 'settings', settingsCache);
  return settingsCache;
}

// ---- export / import (so progress can move between devices) ----
export async function exportAll() {
  const [kv, cards, sessions] = await Promise.all([entries('kv'), entries('cards'), entries('sessions')]);
  return { app: 'paramedic-exam-suite', v: 1, at: Date.now(), kv, cards, sessions };
}

export async function importAll(blob) {
  if (!blob || blob.app !== 'paramedic-exam-suite') throw new Error('Not a Paramedic Exam Suite backup file.');
  await putMany('kv', blob.kv || []);
  await putMany('cards', blob.cards || []);
  await putMany('sessions', blob.sessions || []);
  settingsCache = null;
}
