# Paramedic Exam Suite

1,084 practice questions across Modules 1–3, plus a drug and acronym reference.
Runs in any modern browser, installs to a phone home screen or a desktop taskbar,
and works with no signal once it has loaded.

---

## Running it

### On your own computer, right now

The app loads its question banks as separate files, and browsers refuse to read
those when a page is opened straight off the disk. So it needs a local server —
one command, nothing to install:

**Windows (PowerShell), from inside this folder:**

```
py -m http.server 8080
```

Then open <http://localhost:8080> . Press Ctrl+C in the terminal to stop it.

If `py` isn't recognised, `python -m http.server 8080` works too. Node users can
run `npx serve .` instead.

### Putting it online for your class

Any static host will do — no server code, no database, nothing to configure.

- **Cloudflare Pages** or **Netlify**: create a project and drag this whole folder
  onto the upload area. You get a URL in under a minute, and both are free at
  this size.
- **GitHub Pages**: push the folder to a repo, then Settings → Pages → deploy
  from the `main` branch. Note the ~1 GB repo cap; this app is about 15 MB.

Send classmates the URL. On iPhone they open it in Safari and tap
Share → **Add to Home Screen**; on Android, Chrome's menu → **Install app**;
on desktop, the install icon in the address bar. After that it opens like any
other app, offline included.

---

## What's inside

```
index.html              entry point
manifest.webmanifest    makes it installable
sw.js                   service worker — offline caching
css/app.css             all styling
js/                     application code (ES modules, no build step)
  main.js                 router and boot
  data.js                 manifest + lazy chapter loading
  store.js                IndexedDB persistence, with a localStorage fallback
  srs.js                  spaced repetition and per-question stats
  session.js              exam construction, grading, scoring
  views/                  one file per screen
data/
  manifest.json           module/chapter index — loaded at startup
  bank/<chapter>.json     questions, fetched only when that chapter is used
  meds.json               drug reference
  acronyms.json           mnemonic index
media/                  417 lecture slides, loaded on demand
icons/                  app icons
```

Nothing is bundled or minified, so every file is readable and editable as-is.

## Where your progress lives

In your browser, on that device — IndexedDB, with localStorage as a fallback.
Nothing is uploaded anywhere and nothing is shared between devices automatically.
Settings → **Export backup** writes a JSON file you can restore on another
device with **Restore backup**.

Clearing site data in your browser erases it, so export before you do that.

## Adding or changing questions

Question banks are plain JSON under `data/bank/`. One question looks like this:

```json
{
  "id": "qb1c2d3e4f5a6",
  "type": "mc",
  "ch": "m2c01",
  "topic": "Airway anatomy",
  "ref": "Airway Mgmt p.1",
  "stem": "Where does the larynx sit relative to the pharynx?",
  "options": [
    { "t": "Below the trachea, at the carina",
      "why": "The carina is far below the larynx, at the tracheal bifurcation." },
    { "t": "Where the upper airway ends and the lower airway begins", "why": "" }
  ],
  "answer": 1,
  "why": "The larynx is the anatomic boundary — upper airway structures end there.",
  "slide": "3f2a....jpg"
}
```

- `why` on the correct option stays empty; each wrong option carries its own
  reason it's wrong.
- `answer` is an index into `options`.
- `slide` and `img` are filenames in `media/`. `slide` backs the "view slide"
  link; `img` shows above the question, for diagram-identification items.
- Matching questions use `"type": "match"` with `pairs`, `lcap` and `rcap`
  instead of `options`/`answer`.
- `fam` marks near-identical parallel questions so no two of them land in the
  same exam.

If you add questions to a chapter, bump that chapter's `n` in
`data/manifest.json` and add any new topic to its `topics` list.
