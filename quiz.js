// ---------------------------------------------------------------
// The exam runner. Multiple choice + matching, instant feedback or
// silent exam simulation, optional per-question timer, flagging,
// and the source-slide viewer carried over from the original files.
// ---------------------------------------------------------------

import * as data from './../data.js';
import * as srs from './../srs.js';
import * as store from './../store.js';
import * as sessionLib from './../session.js';
import { appbar, go, ctx } from './../main.js';
import { esc, on, $, $$, mmss, toast, pct } from './../util.js';

let ui = null;   // { sel, revealed, showSlide, tLeft, tHandle, qStart }

export default async function quiz(app, args) {
  const sess = ctx.session;
  if (!sess) return go('');
  if (sess.i >= sess.questions.length) return finish(app);

  const settings = await store.settings();
  ui = ui && ui.qIndex === sess.i ? ui : {
    qIndex: sess.i, sel: null, mapping: {}, matchSel: null,
    revealed: !!sess.answers[sess.i], showSlide: false, qStart: Date.now()
  };

  paint(app, sess, settings);
  startTimer(app, sess, settings);
}

function paint(app, sess, settings) {
  const i = sess.i;
  const q = sess.questions[i];
  const ans = sess.answers[i];
  const sim = sess.spec.mode === 'sim';
  const showFeedback = ui.revealed && !sim;
  const ch = data.chapter(q.ch);
  const flagged = srs.isFlagged(q.id);

  app.innerHTML =
    appbar({
      title: sim ? 'Exam simulation' : 'Practice',
      sub: (ch ? ch.short : '') + ' · ' + q.topic,
      actions: [{ label: 'Quit', to: '', title: 'End this session' }]
    }) +

    '<div class="pbar">' +
      '<span class="n tnum">' + (i + 1) + '/' + sess.questions.length + '</span>' +
      '<span class="track"><span class="fill" style="width:' + ((i) / sess.questions.length * 100) + '%"></span></span>' +
      (sess.spec.timer ? '<span class="clock" id="clock">' + mmss(sess.spec.timer) + '</span>' : '') +
      '<button class="iconbtn" id="flagbtn" title="Flag for review" style="min-width:34px;height:34px">' +
        (flagged ? '★' : '☆') + '</button>' +
    '</div>' +

    '<div class="panel">' +
      (q.img && data.hasMedia(q.img) ? questionImage(q) : '') +
      '<div class="qstem">' + esc(q.stem) + '</div>' +
      (q.type === 'mc' ? mcBody(q, ans, showFeedback) : matchBody(q, ans, showFeedback)) +
      (showFeedback ? feedback(q, ans) : '') +
      (showFeedback && settings.showSlides ? srcLine(q) : '') +
    '</div>' +

    '<div class="sticky-actions">' + actions(sess, ans, sim) + '</div>';

  wire(app, sess, settings);
}

/**
 * Rhythm strips have to stay at a scale where the 1 mm boxes are countable —
 * shrinking one to phone width makes it unreadable and unmeasurable. So a strip
 * keeps a minimum width and scrolls sideways in its own container; ordinary
 * diagrams just fit the column.
 */
function questionImage(q) {
  const url = esc(data.mediaUrl(q.img));
  const isStrip = /(^|\/)strip-/.test(q.img);
  const isEcg = /(^|\/)ecg-/.test(q.img);
  if (!isStrip && !isEcg) {
    return '<img class="qimg" src="' + url + '" alt="Question diagram" loading="lazy">';
  }
  const cls = isEcg ? 'strip wide' : 'strip';
  const alt = isEcg ? '12-lead ECG' : 'Rhythm strip';
  const hint = isEcg ? '12-lead · scroll sideways to read every lead'
                     : '6-second strip · scroll sideways to read the boxes';
  return '<div class="stripwrap' + (isEcg ? ' ecg' : '') + '">' +
    '<div class="stripscroll"><img class="' + cls + '" src="' + url + '" alt="' + alt + '"></div>' +
    '<div class="striphint mono">' + hint + '</div>' +
    '</div>';
}

