// ---------------------------------------------------------------
// Router + boot.
// Routes are hash based so the app works from a file:// folder,
// a static host, or an installed home-screen icon identically.
// ---------------------------------------------------------------

import * as data from './data.js';
import * as srs from './srs.js';
import * as store from './store.js';
import * as sessionLib from './session.js';
import { $, esc, toast } from './util.js';

import home from './views/home.js';
import buildView from './views/build.js';
import quiz from './views/quiz.js';
import results from './views/results.js';
import progress from './views/progress.js';
import reference from './views/reference.js';
import settingsView from './views/settings.js';

const routes = {
  '': home,
  'home': home,
  'module': home,          // module/:id
  'build': buildView,      // build/:moduleId? or build/ch/:chapterId
  'quiz': quiz,
  'results': results,      // results/:sessionId?
  'progress': progress,
  'reference': reference,  // reference/meds | reference/acronyms
  'settings': settingsView
};

export const ctx = {
  session: null,       // live session while a quiz is running
  lastResult: null     // finished session kept in memory for the results screen
};

export function go(path) {
  const target = '#/' + String(path).replace(/^#?\/?/, '');
  if (location.hash === target) render();
  else location.hash = target;
}

export function parts() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

let rendering = false;

export async function render() {
  if (rendering) return;
  rendering = true;
  const app = $('#app');
  const p = parts();
  const view = routes[p[0] || ''] || home;
  try {
    await view(app, p.slice(1));
  } catch (e) {
    console.error(e);
    app.innerHTML =
      '<div class="panel"><div class="eyebrow">Something broke</div>' +
      '<h2>Could not open that screen</h2>' +
      '<p class="lede">' + esc(e && e.message ? e.message : String(e)) + '</p>' +
      '<button class="btn ghost" onclick="location.hash=\'#/\'">Back to start</button></div>';
  } finally {
    rendering = false;
  }
  if (!p.length || p[0] === 'home') window.scrollTo(0, 0);
}

export function appbar(opts) {
  const o = opts || {};
  const back = o.back
    ? '<button class="iconbtn" data-nav="' + esc(o.back) + '" title="Back">‹</button>'
    : '';
  const right = (o.actions || []).map(a =>
    '<button class="iconbtn" data-nav="' + esc(a.to || '') + '"' +
    (a.id ? ' id="' + esc(a.id) + '"' : '') + ' title="' + esc(a.title || a.label) + '">' +
    esc(a.label) + '</button>').join('');
  return '<div class="appbar">' + back +
    '<div class="grow"><div class="ttl">' + esc(o.title || 'Paramedic Exam Suite') + '</div>' +
    (o.sub ? '<div class="sub">' + esc(o.sub) + '</div>' : '') +
    '</div>' + right + '</div>';
}

// Global delegated navigation: any element with data-nav="path".
document.addEventListener('click', ev => {
  const el = ev.target.closest && ev.target.closest('[data-nav]');
  if (!el) return;
  const to = el.getAttribute('data-nav');
  if (to === null || to === '') return;
  ev.preventDefault();
  go(to);
});

window.addEventListener('hashchange', render);

// Warn before a refresh eats an in-progress exam.
window.addEventListener('beforeunload', ev => {
  if (ctx.session && !ctx.session.endedAt && ctx.session.answers.some(a => a)) {
    sessionLib.saveCurrent(ctx.session);
  }
  srs.flush();
});

async function boot() {
  const app = $('#app');
  app.innerHTML = '<div class="empty">Loading question bank…</div>';
  try {
    await data.loadManifest();
    await srs.ready();
    await store.settings();
    const resume = await sessionLib.loadCurrent();
    if (resume && resume.questions && !resume.endedAt) ctx.session = resume;
  } catch (e) {
    app.innerHTML = '<div class="panel"><div class="eyebrow">Offline data missing</div>' +
      '<h2>Could not load the question bank</h2>' +
      '<p class="lede">' + esc(e.message) + '</p>' +
      '<p class="dim">If you opened this by double-clicking index.html, use the included ' +
      '<span class="mono">start-app</span> launcher instead — browsers block local data files ' +
      'when a page is opened straight off the disk.</p></div>';
    return;
  }
  await render();
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.addEventListener('DOMContentLoaded', boot);

// Expose a couple of things for the settings screen's import/export.
window.__pmx = { store, srs, data, sessionLib, go, toast };
