// Username + password accounts on the hosted app. Supabase insists on an email or a phone for every
// user, and asking people for an email is what this sign-in is trying to avoid — so the username
// is turned into an address that is never mailed (the project signs people in without confirming
// it, see backend.js `available`). Pure, and kept apart from the backend so the rules are tested.

// `.invalid` is reserved (RFC 2606): it can never be a real inbox, so nothing can ever be sent to
// or claimed at one of these addresses.
export const ACCOUNT_DOMAIN = 'users.opengym.invalid'
export const MIN_PASSWORD = 8

// What the person typed, as the account knows it: case and surrounding spaces never matter.
export const cleanUsername = raw => String(raw || '').trim().toLowerCase()

// Why a username can't be used, or null. Returns the sentence the person reads (already English,
// passed through t() by the caller). Letters, digits and . _ - only; must start with a letter or
// digit; 3–30 long — short enough to type, and nothing that could read as a path or a second address.
export function usernameProblem(u) {
  if (u.length < 3) return 'Pick a username with at least 3 characters.'
  if (u.length > 30) return 'Keep the username to 30 characters or fewer.'
  if (!/^[a-z0-9]/.test(u)) return 'The username has to start with a letter or number.'
  if (!/^[a-z0-9._-]+$/.test(u)) return 'Use only letters, numbers, dots, dashes and underscores in the username.'
  return null
}

// A password is only length-checked when it is being made; signing in sends whatever was typed
// so an old, shorter password still works.
export const passwordProblem = (p, creating) =>
  creating && String(p || '').length < MIN_PASSWORD ? `Use a password with at least ${MIN_PASSWORD} characters.` : null

export const toEmail = u => `${cleanUsername(u)}@${ACCOUNT_DOMAIN}`

// A starting suggestion from the name the onboarding already asked, or '' if it can't become one.
export function suggestUsername(name) {
  const u = cleanUsername(name).replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '')
  return usernameProblem(u) ? '' : u
}