// ---------------- multiple choice ----------------

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function mcBody(q, ans, showFeedback) {
  return '<div class="opts">' + q.options.map((o, idx) => {
    let cls = 'opt';
    let extra = '';
    if (showFeedback) {
      if (idx === q.answer) cls += ' right';
      else if (ans && ans.choice === idx) cls += ' wrong';
      if (idx !== q.answer && o.why && (ans && ans.choice === idx)) {
        extra = '<span class="ow">' + esc(o.why) + '</span>';
      }
    } else if (ui.sel === idx) cls += ' picked';
    const dis = showFeedback || (ans && ans.choice != null) ? ' disabled' : '';
    return '<button class="' + cls + '" data-opt="' + idx + '"' + dis + '>' +
      '<span class="key">' + KEYS[idx] + '</span>' +
      '<span>' + esc(o.t) + extra + '</span></button>';
  }).join('') + '</div>';
}

// ---------------- matching ----------------

function matchBody(q, ans, showFeedback) {
  const mapping = (ans && ans.mapping) || ui.mapping;
  const usedRight = new Set(Object.values(mapping));

  const left = q.lefts.map(l => {
    const chosen = mapping[l.id];
    let cls = 'mitem';
    if (showFeedback && chosen) cls += chosen === l.id ? ' ok' : ' bad';
    else if (chosen) cls += ' done';
    if (ui.matchSel === l.id) cls += ' sel';
    const label = chosen ? (q.rights.find(r => r.id === chosen) || {}).t : null;
    return '<button class="' + cls + '" data-left="' + esc(l.id) + '"' + (showFeedback ? ' disabled' : '') + '>' +
      esc(l.t) + (label ? '<span class="tag">→ ' + esc(label) + '</span>' : '') + '</button>';
  }).join('');

  const right = q.rights.map(r => {
    let cls = 'mitem';
    if (usedRight.has(r.id)) cls += ' done';
    if (showFeedback) {
      const pairedLeft = Object.keys(mapping).find(k => mapping[k] === r.id);
      if (pairedLeft) cls += pairedLeft === r.id ? ' ok' : ' bad';
    }
    return '<button class="' + cls + '" data-right="' + esc(r.id) + '"' + (showFeedback ? ' disabled' : '') + '>' +
      esc(r.t) + '</button>';
  }).join('');

  const hint = showFeedback ? '' :
    '<p class="dim" style="font-size:13px;margin:-4px 0 10px">Tap an item on the left, then its match on the right.</p>';

  return hint + '<div class="mgrid">' +
    '<div><div class="mcol-h">' + esc(q.lcap) + '</div>' + left + '</div>' +
    '<div class="rcol"><div class="mcol-h">' + esc(q.rcap) + '</div>' + right + '</div>' +
    '</div>' +
    (showFeedback ? '' : '<div class="row" style="margin-top:6px"><button class="lnk" id="mclear">clear matches</button></div>');
}

// ---------------- feedback ----------------

function feedback(q, ans) {
  if (!ans) return '';
  const ok = ans.correct;
  let verdict, detail = '';
  if (q.type === 'match') {
    verdict = ans.right + ' of ' + ans.total + ' correct';
    if (!ok) {
      detail = '<p style="margin:6px 0 0;font-size:13.5px" class="lede">Correct pairs: ' +
        q.lefts.map(l => esc(l.t) + ' → ' + esc((q.rights.find(r => r.id === l.id) || {}).t)).join(' · ') + '</p>';
    }
  } else {
    verdict = ans.skipped ? 'Skipped' : ok ? 'Correct' : 'Incorrect';
    if (!ok) {
      detail = '<p style="margin:6px 0 0;font-size:14px"><span class="dim">Answer:</span> ' +
        esc(q.options[q.answer].t) + '</p>';
    }
  }
  return '<div class="fb ' + (ok ? 'ok' : 'no') + '">' +
    '<div class="verdict">' + esc(verdict) + '</div>' +
    (q.why ? '<p style="margin:4px 0 0">' + esc(q.why) + '</p>' : '') +
    detail + '</div>';
}

