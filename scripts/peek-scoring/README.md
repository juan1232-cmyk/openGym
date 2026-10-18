# Peek exercise scoring (spec v2)

Ratings for every exercise in `frontend/src/lib/exercises-data.js`, following the Peek exercise
scoring spec (v2). Output: `exercise-ratings.json` (one record per dataset exercise, scores under
`scores`) and `review-low-confidence.md` (the `low` confidence ones, for a human pass).

```bash
node scripts/peek-scoring/build.mjs                  # validate, score, write both files
node scripts/peek-scoring/build.mjs --muscle lats    # also print that muscle's ranking
```

## How the ratings are written

1,324 hand-rated lines would drift, and the spec says consistency beats any single rating, so
the ratings are authored in two layers:

- `archetypes/*.txt` — one line per movement type (barbell bench, cable pushdown, seated
  leg curl…) with its S/L per target, St, P, T, C, study tag, confidence and note. The 19 spec
  anchors are archetypes marked `[anchor]`.
- `assign/*.txt` — one line per dataset exercise: its id, the archetype it is an instance of,
  and adjustments (`St-1`, `P+2`, `conf=low`…) for the spec section 4 rules (unilateral, partial,
  machine vs free weight, unstable surface). `SKIP <reason>` for stretches, mobility, cardio,
  plyometrics, Olympic/ballistic lifts, static skill holds and rehab drills.

`build.mjs` refuses to write output unless: every dataset id is assigned exactly once, every
rating is a whole number 0–10, muscles/equipment/study tags are from the allowed lists, the 19
anchors match spec section 3 exactly, and the section-6 scoring code (`score.mjs`, a port of the
Python) reproduces the spec's check value (67 / 71 / 54).

`exId` is an extra field (not in the spec) holding the dataset id, so these can be joined back to
the app's `RATED` list in `frontend/src/lib/ratings.js`.

## How the app reads these

`node scripts/peek-scoring/pack.mjs` writes `frontend/src/lib/ratings-data.json` — a trimmed copy
(no names, notes or precomputed scores; ~90 KB) that `lib/ratings.js` loads on demand.
**Re-run it whenever `exercise-ratings.json` changes**; `frontend/src/lib/score.test.js` fails if
the two have drifted, and also holds the app's formula to every `scores` value in this file.
