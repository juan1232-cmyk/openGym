# Phone preview

The real openGym app, bundled into one HTML page that runs as a private claude.ai artifact —
so the app can be tried on a phone without a server. It is published to
**https://claude.ai/artifact/AdSeA3KF27jCJCVkAUnD9Z** and republished after every change
(see CLAUDE.md, "Preview on the phone").

```bash
cd frontend && npm run preview:page     # → tools/preview/out/peek-preview.html
```

## What's in it

- The whole app (every tab, sheet and screen) from `frontend/src`, unchanged, in **guest mode**:
  everything lives in the viewer's browser storage and nothing is sent anywhere. The API calls
  it would make to a server fail quietly, which guest mode is built to survive.
- **Example data** (`scenarios.js`): the app's own 6-day starter plan, six weeks of history on
  it with stepwise progression and a few skipped days, body weight, and a Peek bond of 30.
  Dates are relative to today, so it always looks current.
- A **Preview** button (top centre, only in this build) with situations — regular week,
  PR today, back after a week, late night (the clock is moved to 02:14), brand new — a bond
  stage switcher for Peek, and "start this situation over".

## How it's built

| File | Why |
|---|---|
| `clock.js` | imported first: shifts `Date` for the late-night situation |
| `boot.js` | imported before the app: seeds the first visit (the store reads storage as it loads) |
| `entry.jsx` | mounts the real `App` plus the Preview menu |
| `preview.css` | the menu, and hides exercise GIFs — their media server doesn't exist here |
| `vite.config.mjs` | builds with the frontend's own dependencies, as one chunk |
| `inline.mjs` | folds the build into one HTML file (the artifact host adds `<html>`/`<body>`) |

Bump `VERSION` in `boot.js` when `scenarios.js` changes, so returning viewers get the new
example data instead of their old copy.
