// ---------------------------------------------------------------
// Reference: searchable drug cards and an acronym index.
// Read-only lookup — no flashcard mode, by request.
// ---------------------------------------------------------------

import * as data from './../data.js';
import { appbar, go } from './../main.js';
import { esc, on, $, normStr } from './../util.js';

let q = '';
let openId = null;
let tab = 'field';

export default async function reference(app, args) {
  const which = args[0] === 'acronyms' ? 'acronyms' : 'meds';
  if (which === 'acronyms') return acronyms(app);
  return meds(app);
}

// ---------------- drugs ----------------

async function meds(app) {
  const M = await data.loadMeds();
  const needle = normStr(q);

  const field = M.field.filter(d => !needle || normStr(
    d.drug + ' ' + d.generic + ' ' + d.brand + ' ' + d.classification + ' ' + d.indications).includes(needle));
  const home = M.home.filter(d => !needle || normStr(
    d.generic + ' ' + (d.brands || []).join(' ') + ' ' + d.purpose + ' ' + d.catDisp).includes(needle));

  app.innerHTML =
    appbar({ title: 'Drug reference', sub: M.field.length + ' field drugs · ' + M.home.length + ' home meds',
             actions: [{ label: 'Home', to: '', title: 'Home' }] }) +

    '<div class="panel tight">' +
      '<input id="q" type="search" placeholder="Search drug, class, indication…" value="' + esc(q) + '" ' +
      'style="width:100%;background:var(--ink-3);border:1px solid var(--rule);border-radius:4px;' +
      'color:var(--paper);font:inherit;font-size:16px;padding:10px 12px;min-height:44px">' +
    '</div>' +

    '<div class="seg" style="margin-bottom:12px">' +
      '<button class="seg-b' + (tab === 'field' ? ' on' : '') + '" data-tab="field">Field drugs · ' + field.length + '</button>' +
      '<button class="seg-b' + (tab === 'home' ? ' on' : '') + '" data-tab="home">Home meds · ' + home.length + '</button>' +
    '</div>' +

    (tab === 'field'
      ? (field.length ? field.map(fieldCard).join('') : '<div class="empty">No drug matches that.</div>')
      : (home.length ? homeTable(home) : '<div class="empty">No medication matches that.</div>'));

  const input = $('#q', app);
  input.addEventListener('input', () => {
    q = input.value;
    const pos = input.selectionStart;
    meds(app).then(() => {
      const el = $('#q', app);
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
    });
  });
  on(app, '[data-tab]', el => { tab = el.getAttribute('data-tab'); meds(app); });
  on(app, '[data-drug]', el => {
    const id = el.getAttribute('data-drug');
    openId = openId === id ? null : id;
    meds(app);
  });
}

function fieldCard(d) {
  const open = openId === d.drug;
  const timing = [d.onset ? 'onset ' + d.onset : '', d.duration ? 'lasts ' + d.duration : '']
    .filter(Boolean).join(' · ');
  return '<div class="drugcard' + (open ? ' open' : '') + '">' +
    '<button class="drughead" data-drug="' + esc(d.drug) + '">' +
      '<span class="dh-main">' +
        '<span class="dh-name">' + esc(d.drug) + '</span>' +
        '<span class="dh-sub mono">' + esc(d.brand || d.generic) + '</span>' +
      '</span>' +
      '<span class="badge">' + esc(d['class']) + '</span>' +
    '</button>' +
    (open
      ? '<div class="drugbody">' +
          (timing ? '<div class="mono dim" style="margin-bottom:10px">' + esc(timing) + '</div>' : '') +
          doseBlock(d.doses) +
          list('Indications', d.indications) +
          list('Contraindications', d.contraindications, 'miss') +
          row('Classification', d.classification) +
          row('Action', d.action) +
          list('Adverse effects', d.adverse) +
          row('How supplied', d.supplied) +
          row('Precautions', d.precautions) +
          row('Special considerations', d.notes) +
          (d.generic && d.generic !== d.drug ? row('Generic', d.generic) : '') +
        '</div>'
      : '<div class="drugpeek">' + esc(firstClause(d.indications)) + '</div>') +
    '</div>';
}

