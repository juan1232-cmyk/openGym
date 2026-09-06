import { describe, it, expect } from 'vitest'
import { insetFrom } from './keyboard.js'

// The bar this feeds sits on top of the keyboard. Get the arithmetic wrong in the safe
// direction and it floats in the middle of the screen; get it wrong the other way and it is
// underneath the keyboard, invisible, for the whole session. Neither shows up in a click-through
// on a desktop browser, where there is no keyboard and visualViewport never moves.
const vv = (height, offsetTop = 0) => ({ height, offsetTop })

describe('insetFrom', () => {
  it('reports the strip the keyboard covers', () => {
    expect(insetFrom(vv(508), 844)).toBe(336)
  })

  it('is zero with no keyboard up', () => {
    expect(insetFrom(vv(844), 844)).toBe(0)
  })

  it('ignores the URL bar collapsing', () => {
    // Safari hands back ~80px when the address bar shrinks on scroll. That is not a keyboard,
    // and treating it as one parks the bar over the last set row for the whole workout.
    expect(insetFrom(vv(764), 844)).toBe(0)
  })

  // iOS scrolls the page *inside* the visual viewport to lift a focused field above the
  // keyboard. offsetTop then covers part of the gap, and counting it twice put the bar
  // that many pixels too high.
  it('accounts for the viewport being scrolled to reveal the field', () => {
    expect(insetFrom(vv(508, 120), 844)).toBe(216)
  })

  it('is zero where visualViewport is unsupported', () => {
    expect(insetFrom(undefined, 844)).toBe(0)
  })
})