function srcLine(q) {
  if (!q.ref) return '';
  const hasSlide = !!q.slide && data.hasMedia(q.slide);
  return '<div class="srcline">Source: ' + esc(q.ref) +
    (hasSlide ? ' · <button class="lnk" id="slidebtn">' + (ui.showSlide ? 'hide slide' : 'view slide') + '</button>' : '') +
    (hasSlide && ui.showSlide
      ? '<div class="slidebox"><img src="' + esc(data.mediaUrl(q.slide)) + '" alt="' + esc(q.ref) + '" loading="lazy"></div>'
      : '') +
    '</div>';
}

// ---------------- actions ----------------

function actions(sess, ans, sim) {
  const i = sess.i, last = i === sess.questions.length - 1;
  const q = sess.questions[i];

  if (sim) {
    const chosen = q.type === 'mc' ? (ui.sel != null) : Object.keys(ui.mapping).length === q.lefts.length;
    return '<div class="row">' +
      (i > 0 ? '<button class="btn ghost" id="prev">Back</button>' : '') +
      '<button class="btn" id="next" style="flex:1">' + (last ? 'Finish' : 'Next') + '</button>' +
      (chosen ? '' : '<button class="btn ghost" id="skip">Skip</button>') +
      '</div>';
  }

  if (!ui.revealed) {
    const ready = q.type === 'mc'
      ? ui.sel != null
      : Object.keys(ui.mapping).length === q.lefts.length;
    return '<div class="row">' +
      '<button class="btn" id="check" style="flex:1"' + (ready ? '' : ' disabled') + '>Check answer</button>' +
      '<button class="btn ghost" id="skip">Skip</button>' +
      '</div>';
  }
  return '<button class="btn wide" id="next">' + (last ? 'See results' : 'Next question') + '</button>';
}

// ---------------- wiring ----------------

function wire(app, sess, settings) {
  const q = sess.questions[sess.i];

  on(app, '[data-opt]', el => {
    if (ui.revealed) return;
    ui.sel = Number(el.getAttribute('data-opt'));
    if (sess.spec.mode === 'sim') { paint(app, sess, settings); return; }
    doCheck(app, sess, settings);
  });

  on(app, '[data-left]', el => {
    ui.matchSel = el.getAttribute('data-left');
    paint(app, sess, settings);
  });
  on(app, '[data-right]', el => {
    const rid = el.getAttribute('data-right');
    if (!ui.matchSel) { toast('Pick an item on the left first.'); return; }
    Object.keys(ui.mapping).forEach(k => { if (ui.mapping[k] === rid) delete ui.mapping[k]; });
    ui.mapping[ui.matchSel] = rid;
    ui.matchSel = null;
    paint(app, sess, settings);
  });

  const clear = $('#mclear', app);
  if (clear) clear.addEventListener('click', () => { ui.mapping = {}; ui.matchSel = null; paint(app, sess, settings); });

  const check = $('#check', app);
  if (check) check.addEventListener('click', () => doCheck(app, sess, settings));

  const next = $('#next', app);
  if (next) next.addEventListener('click', () => advance(app, sess, settings));

  const prev = $('#prev', app);
  if (prev) prev.addEventListener('click', () => {
    stopTimer();
    sess.i = Math.max(0, sess.i - 1);
    ui = null;
    quiz(app, []);
  });

  const skip = $('#skip', app);
  if (skip) skip.addEventListener('click', () => {
    sessionLib.skip(sess, sess.i);
    if (sess.spec.mode === 'sim') advance(app, sess, settings);
    else { ui.revealed = true; paint(app, sess, settings); stopTimer(); }
  });

  const flag = $('#flagbtn', app);
  if (flag) flag.addEventListener('click', () => {
    const now = srs.toggleFlag(q);
    flag.textContent = now ? '★' : '☆';
    toast(now ? 'Flagged for review' : 'Flag removed');
  });

  const slide = $('#slidebtn', app);
  if (slide) slide.addEventListener('click', () => { ui.showSlide = !ui.showSlide; paint(app, sess, settings); });

  bindKeys(app, sess, settings);
}