function firstClause(s) {
  const parts = String(s || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
  const head = parts.slice(0, 3).join(' · ');
  return head + (parts.length > 3 ? ' · +' + (parts.length - 3) + ' more' : '');
}

/** Dosing is the reason to open a drug card, so it leads. */
function doseBlock(doses) {
  if (!doses || !doses.length) return '';
  const groups = [];
  doses.forEach(x => {
    const g = groups.find(y => y.who === x.who);
    (g || groups[groups.push({ who: x.who, rows: [] }) - 1]).rows.push(x);
  });
  return '<div class="doses">' + groups.map(g =>
    '<div class="dosegroup">' +
      '<div class="dosewho">' + esc(g.who) + '</div>' +
      g.rows.map(x =>
        '<div class="dose">' +
          '<div class="dose-l">' + esc(x.label) + '</div>' +
          '<div class="dose-v">' + esc(x.dose) + '</div>' +
        '</div>').join('') +
    '</div>').join('') + '</div>';
}

/** Semicolon-separated source text renders better as a list than a paragraph. */
function list(k, v, tone) {
  if (!v) return '';
  const items = String(v).split(/;\s*/).map(x => x.trim()).filter(Boolean);
  if (items.length < 2) return row(k, v);
  return '<div class="drow">' +
    '<div class="dk">' + esc(k) + '</div>' +
    '<ul class="dlist' + (tone ? ' ' + tone : '') + '">' +
      items.map(x => '<li>' + esc(x) + '</li>').join('') +
    '</ul></div>';
}

function row(k, v) {
  if (!v) return '';
  return '<div class="drow">' +
    '<div class="dk">' + esc(k) + '</div>' +
    '<div class="dv">' + esc(v) + '</div></div>';
}

function homeTable(rows) {
  const byCat = new Map();
  rows.forEach(r => {
    const k = r.catDisp || r.cat || 'Other';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(r);
  });
  return Array.from(byCat.entries()).map(([cat, list]) =>
    '<div class="panel">' +
      '<div class="eyebrow">' + esc(cat) + '</div>' +
      list.map(r => '<div class="chrow" style="cursor:default">' +
        '<span class="nm"><b>' + esc(r.generic) + '</b>' +
        '<small>' + esc((r.brands || []).join(', ')) + '</small></span>' +
        '<span class="dim" style="font-size:13px;max-width:46%;text-align:right">' + esc(r.purpose) + '</span>' +
      '</div>').join('') +
    '</div>').join('');
}

// ---------------- acronyms ----------------

async function acronyms(app) {
  const A = await data.loadAcronyms();
  const needle = normStr(q);
  const list = A.acros.filter(a => !needle ||
    normStr(a.ac + ' ' + a.name + ' ' + a.subject + ' ' + a.letters.map(l => l[1]).join(' ')).includes(needle));

  const bySubject = new Map();
  list.forEach(a => {
    if (!bySubject.has(a.subject)) bySubject.set(a.subject, []);
    bySubject.get(a.subject).push(a);
  });

  app.innerHTML =
    appbar({ title: 'Acronyms', sub: A.acros.length + ' mnemonics',
             actions: [{ label: 'Home', to: '', title: 'Home' }] }) +

    '<div class="panel tight">' +
      '<input id="q" type="search" placeholder="Search acronym or meaning…" value="' + esc(q) + '" ' +
      'style="width:100%;background:var(--ink-3);border:1px solid var(--rule);border-radius:4px;' +
      'color:var(--paper);font:inherit;font-size:16px;padding:10px 12px;min-height:44px">' +
    '</div>' +

    (list.length ? Array.from(bySubject.entries()).map(([sub, items]) =>
      '<div class="panel">' +
        '<div class="eyebrow">' + esc(sub) + '</div>' +
        items.map(acroCard).join('') +
      '</div>').join('')
      : '<div class="empty">No acronym matches that.</div>');

  const input = $('#q', app);
  input.addEventListener('input', () => {
    q = input.value;
    const pos = input.selectionStart;
    acronyms(app).then(() => {
      const el = $('#q', app);
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
    });
  });
  on(app, '[data-acro]', el => {
    const id = el.getAttribute('data-acro');
    openId = openId === id ? null : id;
    acronyms(app);
  });
}

function acroCard(a) {
  const open = openId === a.ac;
  return '<div style="border-bottom:1px solid var(--rule);padding:10px 0">' +
    '<button data-acro="' + esc(a.ac) + '" style="all:unset;cursor:pointer;display:block;width:100%">' +
      '<div class="spread">' +
        '<div><b style="font-family:var(--f-disp);font-size:19px;letter-spacing:.06em">' + esc(a.ac) + '</b>' +
        '<div class="dim" style="font-size:13px">' + esc(a.name) + '</div></div>' +
        '<span class="dim">' + (open ? '▴' : '▾') + '</span>' +
      '</div>' +
    '</button>' +
    (open ? '<div style="margin-top:8px">' +
      a.letters.map(l => '<div style="display:flex;gap:10px;margin-bottom:4px">' +
        '<span class="mono" style="color:var(--signal);width:18px;flex:none">' + esc(l[0]) + '</span>' +
        '<span style="font-size:14.5px">' + esc(l[1]) + '</span></div>').join('') +
      (a.info ? '<p class="lede" style="font-size:13.5px;margin-top:8px">' + esc(a.info) + '</p>' : '') +
      '</div>' : '') +
    '</div>';
}
