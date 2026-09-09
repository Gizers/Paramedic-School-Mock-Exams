// ---------------------------------------------------------------
// Custom exam builder: pick chapters, topics, length, mode, timer.
// ---------------------------------------------------------------

import * as data from './../data.js';
import * as srs from './../srs.js';
import * as store from './../store.js';
import { SELECT_MODES } from './../session.js';
import { appbar, go } from './../main.js';
import { startSpec } from './home.js';
import { esc, on, $, $$, toast } from './../util.js';

const COUNTS = [10, 20, 30, 50, 75, 100];
const TIMERS = [0, 30, 45, 60, 90, 120];

let sel = null;   // { chapters:Set, topics:Set, count, qtype, select, mode, timer, openCh }

export default async function buildView(app, args) {
  const mfst = data.mf();
  const st = await store.settings();

  if (!sel) {
    sel = {
      chapters: new Set(),
      topics: new Set(),
      count: st.count,
      qtype: 'both',
      select: 'adaptive',
      mode: st.mode,
      timer: st.timer,
      openCh: null
    };
  }

  // module/chapter preselect from the route
  if (args[0] === 'ch' && args[1]) {
    sel.chapters = new Set([args[1]]);
  } else if (args[0] && /^\d+$/.test(args[0])) {
    sel.chapters = new Set(data.chaptersOf(Number(args[0])).map(c => c.id));
  } else if (!sel.chapters.size) {
    sel.chapters = new Set(mfst.chapters.map(c => c.id));
  }

  paint(app);
}

function selectedQuestionCount() {
  let n = 0;
  sel.chapters.forEach(id => { const c = data.chapter(id); if (c) n += c.n; });
  return n;
}

function paint(app) {
  const mfst = data.mf();
  const available = selectedQuestionCount();

  app.innerHTML =
    appbar({ title: 'Build an exam', sub: available + ' questions selected', back: '' }) +

    '<div class="panel">' +
      '<div class="panel-h"><div class="eyebrow">Content</div>' +
      '<div class="row tight">' +
        '<button class="lnk" data-all="1">select all</button>' +
        '<button class="lnk" data-none="1">clear</button>' +
      '</div></div>' +
      mfst.modules.map(m => moduleBlock(m)).join('') +
    '</div>' +

    '<div class="panel">' +
      '<div class="eyebrow">How questions are chosen</div>' +
      '<div class="seg" style="margin:8px 0 10px">' +
        SELECT_MODES.map(s =>
          '<button class="seg-b' + (sel.select === s[0] ? ' on' : '') + '" data-sel="' + s[0] + '">' + esc(s[1]) + '</button>'
        ).join('') +
      '</div>' +
      '<p class="dim" style="font-size:13px;margin:0">' +
        esc((SELECT_MODES.find(s => s[0] === sel.select) || [])[2] || '') + '</p>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="eyebrow">Length</div>' +
      '<div class="seg" style="margin:8px 0 14px">' +
        COUNTS.map(c => '<button class="seg-b' + (sel.count === c ? ' on' : '') + '" data-count="' + c + '">' + c + '</button>').join('') +
      '</div>' +

      '<div class="eyebrow">Question types</div>' +
      '<div class="seg" style="margin:8px 0 14px">' +
        [['both', 'All'], ['mc', 'Multiple choice'], ['match', 'Matching']].map(t =>
          '<button class="seg-b' + (sel.qtype === t[0] ? ' on' : '') + '" data-qt="' + t[0] + '">' + esc(t[1]) + '</button>').join('') +
      '</div>' +

      '<div class="eyebrow">Feedback</div>' +
      '<div class="seg" style="margin:8px 0 14px">' +
        '<button class="seg-b' + (sel.mode === 'instant' ? ' on' : '') + '" data-mode="instant">Instant</button>' +
        '<button class="seg-b' + (sel.mode === 'sim' ? ' on' : '') + '" data-mode="sim">Exam simulation</button>' +
      '</div>' +
      '<p class="dim" style="font-size:13px;margin:0 0 14px">' +
        (sel.mode === 'instant'
          ? 'Right/wrong and the reasoning show after every question.'
          : 'No feedback until the end — closest to how the real exam feels.') + '</p>' +

      '<div class="eyebrow">Per-question timer</div>' +
      '<div class="seg" style="margin:8px 0 0">' +
        TIMERS.map(t => '<button class="seg-b' + (sel.timer === t ? ' on' : '') + '" data-timer="' + t + '">' +
          (t ? t + 's' : 'Off') + '</button>').join('') +
      '</div>' +
    '</div>' +

    '<div class="sticky-actions">' +
      '<button class="btn wide" data-start="1"' + (available ? '' : ' disabled') + '>' +
        'Start · ' + Math.min(sel.count, available) + ' questions</button>' +
    '</div>';

  wire(app);
}

