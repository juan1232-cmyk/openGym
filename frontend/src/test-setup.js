// The ratings table loads on demand in the app (lib/ratings.js); tests that touch scores, main
// lifts or the picker badge want it already in. The tests of the "not loaded yet" behaviour
// call setRatings(null) themselves.
import { loadRatings } from './lib/ratings.js'

await loadRatings()
