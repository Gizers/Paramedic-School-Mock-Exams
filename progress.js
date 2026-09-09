// ---------------------------------------------------------------
// Progress: lifetime accuracy, coverage, weak topics, session history.
// ---------------------------------------------------------------

import * as data from './../data.js';
import * as srs from './../srs.js';
import * as sessionLib from './../session.js';
import { appbar, go } from './../main.js';
import { startSpec } from './home.js';
import { esc, on, band, pct, shortDate, dur } from './../util.js';

export default async function progress(app) {
  const mfst = data.mf();
  const o = srs.overall();
  const hist = await sessionLib.history();
  const weak = srs.weakTopics(3).slice(0, 12);
  const strong = srs.weakTopics(3).slice().reverse().slice(0, 6);

  const modRows = mfst.modules.map(m => {
    const chs = data.chaptersOf(m.id);
    let seen = 0, right = 0, touched = 0, n = 0, due = 0, mastered = 0;
    chs.forEach(c => {
      const s = srs.chapterStats(c.id);
      seen += s.seen; right += s.right; touched += s.cardsSeen; n += c.n; due += s.due; mastered += s.mastered;
    });
    return { m, n, touched, due, mastered, acc: seen ? Math.round(right / seen * 100) : 0, seen };
  });

  app.innerHTML =
    appbar({ title: 'Progress', sub: o.answers + ' answers logged',
             actions: [{ label: 'Home', to: '', title: 'Home' }] }) +

    '<div class="panel">' +
      '<div class="score">' +
        '<div class="big ' + band(o.acc) + '">' + (o.answers ? o.acc + '%' : '—') + '</div>' +
        '<div><div class="mono dim">lifetime accuracy</div>' +
        '<div class="mono dim">' + o.right + ' / ' + o.answers + ' answers</div></div>' +
      '</div>' +
      '<hr class="rule">' +
      '<div class="stats">' +
        '<div class="stat"><div class="v">' + pct(o.touched, mfst.totals.questions) + '%</div><div class="k">Bank seen</div></div>' +
        '<div class="stat"><div class="v">' + o.mastered + '</div><div class="k">Mastered</div></div>' +
        '<div class="stat"><div class="v">' + o.due + '</div><div class="k">Due now</div></div>' +
        '<div class="stat"><div class="v">' + o.flagged + '</div><div class="k">Flagged</div></div>' +
      '</div>' +
      (o.due ? '<div class="row" style="margin-top:12px"><button class="btn sm" data-go="due">Review the ' + o.due + ' due</button></div>' : '') +
    '</div>' +

    '<div class="panel">' +
      '<div class="eyebrow">By module</div>' +
      '<div style="margin-top:8px">' + modRows.map(r =>
        '<button class="chrow" data-mod="' + r.m.id + '">' +
          '<span class="nm"><b>' + esc(r.m.name) + '</b>' +
          (r.due ? ' <span class="badge due">' + r.due + ' due</span>' : '') +
          '<small>' + r.touched + '/' + r.n + ' seen · ' + r.mastered + ' mastered</small></span>' +
          '<span class="mono">' + (r.seen ? r.acc + '%' : '—') + '</span>' +
        '</button>').join('') + '</div>' +
    '</div>' +

    (weak.length ? '<div class="panel">' +
      '<div class="panel-h"><div class="eyebrow">Weakest topics</div>' +
      '<button class="lnk" data-go="weak">drill these</button></div>' +
      '<div class="bars" style="margin-top:8px">' + weak.map(t => topicBar(t)).join('') + '</div>' +
    '</div>' : '') +

    (strong.length && strong[0].acc >= 80 ? '<div class="panel">' +
      '<div class="eyebrow">Solid ground</div>' +
      '<div class="bars" style="margin-top:8px">' + strong.filter(t => t.acc >= 80).map(t => topicBar(t)).join('') + '</div>' +
    '</div>' : '') +

    '<div class="panel">' +
      '<div class="panel-h"><div class="eyebrow">Session history</div>' +
      '<div class="mono dim">' + hist.length + ' sessions</div></div>' +
      (hist.length ? sparkline(hist) + hist.slice(0, 25).map(histRow).join('')
                   : '<div class="empty">No completed sessions yet.</div>') +
    '</div>';

  on(app, '[data-mod]', el => go('module/' + el.getAttribute('data-mod')));
  on(app, '[data-go]', el => {
    const k = el.getAttribute('data-go');
    startSpec(k === 'due' ? { select: 'due', count: 25 } : { select: 'weak', count: 20 });
  });
}

function topicBar(t) {
  const b = band(t.acc);
  const color = b === 'ok' ? 'var(--live)' : b === 'mid' ? 'var(--signal)' : 'var(--miss)';
  const ch = data.chapter(t.ch);
  return '<div class="barrow">' +
    '<span class="lbl">' + esc(t.topic) + ' <span class="dim mono">· ' + esc(ch ? ch.short : '') + '</span></span>' +
    '<span class="pc">' + t.acc + '%</span>' +
    '<span class="bt"><span class="bf" style="width:' + t.acc + '%;background:' + color + '"></span></span>' +
    '</div>';
}

function histRow(h) {
  const b = band(h.percent);
  return '<div class="chrow" style="cursor:default">' +
    '<span class="nm"><b>' + h.n + ' questions</b>' +
    '<small>' + esc(shortDate(h.at)) + ' · ' + esc(h.spec.mode === 'sim' ? 'simulation' : 'practice') +
    ' · ' + dur(h.ms) + '</small></span>' +
    '<span class="mono" style="color:' + (b === 'ok' ? 'var(--live)' : b === 'mid' ? 'var(--signal)' : 'var(--miss)') + '">' +
    h.percent + '%</span></div>';
}

/** Tiny inline trend of the last 20 sessions. */
function sparkline(hist) {
  const rows = hist.slice(0, 20).reverse();
  if (rows.length < 2) return '';
  const w = 320, h = 46, pad = 3;
  const step = (w - pad * 2) / (rows.length - 1);
  const pts = rows.map((r, i) => [pad + i * step, h - pad - (r.percent / 100) * (h - pad * 2)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z';
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="46" role="img" ' +
    'aria-label="Recent session scores" style="display:block;margin:2px 0 10px">' +
    '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + (h - pad - 0.8 * (h - pad * 2)) + '" y2="' + (h - pad - 0.8 * (h - pad * 2)) +
      '" stroke="rgba(169,180,188,0.25)" stroke-dasharray="3 3"/>' +
    '<path d="' + area + '" fill="rgba(240,168,30,0.13)"/>' +
    '<path d="' + d + '" fill="none" stroke="#F0A81E" stroke-width="1.6" stroke-linejoin="round"/>' +
    pts.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.8" fill="#F0A81E"/>').join('') +
    '</svg>';
}
