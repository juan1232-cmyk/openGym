import { describe, it, expect } from 'vitest'
import { PROGRAMS } from './programs.js'
import { parsePlan, mergePlan } from './plan-share.js'
import { EXIDX, registerCustom } from './exercises.js'
import { modeOf, repRangeOf } from './history.js'
import { policyFor } from './progression.js'

const fresh = () => ({ routines: [], week: {}, customEx: [] })

describe.each(PROGRAMS.map(p => [p.name, p]))('%s', (_, prog) => {
  it('imports every exercise — none dropped as unknown', () => {
    const b = parsePlan(JSON.stringify(prog))
    expect(b.dropped).toBe(0)
    expect(b.exerciseCount).toBe(prog.routines.reduce((n, r) => n + r.ex.length, 0))
  })

  it('schedules only routines it carries, never Sunday', () => {
    Object.values(prog.week).forEach(id => expect(prog.routines.some(r => r.id === id)).toBe(true))
    expect(prog.week[0]).toBeUndefined()
  })

  it('pairs every superset with its neighbour', () => {
    prog.routines.forEach(r => r.ex.forEach((e, i) => {
      if (e.sg) expect(r.ex[i - 1]?.sg === e.sg || r.ex[i + 1]?.sg === e.sg).toBe(true)
    }))
  })

  it('gives every lift a real rep range and a progression that applies to how it is logged', () => {
    const s = fresh()
    mergePlan(s, parsePlan(prog), { schedule: true })
    registerCustom(s.customEx)
    try {
      s.routines.forEach(r => r.ex.forEach(e => {
        expect(EXIDX[e.id]).toBeTruthy()
        const mode = modeOf(e)
        if (mode === 'reps') {
          const { lo, hi } = repRangeOf(e)
          expect(lo).toBeLessThan(hi)
          expect(policyFor(e, r, mode)).toBe('double')
        }
        if (e.mode === 'time') expect(mode).toBe('time')
        if (e.min != null) expect(mode).toBe('cardio')
      }))
    } finally { registerCustom([]) }
  })

  it('lands its custom exercises as editable customs, and its week on the new routines', () => {
    const s = fresh()
    mergePlan(s, parsePlan(prog), { schedule: true })
    expect(s.customEx).toHaveLength(prog.customEx.length)
    s.customEx.forEach(c => expect(c).toMatchObject({ custom: true, eq: 'custom' }))
    Object.values(s.week).forEach(id => expect(s.routines.some(r => r.id === id)).toBe(true))
    expect(Object.keys(s.week)).toHaveLength(Object.keys(prog.week).length)
  })

  it('replaces the onboarding\'s training days along with the week, so no rest day reads as an empty training day', () => {
    const s = { ...fresh(), week: { 3: 'old', 4: 'old' }, trainDays: [3, 4], days: 2 }
    mergePlan(s, parsePlan(prog), { schedule: true })
    expect(s.trainDays).toEqual([1, 2, 3, 4, 5, 6].filter(d => s.week[d]))
    expect(s.days).toBe(Object.keys(prog.week).length)
    // without the schedule, nothing about the week moves
    const keep = { ...fresh(), week: { 3: 'old' }, trainDays: [3], days: 1 }
    mergePlan(keep, parsePlan(prog))
    expect(keep).toMatchObject({ week: { 3: 'old' }, trainDays: [3], days: 1 })
  })
})

describe('V-Taper & Knee Rebuild', () => {
  const prog = PROGRAMS.find(p => p.name === 'V-Taper & Knee Rebuild')
  const scheduled = prog.routines.filter(r => Object.values(prog.week).includes(r.id))

  // The point of Phase 1: nothing that loads a squat pattern until the knee has passed its tests.
  it('keeps squats, lunges and leg press off every scheduled day', () => {
    const squatty = /squat|lunge|leg press|step-up/i
    scheduled.forEach(r => r.ex.forEach(e => {
      const name = EXIDX[e.id]?.n || prog.customEx.find(c => c.id === e.id).n
      expect(name).not.toMatch(squatty)
    }))
  })

  it('carries the Phase 2 leg days unscheduled', () => {
    const phase2 = prog.routines.filter(r => r.name.startsWith('Phase 2'))
    expect(phase2).toHaveLength(2)
    phase2.forEach(r => expect(Object.values(prog.week)).not.toContain(r.id))
  })

  // Reverse and hammer curls are filed under upper arms, but brachioradialis is most of the
  // forearm you see — they count, alongside the wrist curls and the hang.
  it('trains forearms on three days', () => {
    const forearm = e => EXIDX[e.id]?.bp === 'lower arms' || /reverse curl|hammer/.test(EXIDX[e.id]?.n || '') || e.id === 'vt-hang'
    const forearmDays = scheduled.filter(r => r.ex.some(forearm))
    expect(forearmDays.length).toBeGreaterThanOrEqual(3)
  })
})
