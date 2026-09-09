// ---------------------------------------------------------------
// Builds and runs an exam session.
// A session is a plain object so it can be saved mid-run and resumed.
// ---------------------------------------------------------------

import * as data from './data.js';
import * as srs from './srs.js';
import * as store from './store.js';
import { shuffle, sample, rng, pct } from './util.js';

export const SELECT_MODES = [
  ['adaptive', 'Adaptive',   'Weights toward what you miss, what is overdue, and what you have flagged.'],
  ['random',   'Random',     'Straight random draw from everything you selected.'],
  ['due',      'Due today',  'Only cards the spaced-repetition scheduler says are due.'],
  ['weak',     'Weak spots', 'Your lowest-accuracy topics first.'],
  ['unseen',   'New only',   'Questions you have never been asked.'],
  ['flagged',  'Flagged',    'Only questions you flagged for review.']
];

/**
 * spec = { chapters:[id], topics:[str]|null, count, qtype:'both'|'mc'|'match',
 *          select:'adaptive'|..., mode:'instant'|'sim', timer:secs, seed }
 */
export async function build(spec) {
  const seed = spec.seed || (Date.now() & 0x7fffffff);
  const rand = rng(seed);

  let pool = await data.loadChapters(spec.chapters);

  if (spec.topics && spec.topics.length) {
    const want = new Set(spec.topics);
    pool = pool.filter(q => want.has(q.topic));
  }
  if (spec.qtype === 'mc') pool = pool.filter(q => q.type === 'mc');
  if (spec.qtype === 'match') pool = pool.filter(q => q.type === 'match');

  await srs.ready();

  let picked;
  switch (spec.select) {
    case 'due': {
      const due = new Set(srs.dueIds());
      const d = pool.filter(q => due.has(q.id));
      picked = sample(d, spec.count, rand);
      break;
    }
    case 'flagged': {
      const fl = new Set(srs.flaggedIds());
      picked = sample(pool.filter(q => fl.has(q.id)), spec.count, rand);
      break;
    }
    case 'unseen': {
      picked = sample(srs.unseenFrom(pool), spec.count, rand);
      break;
    }
    case 'weak': {
      const weak = srs.weakTopics(2).slice(0, 12).map(t => t.topic);
      const rank = new Map(weak.map((t, i) => [t, i]));
      const scored = pool.map(q => ({ q, k: rank.has(q.topic) ? rank.get(q.topic) : 99, r: rand() }));
      scored.sort((a, b) => a.k - b.k || a.r - b.r);
      picked = scored.slice(0, spec.count).map(x => x.q);
      break;
    }
    case 'random': {
      picked = sample(pool, spec.count, rand);
      break;
    }
    default: { // adaptive — weighted draw without replacement
      const items = pool.map(q => ({ q, w: srs.priority(q) * (0.6 + rand() * 0.8) }));
      items.sort((a, b) => b.w - a.w);
      // take the top 3x then shuffle so the order isn't strictly difficulty-ranked
      const head = items.slice(0, Math.max(spec.count, Math.min(items.length, spec.count * 3)));
      picked = sample(head.map(x => x.q), spec.count, rand);
    }
  }

  picked = dedupeFamilies(picked, pool, spec.count, rand);
  picked = shuffle(picked, rand);

  const prepared = picked.map(q => prepare(q, spec, rand));

  return {
    id: 's' + seed.toString(36) + Date.now().toString(36).slice(-4),
    seed,
    spec: Object.assign({}, spec, { seed }),
    questions: prepared,
    answers: new Array(prepared.length).fill(null),
    i: 0,
    startedAt: Date.now(),
    endedAt: null,
    poolSize: pool.length
  };
}

/**
 * Questions tagged into the same family are near-identical parallel items
 * ("beta-1 receptors…" / "beta-2 receptors…"). Two of them in one exam let you
 * answer the second by cross-referencing the first, so keep one and backfill
 * from the rest of the pool.
 */
function dedupeFamilies(picked, pool, count, rand) {
  const kept = [];
  const usedFam = new Set();
  const usedIds = new Set();
  picked.forEach(q => {
    if (q.fam && usedFam.has(q.fam)) return;
    if (q.fam) usedFam.add(q.fam);
    usedIds.add(q.id);
    kept.push(q);
  });
  if (kept.length >= Math.min(count, picked.length)) return kept;

  const spare = shuffle(pool.filter(q =>
    !usedIds.has(q.id) && (!q.fam || !usedFam.has(q.fam))), rand);
  for (let i = 0; i < spare.length && kept.length < count; i++) {
    const q = spare[i];
    if (q.fam) usedFam.add(q.fam);
    kept.push(q);
  }
  return kept;
}

