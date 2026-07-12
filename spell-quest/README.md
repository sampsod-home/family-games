# Spell Quest

Letterland spelling flash card PWA for a 2nd grader — hears a word (parent-recorded MP3), types it, gets instant feedback. Mastery (2 first-try correct answers per word) persists in localStorage. Built from the design handoff in `../design_handoff_spell_quest/`.

## Run locally

Any static file server works, e.g.:

```sh
python3 -m http.server 8642 --directory app
```

Then open http://localhost:8642.

## Deploy

Copy the whole `app/` folder to any static host (Netlify, GitHub Pages, a home server…). HTTPS (or localhost) is required for the service worker / offline support and for "Add to Home Screen" on iPad.

## Structure

- `index.html` / `styles.css` / `app.js` — the whole app, no build step
- `word-list.json` — 34 Letterland units (source of truth for words)
- `audio/words/*.mp3` — parent-recorded word audio; filename = word lowercased, apostrophes stripped (`can't` → `cant.mp3`). Missing files fall back to speech synthesis
- `sw.js` — offline cache: network-first for app files, cache-first for audio/fonts
- `manifest.webmanifest` + `icons/` — installable PWA metadata
