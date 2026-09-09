// ---------------------------------------------------------------
// Home: quick-start row, module cards, chapter drill-down.
// ---------------------------------------------------------------

import * as data from './../data.js';
import * as srs from './../srs.js';
import * as store from './../store.js';
import * as sessionLib from './../session.js';
import { appbar, go, ctx, render } from './../main.js';
import { esc, on, pct, band, meter, $ } from './../util.js';

export default async function home(app, args) {
  const mfst = data.mf();
  const moduleId = args[0] ? Number(args[0]) : null;
  if (moduleId) return moduleScreen(app, moduleId);

  const o = srs.overall();
  const totals = mfst.totals;
  const resume = ctx.session && !ctx.session.endedAt && ctx.session.answers.some(a => a);

  app.innerHTML =
    appbar({
      title: 'Paramedic Exam Suite',
      sub: totals.questions + ' questions · ' + mfst.chapters.length + ' chapters',
      actions: [
        { label: 'Stats', to: 'progress', title: 'Progress' },
        { label: '⚙', to: 'settings', title: 'Settings' }
      ]
    }) +

    (resume ? resumeCard() : '') +

    '<div class="panel">' +
      '<div class="panel-h"><div><div class="eyebrow">Quick start</div>' +
      '<h2>Pick up where you left off</h2></div></div>' +
      quickRow(o) +
      (o.answers ? statsStrip(o, totals) : '<p class="dim" style="margin-top:12px">Nothing answered yet — start with any module below, or hit <b>New material</b>.</p>') +
    '</div>' +

    '<div class="panel-h" style="margin-top:20px"><div class="eyebrow">Modules</div></div>' +
    '<div class="modgrid">' +
      mfst.modules.map(m => moduleCard(m)).join('') +
    '</div>' +

    '<div class="panel-h" style="margin-top:22px"><div class="eyebrow">Reference</div></div>' +
    '<div class="row">' +
      '<button class="btn ghost" data-nav="reference/meds">Drug reference</button>' +
      '<button class="btn ghost" data-nav="reference/acronyms">Acronyms</button>' +
      '<button class="btn ghost" data-nav="build">Custom exam</button>' +
    '</div>';

  on(app, '[data-quick]', el => quickStart(el.getAttribute('data-quick')));
  on(app, '[data-resume]', () => go('quiz'));
  on(app, '[data-discard]', async () => {
    ctx.session = null;
    await sessionLib.clearCurrent();
    render();
  });
}

/** The loudest button is whichever action is actually worth taking right now. */
function quickRow(o) {
  const primary = o.due ? 'due' : (o.answers ? 'weak' : 'unseen');
  const btn = (kind, label, enabled) =>
    '<button class="btn' + (kind === primary && enabled ? '' : ' ghost') + '" data-quick="' + kind + '"' +
    (enabled ? '' : ' disabled') + '>' + label + '</button>';
  return '<div class="row">' +
    btn('due', 'Review due · ' + o.due, o.due > 0) +
    btn('weak', 'Drill weak spots', o.answers > 0) +
    btn('unseen', 'New material', true) +
    btn('flagged', 'Flagged · ' + o.flagged, o.flagged > 0) +
    '</div>';
}

function resumeCard() {
  const s = ctx.session;
  const done = s.answers.filter(a => a).length;
  return '<div class="panel" style="border-left:3px solid var(--signal)">' +
    '<div class="eyebrow">In progress</div>' +
    '<h2>' + done + ' of ' + s.questions.length + ' answered</h2>' +
    '<div class="row" style="margin-top:10px">' +
      '<button class="btn" data-resume="1">Resume exam</button>' +
      '<button class="lnk" data-discard="1">Discard it</button>' +
    '</div></div>';
}

function statsStrip(o, totals) {
  const coverage = pct(o.touched, totals.questions);
  return '<hr class="rule">' +
    '<div class="stats">' +
      '<div class="stat"><div class="v">' + o.acc + '%</div><div class="k">Lifetime</div></div>' +
      '<div class="stat"><div class="v">' + o.answers + '</div><div class="k">Answers</div></div>' +
      '<div class="stat"><div class="v">' + o.mastered + '</div><div class="k">Mastered</div></div>' +
      '<div class="stat"><div class="v">' + coverage + '%</div><div class="k">Bank seen</div></div>' +
    '</div>';
}

