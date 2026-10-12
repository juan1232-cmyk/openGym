import { describe, it, expect } from 'vitest'
import { routeDir } from './transition.js'

describe('routeDir', () => {
  it('follows the tab bar order', () => {
    expect(routeDir('/home', '/plan')).toBe('fwd')
    expect(routeDir('/library', '/stats')).toBe('back')
    expect(routeDir('/home', '/library')).toBe('fwd')
  })
  it('pushes drill-downs and pops back out', () => {
    expect(routeDir('/plan', '/plan/r/abc')).toBe('fwd')
    expect(routeDir('/plan/r/abc', '/plan')).toBe('back')
    expect(routeDir('/stats', '/exercise/squat')).toBe('fwd')
    expect(routeDir('/settings', '/home')).toBe('back')
  })
  it('raises the workout and fades out of it', () => {
    expect(routeDir('/home', '/workout')).toBe('up')
    expect(routeDir('/workout', '/home')).toBe('fade')
  })
  it('fades when there is nothing to compare', () => {
    expect(routeDir(null, '/home')).toBe('fade')
    expect(routeDir('/home', '/home')).toBe('fade')
    expect(routeDir('/', '/home')).toBe('fade')
  })
})
