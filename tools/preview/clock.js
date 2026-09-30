// Imported first, before the app: lets the preview's "Late night" situation move the clock.
// A Date subclass shifted by a stored offset — only this build has it; the app is unchanged.
let off = 0
try { off = Number(sessionStorage.getItem('pv_clock') || 0) } catch { /* storage blocked */ }
if (off) {
  const Real = Date
  class Shifted extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + off) }
    static now() { return Real.now() + off }
  }
  globalThis.Date = Shifted
}
export const clockShifted = !!off
