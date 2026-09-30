// Runs before the app's modules (the store reads localStorage as it loads): on a first visit,
// or after a preview update that changed the example data, start on the regular week.
import { SCENARIOS } from './scenarios.js'
import { seed } from './PreviewMenu.jsx'

const VERSION = '1'
let fresh = true
try { fresh = localStorage.getItem('pv_version') !== VERSION || !localStorage.getItem('pv_scenario') } catch { fresh = false }
if (fresh) {
  try { localStorage.clear(); localStorage.setItem('pv_version', VERSION) } catch { /* */ }
  seed(SCENARIOS[0])
}
