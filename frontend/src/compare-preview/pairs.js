// The exercise pairs the compare preview (compare.html) opens on — one of each case the sheet
// has to handle, so a review sees every verdict without hunting for examples. pairs.test.js
// holds each to the case it claims, so a ratings update that changes one shows up there.
//   a: the exercise whose page Compare was opened from (and the one Swap replaces)
//   b: the alternative it is compared with
export const PAIRS = [
  { a: '0201', b: '0194', label: 'Pushdown vs overhead extension', kind: 'studied', expect: 'b' },
  { a: '0586', b: '0599', label: 'Lying vs seated leg curl', kind: 'studied', expect: 'b' },
  { a: '0025', b: '0227', label: 'Bench press vs cable fly', kind: 'formula', expect: 'b' },
  { a: '0334', b: '0178', label: 'Dumbbell vs cable lateral raise', kind: 'formula', expect: 'b' },
  { a: '0025', b: '0577', label: 'Bench press vs chest press', kind: 'same', expect: null },
  { a: '1326', b: '0139', muscle: 'biceps', label: 'Chin-up vs narrow pull-up, for biceps', kind: 'same', expect: null }
]