let keyHandler = null;
function bindKeys(app, sess, settings) {
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = ev => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const q = sess.questions[sess.i];
    const k = ev.key.toUpperCase();
    if (q.type === 'mc' && !ui.revealed) {
      const idx = KEYS.indexOf(k);
      if (idx > -1 && idx < q.options.length) {
        ev.preventDefault();
        ui.sel = idx;
        if (sess.spec.mode === 'sim') paint(app, sess, settings);
        else doCheck(app, sess, settings);
        return;
      }
      const n = parseInt(ev.key, 10);
      if (n >= 1 && n <= q.options.length) {
        ev.preventDefault();
        ui.sel = n - 1;
        if (sess.spec.mode === 'sim') paint(app, sess, settings);
        else doCheck(app, sess, settings);
        return;
      }
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      const btn = $('#next', app) || $('#check', app);
      if (btn && !btn.disabled) { ev.preventDefault(); btn.click(); }
    }
    if (k === 'F') { const f = $('#flagbtn', app); if (f) f.click(); }
  };
  document.addEventListener('keydown', keyHandler);
}

function doCheck(app, sess, settings) {
  const i = sess.i, q = sess.questions[i];
  const elapsed = Date.now() - ui.qStart;
  if (q.type === 'mc') {
    if (ui.sel == null) return;
    sessionLib.answerMC(sess, i, ui.sel, elapsed);
  } else {
    sessionLib.answerMatch(sess, i, Object.assign({}, ui.mapping), elapsed);
  }
  ui.revealed = true;
  stopTimer();
  sessionLib.saveCurrent(sess);
  paint(app, sess, settings);
}

function advance(app, sess, settings) {
  const i = sess.i, q = sess.questions[i];
  if (sess.spec.mode === 'sim' && !sess.answers[i]) {
    const elapsed = Date.now() - ui.qStart;
    if (q.type === 'mc' && ui.sel != null) sessionLib.answerMC(sess, i, ui.sel, elapsed);
    else if (q.type === 'match' && Object.keys(ui.mapping).length) sessionLib.answerMatch(sess, i, Object.assign({}, ui.mapping), elapsed);
    else sessionLib.skip(sess, i);
  }
  stopTimer();
  sess.i += 1;
  ui = null;
  sessionLib.saveCurrent(sess);
  if (sess.i >= sess.questions.length) return finish(app);
  quiz(app, []);
}

async function finish(app) {
  const sess = ctx.session;
  stopTimer();
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
  ctx.lastResult = sess;
  await sessionLib.archive(sess);
  ctx.session = null;
  go('results');
}

// ---------------- timer ----------------

let tHandle = null;
function stopTimer() { if (tHandle) { clearInterval(tHandle); tHandle = null; } }

function startTimer(app, sess, settings) {
  stopTimer();
  if (!sess.spec.timer || ui.revealed) return;
  let left = sess.spec.timer;
  const el = $('#clock', app);
  tHandle = setInterval(() => {
    left -= 1;
    if (el) {
      el.textContent = mmss(left);
      el.classList.toggle('low', left <= 5);
    }
    if (left <= 0) {
      stopTimer();
      if (sess.spec.mode === 'sim') advance(app, sess, settings);
      else {
        const q = sess.questions[sess.i];
        if (q.type === 'mc' && ui.sel != null) doCheck(app, sess, settings);
        else { sessionLib.skip(sess, sess.i); ui.revealed = true; paint(app, sess, settings); }
      }
    }
  }, 1000);
}
