// ---------------------------------------------------------------
// Settings: defaults, offline caching, backup/restore, reset.
// ---------------------------------------------------------------

import * as store from './../store.js';
import * as srs from './../srs.js';
import * as data from './../data.js';
import { appbar, go } from './../main.js';
import { esc, on, $, toast } from './../util.js';

export default async function settingsView(app) {
  const s = await store.settings();
  const mfst = data.mf();
  const o = srs.overall();

  app.innerHTML =
    appbar({ title: 'Settings', sub: 'v' + mfst.version + ' · built ' + mfst.built,
             actions: [{ label: 'Home', to: '', title: 'Home' }] }) +

    '<div class="panel">' +
      '<div class="eyebrow">Defaults for a new exam</div>' +

      '<div style="margin-top:12px" class="mono dim">Feedback</div>' +
      '<div class="seg" style="margin-top:6px">' +
        '<button class="seg-b' + (s.mode === 'instant' ? ' on' : '') + '" data-set="mode" data-val="instant">Instant</button>' +
        '<button class="seg-b' + (s.mode === 'sim' ? ' on' : '') + '" data-set="mode" data-val="sim">Simulation</button>' +
      '</div>' +

      '<div style="margin-top:14px" class="mono dim">Length</div>' +
      '<div class="seg" style="margin-top:6px">' +
        [10, 20, 30, 50, 100].map(c =>
          '<button class="seg-b' + (s.count === c ? ' on' : '') + '" data-set="count" data-val="' + c + '">' + c + '</button>').join('') +
      '</div>' +

      '<div style="margin-top:14px" class="mono dim">Per-question timer</div>' +
      '<div class="seg" style="margin-top:6px">' +
        [0, 30, 45, 60, 90].map(t =>
          '<button class="seg-b' + (s.timer === t ? ' on' : '') + '" data-set="timer" data-val="' + t + '">' +
          (t ? t + 's' : 'Off') + '</button>').join('') +
      '</div>' +

      '<hr class="rule">' +
      toggle('shuffleOptions', 'Shuffle answer order', s.shuffleOptions,
             'Stops you memorising "the answer is always B".') +
      toggle('showSlides', 'Show source slide link', s.showSlides,
             'Adds a "view slide" link under the explanation where a lecture slide exists.') +
    '</div>' +

    (data.isInline ? '' :
    '<div class="panel">' +
      '<div class="eyebrow">Offline</div>' +
      '<p class="lede" style="margin-top:6px;font-size:14px">Install this to your home screen or desktop and it runs with no signal. ' +
      'Question text caches on first load; slide images cache as you see them.</p>' +
      '<div class="row">' +
        '<button class="btn ghost sm" id="precache">Download everything for offline</button>' +
        '<span class="mono dim" id="cachestat"></span>' +
      '</div>' +
    '</div>') +

    '<div class="panel">' +
      '<div class="eyebrow">Your progress</div>' +
      '<div class="stats" style="margin-top:10px">' +
        '<div class="stat"><div class="v">' + o.answers + '</div><div class="k">Answers</div></div>' +
        '<div class="stat"><div class="v">' + o.touched + '</div><div class="k">Questions seen</div></div>' +
        '<div class="stat"><div class="v">' + o.flagged + '</div><div class="k">Flagged</div></div>' +
      '</div>' +
      '<p class="lede" style="margin:12px 0 8px;font-size:14px">Progress lives on this device only. ' +
      'Back it up to move it to your phone or a new computer.</p>' +
      '<div class="row">' +
        '<button class="btn ghost sm" id="export">' +
          (data.isInline ? 'Copy backup' : 'Export backup') + '</button>' +
        '<button class="btn ghost sm" id="importbtn">' +
          (data.isInline ? 'Paste backup' : 'Restore backup') + '</button>' +
        '<input type="file" id="importfile" accept="application/json" class="hid">' +
      '</div>' +
      '<hr class="rule">' +
      '<button class="btn ghost sm" id="reset" style="border-color:var(--miss);color:var(--miss)">Erase all progress</button>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="eyebrow">Bank</div>' +
      '<div class="mono dim" style="margin-top:8px">' +
        mfst.totals.questions + ' questions · ' + mfst.totals.mc + ' multiple choice · ' +
        mfst.totals.match + ' matching · ' + mfst.totals.slides + ' slides' +
      '</div>' +
      '<div style="margin-top:8px">' + mfst.modules.map(m =>
        '<div class="chrow" style="cursor:default"><span class="nm"><b>' + esc(m.label) + ' — ' + esc(m.name) + '</b>' +
        '<small>' + data.chaptersOf(m.id).length + ' chapters · ' +
        data.chaptersOf(m.id).reduce((a, c) => a + c.n, 0) + ' questions</small></span></div>').join('') +
      '</div>' +
    '</div>';

  on(app, '[data-set]', async el => {
    const k = el.getAttribute('data-set');
    let v = el.getAttribute('data-val');
    if (k === 'count' || k === 'timer') v = Number(v);
    await store.saveSettings({ [k]: v });
    settingsView(app);
  });

  on(app, '[data-toggle]', async el => {
    const k = el.getAttribute('data-toggle');
    const cur = (await store.settings())[k];
    await store.saveSettings({ [k]: !cur });
    settingsView(app);
  });

  on(app, '#export', async () => {
    const blob = await store.exportAll();
    const text = JSON.stringify(blob);
    // The shared-link build runs in a sandbox that blocks file saves, so there
    // the backup goes to the clipboard instead.
    if (data.isInline) {
      try {
        await navigator.clipboard.writeText(text);
        toast('Backup copied — paste it somewhere safe.');
      } catch (e) {
        prompt('Copy this backup text:', text);
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paramedic-exam-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  on(app, '#importbtn', async () => {
    if (data.isInline) {
      const text = prompt('Paste a backup here:');
      if (!text) return;
      try {
        await store.importAll(JSON.parse(text));
        await srs.ready();
        location.reload();
      } catch (e) { toast('That did not look like a backup.'); }
      return;
    }
    $('#importfile', app).click();
  });
  $('#importfile', app).addEventListener('change', async ev => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      await store.importAll(JSON.parse(txt));
      await srs.ready();
      toast('Progress restored.');
      location.reload();
    } catch (e) { toast(e.message || 'Could not read that file.'); }
  });

  on(app, '#reset', async () => {
    if (!confirm('Erase every answer, flag and session on this device? This cannot be undone.')) return;
    await srs.resetAll();
    toast('Progress erased.');
    location.reload();
  });

  on(app, '#precache', async () => {
    const stat = $('#cachestat', app);
    if (!('caches' in window)) { toast('This browser cannot pre-download.'); return; }
    stat.textContent = 'downloading…';
    try {
      const urls = mfst.chapters.map(c => 'data/bank/' + c.id + '.json')
        .concat(['data/meds.json', 'data/acronyms.json']);
      const cache = await caches.open('pmx-data-v1');
      await cache.addAll(urls);
      // slides, batched so a slow connection doesn't stall
      const all = await data.loadEverything();
      const media = Array.from(new Set(all.flatMap(q => [q.slide, q.img].filter(Boolean)).map(f => 'media/' + f)));
      const mcache = await caches.open('pmx-media-v1');
      for (let i = 0; i < media.length; i += 25) {
        await mcache.addAll(media.slice(i, i + 25)).catch(() => {});
        stat.textContent = Math.min(media.length, i + 25) + ' / ' + media.length + ' slides';
      }
      stat.textContent = 'ready offline';
      toast('Everything cached — works with no signal now.');
    } catch (e) {
      stat.textContent = '';
      toast('Could not finish the download.');
    }
  });
}

function toggle(key, label, on, help) {
  return '<div class="spread" style="margin-top:10px">' +
    '<div style="flex:1;min-width:180px"><div style="font-size:15px">' + esc(label) + '</div>' +
    '<div class="dim" style="font-size:12.5px">' + esc(help) + '</div></div>' +
    '<button class="chip' + (on ? ' on' : '') + '" data-toggle="' + esc(key) + '">' +
    (on ? 'On' : 'Off') + '</button></div>';
}
