// Peek's voice in notifications. The frontend keeps the rest of the character in
// frontend/src/lib/peek (docs/PEEK.md); this is its own copy because the api image is built
// from api/ alone and can't import across. Same rules: short, deadpan, no emojis.

// bond stages — frontend/src/lib/peek/memory.js STAGES
const STAGES = [0, 15, 45, 80];
export const stageOf = bond => STAGES.reduce((s, min, i) => ((bond || 0) >= min ? i : s), 0);

const pick = list => list[Math.floor(Math.random() * list.length)];

export const restOver = () => pick([
  'Rest is over. Next set.',
  "Up. The bar isn't going to lift itself.",
  'Time. Go.',
  "Rest's done. So are the excuses."
]);

// the day's reminder; `name` is the planned routine's
export const reminder = (name, stage) => pick([
  `${name} is on the plan. I'll be waiting.`,
  `It's ${name} day. You know what to do.`,
  ...(stage >= 1 ? [`${name} today. Don't make me come get you.`] : []),
  ...(stage >= 2 ? [`${name}. Same time, same place. Let's go.`] : [])
]);

// Absence nudges: one at 3, 7 and 14 days since the last workout, then nothing. Tone follows
// the bond — a stranger is polite, a training partner takes it personally. Honesty 'gentle'
// keeps the soft ones.
export function absence(days, stage, honesty) {
  const soft = {
    3: ['Three days off. Rest is good. Too much rest is a habit.', 'Three days. Just checking in.'],
    7: ["A week off. Even a short session counts.", "It's been a week. Still here when you are."],
    14: ["Two weeks. No pressure. I'll be here.", "Two weeks away. Come back whenever. Soon would be nice."]
  };
  const hard = {
    3: ['Three days. The bar misses you. Not really.', "Three days without training. I'm counting."],
    7: ["A week. I'm starting to take this personally.", "Seven days. Your muscles aren't waiting."],
    14: ["Two weeks. I kept your spot. For now.", "Fourteen days. Are we still doing this?"]
  };
  const list = honesty === 'gentle' || stage === 0 ? soft[days] : [...hard[days], ...(honesty === 'brutal' ? [] : soft[days])];
  return list ? pick(list) : null;
}
