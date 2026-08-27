# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## What this is

A self-hosted gym & bodyweight tracker (React + Node), forked to become a personal project —
diverging on purpose, not tracking upstream for PRs. `origin` is
`juan1232-cmyk/openGym`; `upstream` is `arvids-unavailable/openGym`, kept only as a reference
for pulling in upstream fixes/features, not for sending PRs back.

**Provenance, read once so it doesn't get re-investigated:** every doc in this repo (README,
CONTRIBUTING, the in-app "source code" link) points to `github.com/DuarteSantos8/openGym` as the
canonical origin. That account no longer resolves on GitHub (confirmed 404 as of 2026-08-24).
The actual active repo — real issues, 737 forks, 3.8k stars — is `arvids-unavailable/openGym`,
which GitHub's API reports as *not* a fork of anything (`parent: null`), despite the docs'
claimed lineage. Likely explanation: the original account was renamed or deleted and this is
what's left standing. The issue tracker's activity looks organic (distinct users, specific
technically-plausible requests, same-day timestamps) and the code itself is clean — no telemetry,
no unexpected outbound calls, verified by grepping `api/server.js` and `frontend/src` for
`fetch`/`http(s)://`/`eval`/`child_process` and finding only the dead DuarteSantos8 link and the
documented calls (own `/api`, the exercise-media host). Treat this as "dead link," not as a
reason to distrust the code.

## Commands

No Docker on this machine yet — develop against plain Node:

```bash
cd api && npm install && npm start          # backend on :3000 (DATA_DIR defaults to /data;
                                             # override for local dev, e.g. DATA_DIR=./data)
cd frontend && npm install && npm run dev   # Vite on :5173, proxies /api -> :3000 (vite.config.js)
cd frontend && npm test                     # vitest — training logic only (src/lib/*.test.js)
```

Full stack (needs Docker — not installed as of 2026-08-24):
```bash
cp .env.example .env
docker compose up -d --build
```

`frontend/vite.config.js` also proxies `/img` and `/gif` to `MEDIA_TARGET` (default
`:8888`) — those 404 in plain `npm run dev` unless something's serving `media/` locally, since
that's normally the `media` compose service downloading the ~140MB exercise dataset. Exercise
list/text still works without it; only images/GIFs are missing.

## Architecture

**One build target, self-hosted only.** Upstream also had a `VITE_DEMO=1` GitHub Pages demo
build and a `VITE_MOBILE=1` Capacitor native-app build (own persistence, no backend, no sync) —
both stripped from this fork: the demo served a public audience this private repo doesn't have,
and the mobile build's whole reason to exist (zero server, single device) works against the
sync-across-devices goal this fork is actually for. The app is a PWA instead (`frontend/public/
manifest.json` + `sw.js`, registered in `main.jsx`) — add-to-homescreen from your self-hosted
instance, no separate build. Guest mode (no passkey, localStorage-only) still exists and is the
fallback for a browser without WebAuthn support, not a dedicated build mode.

**State is one Zustand store, one blob.** `frontend/src/store/useStore.js` holds the entire app
state under a single key `S` — every mutation goes through `update(mut)`, which clones, mutates,
writes to `localStorage`, and (if signed in) debounces a `PUT /api/data` 1.5s later.
`pullState()` on boot reconciles by a `_ts` timestamp against a `gym_dirty` flag, so an offline
edit never gets silently overwritten by a stale server copy. `useUI.js` is the separate,
non-persisted store for sheet/modal/toast state.

**Backend has no framework, no database.** `api/server.js` hand-rolls HTTP routing over
`node:http`, does WebAuthn via `@simplewebauthn/server`, and stores everything as JSON files
under `DATA_DIR`: `db.json` (users + public passkey credentials), `state-<uid>.json` per user,
`secret` (session-cookie signing key), `vapid.json` (Web Push keys). **`secret` and
`vapid.json` are generated on first run if missing (server.js:35, server.js:58-59) — never
commit real ones.** `data/` is gitignored; if it ever isn't, that's a bug, not a config choice
(see git history: the fork this was forked from had committed a live secret + VAPID key +
a real user's passkey credential — removed in this fork's first PR).

**Training logic lives in pure functions, deliberately kept out of components.**
`frontend/src/lib/progression.js` (linear / Greyskull LP / double progression / stalls +
deloads), `onerm.js` (1RM estimation), `history.js`, `effort.js` — each has a `*.test.js`
beside it. Per `CONTRIBUTING.md`, this split exists because the progression engine grew two real
bugs that only a test caught; clicking through the UI doesn't exercise the arithmetic.

**Docker Compose has three services**, not two: `media` (one-time `git clone` of the exercise
dataset into a shared volume, skipped if already populated), `api`, and `web` (nginx —
multi-stage build of `frontend/`, serves it, and proxies `/api` to `api` so passkeys see a
single origin). `web/nginx.conf` is the proxy config; `nginx.conf` at the repo root is unused
by compose (check before editing the wrong one).

## Conventions

- **Dependency-light on purpose** (`CONTRIBUTING.md`): frontend is React + Router + Zustand and
  nothing else; `api/` has two deps total. A new dependency needs a real reason.
- Comments explain *why*, not *what* — match that density rather than narrating obvious lines.
- State mutations go through the store's `update()`, not ad-hoc `localStorage` writes, or the
  debounced server push silently stops firing.
- Any change to progression/1RM/session-reading logic needs a test in `frontend/src/lib/`
  alongside a manual click-through — tests catch what clicking can't, per `CONTRIBUTING.md`.
- Since this fork isn't syncing back upstream: it's fine to rename/restructure things that
  upstream's PR-compatibility would otherwise constrain, but note *why* in the commit body when
  diverging from something upstream did deliberately (there's usually a reason in a comment).
- AGPL-3.0: running a modified version as a network service others use requires publishing that
  version's source. Purely personal, single-user self-hosting doesn't trigger this.
