// ---------------------------------------------------------------
// Results: score, per-chapter and per-topic breakdown, full review.
// ---------------------------------------------------------------

import * as data from './../data.js';
import * as srs from './../srs.js';
import * as sessionLib from './../session.js';
import { appbar, go, ctx } from './../main.js';
import { startSpec } from './home.js';
import { esc, on, band, dur, pct, $ } from './../util.js';

let showAll = false;

export default async function results(app, args) {
  const sess = ctx.lastResult;
  if (!sess) return go('progress');

  const s = sessionLib.score(sess);
  const chs = sessionLib.byChapter(sess);
  const topics = sessionLib.byTopic(sess);
  const missed = sess.questions
    .map((q, i) => ({ q, a: sess.answers[i], i }))
    .filter(x => !x.a || !x.a.correct);

  const b = band(s.percent);
  const avg = s.answered ? s.ms / s.answered : 0;

  app.innerHTML =
    appbar({ title: 'Results', sub: sess.spec.mode === 'sim' ? 'Exam simulation' : 'Practice session',
             actions: [{ label: 'Done', to: '', title: 'Home' }] }) +

    '<div class="panel">' +
      '<div class="score">' +
        '<div class="big ' + b + '">' + s.percent + '%</div>' +
        '<div><div class="mono dim">' + s.points.toFixed(s.points % 1 ? 1 : 0) + ' of ' + s.n + ' points</div>' +
        '<div class="mono dim">' + s.correct + ' fully correct</div></div>' +
      '</div>' +
      '<hr class="rule">' +
      '<div class="stats">' +
        '<div class="stat"><div class="v">' + s.n + '</div><div class="k">Questions</div></div>' +
        '<div class="stat"><div class="v">' + dur(s.ms) + '</div><div class="k">Total time</div></div>' +
        '<div class="stat"><div class="v">' + Math.round(avg / 1000) + 's</div><div class="k">Avg / question</div></div>' +
        '<div class="stat"><div class="v">' + missed.length + '</div><div class="k">To review</div></div>' +
      '</div>' +
    '</div>' +

    (chs.length > 1 ? '<div class="panel">' +
      '<div class="eyebrow">By chapter</div>' +
      '<div class="bars" style="margin-top:10px">' + chs.map(c => bar(chapterName(c.ch), c.acc, c.n)).join('') + '</div>' +
    '</div>' : '') +

    '<div class="panel">' +
      '<div class="eyebrow">Weakest topics this session</div>' +
      '<div class="bars" style="margin-top:10px">' +
        topics.slice(0, 8).map(t => bar(t.topic, t.acc, t.n)).join('') +
      '</div>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel-h"><div class="eyebrow">' + (showAll ? 'All questions' : 'What you missed') + '</div>' +
        '<button class="lnk" id="toggleall">' + (showAll ? 'show only misses' : 'show all ' + s.n) + '</button></div>' +
      reviewList(sess, showAll ? sess.questions.map((q, i) => ({ q, a: sess.answers[i], i })) : missed) +
    '</div>' +

    '<div class="sticky-actions">' +
      (missed.length ? '<button class="btn wide" id="redo" style="margin-bottom:8px">Retry the ' +
        missed.length + ' you missed</button>' : '') +
      '<div class="row">' +
        '<button class="btn ghost" id="again" style="flex:1">Another ' + s.n + '</button>' +
        '<button class="btn ghost" data-nav="" style="flex:1">Home</button>' +
      '</div>' +
    '</div>';

  on(app, '#toggleall', () => { showAll = !showAll; results(app, args); });

  on(app, '#redo', async () => {
    const ids = new Set(missed.map(x => x.q.id));
    const chapters = Array.from(new Set(missed.map(x => x.q.ch)));
    const spec = Object.assign({}, sess.spec, {
      chapters, topics: null, count: missed.length, select: 'random', seed: 0
    });
    // build from the same chapters then narrow to the missed ids
    const s2 = await sessionLib.build(Object.assign({}, spec, { count: 9999 }));
    s2.questions = s2.questions.filter(q => ids.has(q.id));
    s2.answers = new Array(s2.questions.length).fill(null);
    s2.i = 0;
    ctx.session = s2;
    await sessionLib.saveCurrent(s2);
    go('quiz');
  });

  on(app, '#again', () => startSpec(Object.assign({}, sess.spec, { seed: 0 })));
}

function chapterName(id) {
  const c = data.chapter(id);
  return c ? c.short : id;
}

function bar(label, acc, n) {
  const b = band(acc);
  const color = b === 'ok' ? 'var(--live)' : b === 'mid' ? 'var(--signal)' : 'var(--miss)';
  return '<div class="barrow">' +
    '<span class="lbl">' + esc(label) + ' <span class="dim mono">· ' + n + '</span></span>' +
    '<span class="pc">' + acc + '%</span>' +
    '<span class="bt"><span class="bf" style="width:' + acc + '%;background:' + color + '"></span></span>' +
    '</div>';
}

function reviewList(sess, rows) {
  if (!rows.length) return '<div class="empty">Clean sweep — nothing missed.</div>';
  return rows.map(({ q, a }) => {
    const ok = a && a.correct;
    let yours = '';
    if (q.type === 'mc') {
      const correct = q.options[q.answer].t;
      if (a && a.skipped) yours = '<span class="dim">skipped</span> · answer: ' + esc(correct);
      else if (a && !ok) yours = 'you: ' + esc(q.options[a.choice].t) + ' · answer: ' + esc(correct);
      else yours = 'answer: ' + esc(correct);
    } else {
      yours = a ? (a.right + ' of ' + a.total + ' pairs') : 'skipped';
    }
    return '<div class="revitem">' +
      '<div class="rq"><span class="mark ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓' : '✕') + '</span> ' + esc(q.stem) + '</div>' +
      '<div class="ra">' + yours + '</div>' +
      (q.why ? '<div class="ra dim" style="margin-top:4px">' + esc(q.why) + '</div>' : '') +
      '<div class="mono dim" style="font-size:10.5px;margin-top:4px">' + esc(chapterName(q.ch)) + ' · ' + esc(q.topic) + '</div>' +
      '</div>';
  }).join('');
}