function moduleBlock(m) {
  const chs = data.chaptersOf(m.id);
  const onCount = chs.filter(c => sel.chapters.has(c.id)).length;
  const state = onCount === 0 ? '' : onCount === chs.length ? 'on' : 'some';
  return '<div style="margin-bottom:12px">' +
    '<div class="spread" style="margin-bottom:4px">' +
      '<button class="chrow" data-mod="' + m.id + '" style="border:0;padding:6px 0;width:auto">' +
        '<span class="tick ' + state + '">' + (state === 'on' ? '✓' : state === 'some' ? '·' : '') + '</span>' +
        '<span class="nm"><b>' + esc(m.label) + ' — ' + esc(m.name) + '</b></span>' +
      '</button>' +
      '<span class="mono dim">' + onCount + '/' + chs.length + '</span>' +
    '</div>' +
    '<div class="row tight">' +
      chs.map(c => {
        const isOn = sel.chapters.has(c.id);
        const topicsOn = sel.openCh === c.id;
        return '<span class="chippair">' +
          '<button class="chip' + (isOn ? ' on' : ' solo') + '" data-ch="' + esc(c.id) + '">' +
            esc(c.short) + ' <span class="ct">' + c.n + '</span></button>' +
          (isOn ? '<button class="chip' + (topicsOn ? ' on' : '') + '" data-topics="' + esc(c.id) +
            '" title="Filter topics">' + (topicsOn ? '▴' : '▾') + '</button>' : '') +
          '</span>';
      }).join('') +
    '</div>' +
    (sel.openCh && data.chapter(sel.openCh) && data.chapter(sel.openCh).module === m.id ? topicPicker(sel.openCh) : '') +
    '</div>';
}

function topicPicker(chId) {
  const c = data.chapter(chId);
  return '<div class="panel tight flat" style="margin-top:8px;border-style:dashed">' +
    '<div class="spread" style="margin-bottom:6px">' +
      '<div class="mono dim">' + esc(c.title) + ' topics</div>' +
      '<button class="lnk" data-topicclear="1">use all</button>' +
    '</div>' +
    '<div class="row tight">' +
      c.topics.map(t => {
        const key = chId + '|' + t;
        const st = srs.topicStats(chId).find(x => x.topic === t);
        return '<button class="chip' + (sel.topics.has(t) ? ' on' : '') + '" data-topic="' + esc(t) + '">' +
          esc(t) + (st ? ' <span class="ct">' + st.acc + '%</span>' : '') + '</button>';
      }).join('') +
    '</div></div>';
}

function wire(app) {
  on(app, '[data-ch]', el => {
    const id = el.getAttribute('data-ch');
    if (sel.chapters.has(id)) { sel.chapters.delete(id); if (sel.openCh === id) sel.openCh = null; }
    else sel.chapters.add(id);
    paint(app);
  });
  on(app, '[data-mod]', el => {
    const chs = data.chaptersOf(Number(el.getAttribute('data-mod')));
    const allOn = chs.every(c => sel.chapters.has(c.id));
    chs.forEach(c => allOn ? sel.chapters.delete(c.id) : sel.chapters.add(c.id));
    paint(app);
  });
  on(app, '[data-topics]', el => {
    const id = el.getAttribute('data-topics');
    sel.openCh = sel.openCh === id ? null : id;
    sel.topics = new Set();
    paint(app);
  });
  on(app, '[data-topic]', el => {
    const t = el.getAttribute('data-topic');
    sel.topics.has(t) ? sel.topics.delete(t) : sel.topics.add(t);
    paint(app);
  });
  on(app, '[data-topicclear]', () => { sel.topics = new Set(); paint(app); });
  on(app, '[data-all]', () => { sel.chapters = new Set(data.mf().chapters.map(c => c.id)); paint(app); });
  on(app, '[data-none]', () => { sel.chapters = new Set(); sel.openCh = null; paint(app); });
  on(app, '[data-count]', el => { sel.count = Number(el.getAttribute('data-count')); paint(app); });
  on(app, '[data-qt]', el => { sel.qtype = el.getAttribute('data-qt'); paint(app); });
  on(app, '[data-mode]', el => { sel.mode = el.getAttribute('data-mode'); paint(app); });
  on(app, '[data-timer]', el => { sel.timer = Number(el.getAttribute('data-timer')); paint(app); });
  on(app, '[data-sel]', el => { sel.select = el.getAttribute('data-sel'); paint(app); });

  on(app, '[data-start]', async () => {
    if (!sel.chapters.size) return toast('Pick at least one chapter.');
    await store.saveSettings({ count: sel.count, mode: sel.mode, timer: sel.timer });
    await startSpec({
      chapters: Array.from(sel.chapters),
      topics: sel.topics.size ? Array.from(sel.topics) : null,
      count: sel.count,
      qtype: sel.qtype,
      select: sel.select,
      mode: sel.mode,
      timer: sel.timer
    });
  });
}