function moduleCard(m) {
  const chs = data.chaptersOf(m.id);
  const n = chs.reduce((a, c) => a + c.n, 0);
  let seen = 0, right = 0, touched = 0;
  chs.forEach(c => { const s = srs.chapterStats(c.id); seen += s.seen; right += s.right; touched += s.cardsSeen; });
  const acc = seen ? Math.round(right / seen * 100) : null;
  return '<button class="modcard" data-m="' + m.id + '" data-nav="module/' + m.id + '">' +
    '<div class="t">' + esc(m.name) + '</div>' +
    '<div class="b">' + esc(m.blurb) + '</div>' +
    '<div class="mono dim" style="margin-top:6px">' + esc(m.label) + ' · ' + n + ' questions · ' +
      chs.length + ' chapters' +
      (acc == null ? ' · not started' : ' · ' + acc + '% over ' + touched + ' seen') + '</div>' +
    '</button>';
}

// ---------------- module screen ----------------

async function moduleScreen(app, moduleId) {
  const m = data.mf().moduleById[moduleId];
  if (!m) return go('');
  const chs = data.chaptersOf(moduleId);
  const total = chs.reduce((a, c) => a + c.n, 0);

  app.innerHTML =
    appbar({ title: m.name, sub: m.label + ' · ' + total + ' questions', back: '',
             actions: [{ label: 'Build', to: 'build/' + moduleId, title: 'Custom exam' }] }) +

    '<div class="panel">' +
      '<div class="row">' +
        '<button class="btn" data-full="1">Full module exam · 50</button>' +
        '<button class="btn ghost" data-quickm="adaptive">Adaptive 30</button>' +
        '<button class="btn ghost" data-nav="build/' + moduleId + '">Custom…</button>' +
      '</div>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel-h"><div class="eyebrow">Chapters</div><div class="mono dim">tap to study</div></div>' +
      chs.map(chapterRow).join('') +
    '</div>';

  on(app, '[data-ch]', el => {
    const id = el.getAttribute('data-ch');
    startSpec({ chapters: [id], count: Math.min(25, data.chapter(id).n), select: 'adaptive' });
  });
  on(app, '[data-full]', () => startSpec({ chapters: chs.map(c => c.id), count: Math.min(50, total), select: 'random', mode: 'sim' }));
  on(app, '[data-quickm]', () => startSpec({ chapters: chs.map(c => c.id), count: 30, select: 'adaptive' }));
}

function chapterRow(c) {
  const s = srs.chapterStats(c.id);
  const seenPct = pct(s.cardsSeen, c.n);
  const tick = s.cardsSeen === 0 ? '' : (s.cardsSeen >= c.n ? 'on' : 'some');
  const accTxt = s.seen ? s.acc + '% · ' + s.cardsSeen + '/' + c.n + ' seen' : c.n + ' questions · not started';
  const dueBadge = s.due ? ' <span class="badge due">' + s.due + ' due</span>' : '';
  return '<button class="chrow" data-ch="' + esc(c.id) + '">' +
    '<span class="tick ' + tick + '">' + (tick === 'on' ? '✓' : tick === 'some' ? '·' : '') + '</span>' +
    '<span class="nm"><b>' + esc(c.title) + '</b>' + dueBadge +
    '<small>' + esc(accTxt) + '</small></span>' +
    (s.seen ? '<span class="mono ' + (band(s.acc) === 'bad' ? 'dim' : '') + '">' + s.acc + '%</span>' : '<span class="mono dim">' + seenPct + '%</span>') +
    '</button>';
}

// ---------------- shared start helper ----------------

export async function startSpec(partial) {
  const st = await store.settings();
  const spec = Object.assign({
    chapters: data.mf().chapters.map(c => c.id),
    topics: null,
    count: st.count,
    qtype: 'both',
    select: 'adaptive',
    mode: st.mode,
    timer: st.timer,
    shuffleOptions: st.shuffleOptions
  }, partial);

  const sess = await sessionLib.build(spec);
  if (!sess.questions.length) {
    const { toast } = await import('./../util.js');
    toast('No questions match that — try a wider selection.');
    return;
  }
  ctx.session = sess;
  await sessionLib.saveCurrent(sess);
  go('quiz');
}

async function quickStart(kind) {
  const map = {
    due:     { select: 'due',     count: 25 },
    weak:    { select: 'weak',    count: 20 },
    unseen:  { select: 'unseen',  count: 20 },
    flagged: { select: 'flagged', count: 20 }
  };
  await startSpec(map[kind] || {});
}
