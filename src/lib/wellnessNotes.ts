const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const fallbackWellnessNotes = [
  'Small patterns are easier to notice when today\'s check-in is complete.',
  'Hydration and fiber-rich foods can support softer, easier-to-pass stools.',
  'A short walk or gentle movement may help support digestive rhythm.',
  'Adding fiber gradually can be easier on your body than sudden changes.',
  'Your notes can help make bowel patterns easier to discuss with a clinician.',
  'Water helps fiber do its job, especially when meals include more plants.',
  'A regular bathroom routine can support consistency over time.',
  'Try not to ignore the urge to go when your body gives the signal.',
  'Beans, whole grains, fruits, and vegetables can add helpful dietary fiber.',
  'A calm routine after a meal may give your body a predictable moment.',
  'Today\'s log is useful even when nothing changed.',
  'Gentle consistency often matters more than a perfect day.',
  'If you use a doctor-approved routine, tracking it can make patterns clearer.',
  'Hard or loose stool patterns are worth noticing without judging yourself.',
  'A few quiet notes can become useful context at your next appointment.',
  'Movement, fluids, and fiber are simple supports for regularity.',
  'If fiber feels new, gradual changes may be more comfortable.',
  'Your trend view works best when ordinary days are logged too.',
  'Bathroom timing can be part of a routine, especially after meals.',
  'Noticing symptoms like bloating or straining can help tell the fuller story.',
  'Regular check-ins can make gaps and changes easier to spot.',
  'Food, fluids, movement, and timing all play small roles in bowel patterns.',
  'Today\'s entry is a data point, not a diagnosis.',
  'A simple note now may save guesswork later.',
  'If a pattern feels unusual or worrying, your logs can help guide a clinician conversation.',
  'Comfort matters; give yourself enough time when you sit down.',
  'Whole grains, legumes, fruits, vegetables, and nuts are common fiber sources.',
  'Staying hydrated supports overall health and may help stools pass more easily.',
  'Gentle activity can support digestion without needing anything intense.',
  'Your body has patterns; this app helps you notice them with less guesswork.',
] as const satisfies readonly string[];

function getLocalDateDayIndex(localDate: string): number | null {
  const match = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(timestamp / MS_PER_DAY);
}

export function getFallbackWellnessNote(localDate: string): string {
  const dayIndex = getLocalDateDayIndex(localDate);

  if (dayIndex === null) {
    return fallbackWellnessNotes[0];
  }

  const noteIndex =
    ((dayIndex % fallbackWellnessNotes.length) +
      fallbackWellnessNotes.length) %
    fallbackWellnessNotes.length;

  return fallbackWellnessNotes[noteIndex];
}