/** Freeze option order (and the correct index) at build time. */
function prepare(q, spec, rand) {
  const out = { id: q.id, type: q.type, ch: q.ch, topic: q.topic, ref: q.ref, stem: q.stem, why: q.why };
  if (q.slide) out.slide = q.slide;
  if (q.img) out.img = q.img;

  if (q.type === 'mc') {
    let idx = q.options.map((_, i) => i);
    if (spec.shuffleOptions !== false) idx = shuffle(idx, rand);
    out.options = idx.map(i => q.options[i]);
    out.answer = idx.indexOf(q.answer);
  } else {
    out.lcap = q.lcap; out.rcap = q.rcap;
    const pairs = shuffle(q.pairs, rand);
    out.lefts = pairs.map((p, i) => ({ id: 'L' + i, t: p[0] }));
    out.rights = shuffle(pairs.map((p, i) => ({ id: 'L' + i, t: p[1] })), rand);
  }
  return out;
}

// ---- grading ---------------------------------------------------

export function answerMC(sess, i, choice, elapsedMs) {
  const q = sess.questions[i];
  const correct = choice === q.answer;
  sess.answers[i] = { choice, correct, score: correct ? 1 : 0, ms: elapsedMs || 0, at: Date.now() };
  srs.grade(q, correct ? 1 : 0, elapsedMs);
  return sess.answers[i];
}

export function answerMatch(sess, i, mapping, elapsedMs) {
  const q = sess.questions[i];
  let right = 0;
  q.lefts.forEach(l => { if (mapping[l.id] === l.id) right += 1; });
  const score = q.lefts.length ? right / q.lefts.length : 0;
  sess.answers[i] = { mapping, correct: score === 1, score, right, total: q.lefts.length, ms: elapsedMs || 0, at: Date.now() };
  srs.grade(q, score, elapsedMs);
  return sess.answers[i];
}

export function skip(sess, i) {
  const q = sess.questions[i];
  sess.answers[i] = { skipped: true, correct: false, score: 0, ms: 0, at: Date.now() };
  srs.grade(q, 0, null);
  return sess.answers[i];
}

// ---- scoring ---------------------------------------------------

export function score(sess) {
  let pts = 0, answered = 0, correct = 0, ms = 0;
  sess.answers.forEach(a => {
    if (!a) return;
    answered += 1; pts += a.score; ms += a.ms || 0;
    if (a.correct) correct += 1;
  });
  const n = sess.questions.length;
  return {
    n, answered, correct, points: pts, ms,
    percent: n ? Math.round((pts / n) * 100) : 0,
    exact: n ? Math.round((correct / n) * 100) : 0
  };
}

export function byChapter(sess) {
  const m = new Map();
  sess.questions.forEach((q, i) => {
    const a = sess.answers[i];
    const r = m.get(q.ch) || { ch: q.ch, n: 0, pts: 0 };
    r.n += 1; r.pts += a ? a.score : 0;
    m.set(q.ch, r);
  });
  return Array.from(m.values()).map(r => Object.assign(r, { acc: pct(r.pts, r.n) }));
}

export function byTopic(sess) {
  const m = new Map();
  sess.questions.forEach((q, i) => {
    const a = sess.answers[i];
    const key = q.topic || 'Untitled';
    const r = m.get(key) || { topic: key, n: 0, pts: 0 };
    r.n += 1; r.pts += a ? a.score : 0;
    m.set(key, r);
  });
  return Array.from(m.values()).map(r => Object.assign(r, { acc: pct(r.pts, r.n) }))
    .sort((a, b) => a.acc - b.acc || b.n - a.n);
}

// ---- persistence -----------------------------------------------

const CURRENT = 'current';

export async function saveCurrent(sess) { await store.set('kv', CURRENT, sess); }
export async function loadCurrent() { return store.get('kv', CURRENT); }
export async function clearCurrent() { await store.del('kv', CURRENT); }

export async function archive(sess) {
  sess.endedAt = Date.now();
  const s = score(sess);
  await store.set('sessions', sess.id, {
    id: sess.id, at: sess.endedAt, spec: sess.spec,
    n: s.n, points: s.points, percent: s.percent, ms: s.ms,
    chapters: byChapter(sess), topics: byTopic(sess).slice(0, 40)
  });
  await srs.flush();
  await clearCurrent();
}

export async function history() {
  const rows = await store.entries('sessions');
  return rows.map(r => r[1]).filter(Boolean).sort((a, b) => b.at - a.at);
}
