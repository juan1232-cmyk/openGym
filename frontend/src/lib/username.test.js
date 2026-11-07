import { describe, it, expect } from 'vitest'
import { cleanUsername, usernameProblem, passwordProblem, toEmail, suggestUsername, MIN_PASSWORD } from './username.js'

describe('usernames', () => {
  it('ignores case and surrounding spaces', () => {
    expect(cleanUsername('  Juan_G ')).toBe('juan_g')
    expect(toEmail('  Juan_G ')).toBe('juan_g@users.opengym.invalid')
  })

  it('accepts ordinary names', () => {
    for (const u of ['sam', 'sam.k', 'sam-k_2', '007', 'a'.repeat(30)]) expect(usernameProblem(u), u).toBeNull()
  })

  it('rejects the ones that are too short, too long or oddly shaped', () => {
    expect(usernameProblem('ab')).toMatch(/at least 3/)
    expect(usernameProblem('a'.repeat(31))).toMatch(/30/)
    expect(usernameProblem('.sam')).toMatch(/start with/)
    expect(usernameProblem('-sam')).toMatch(/start with/)
    expect(usernameProblem('sam k')).toMatch(/only letters/)
    expect(usernameProblem('sam@x.com')).toMatch(/only letters/)
    expect(usernameProblem('sam/../x')).toMatch(/only letters/)
  })

  it('never builds an address that could be mailed', () => {
    expect(toEmail('x').endsWith('.invalid')).toBe(true)
  })
})

describe('passwords', () => {
  it('has a minimum when creating, but never blocks signing in', () => {
    expect(passwordProblem('short', true)).toMatch(new RegExp(String(MIN_PASSWORD)))
    expect(passwordProblem('x'.repeat(MIN_PASSWORD), true)).toBeNull()
    expect(passwordProblem('short', false)).toBeNull()
  })
})

describe('suggestUsername', () => {
  it('turns the onboarding name into a usable start', () => {
    expect(suggestUsername('Juan García')).toBe('juan.garca')
    expect(suggestUsername('Sam')).toBe('sam')
  })
  it('gives nothing when the name cannot become one', () => {
    expect(suggestUsername('Jo')).toBe('')
    expect(suggestUsername('')).toBe('')
    expect(suggestUsername('张伟')).toBe('')
  })
})
