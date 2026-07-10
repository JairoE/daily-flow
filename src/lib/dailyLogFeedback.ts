import { addDays, getLocalDateKey } from './dates';
import type { DailyEntry } from '../types';

const noStreakMessages = [
  'Thank you for taking a step toward a healthier you.',
  'Great job tracking today! Small habits lead to big insights into your health.',
  'Every entry helps you understand your body better. Keep up the great work!',
  "Consistency is key to wellness. You're doing great!",
  'Done! Your future self will thank you for the data.',
  'Nicely done. See you tomorrow!',
] as const;

const earlyStreakMessages = [
  "{streak_count} days in a row! You're really flushing out a great new habit.",
  "Streak saved! You're officially on a roll. 🧻",
  "Logged! That's {streak_count} days of treating your gut right.",
] as const;

const majorStreakMessages = [
  'A {streak_count}-day streak?! You are an absolute regular at this.',
  'Boom! {streak_count} days straight. Your digestive system deserves a medal.',
  "Streak saved! You're officially on a roll. 🧻",
  'Unstoppable! {streak_count} days of peak gut health tracking.',
] as const;

const rescueStreakMessages = [
  'Whew, that was a close one! Streak saved just in time.',
  'Crisis averted. Your {streak_count}-day streak lives to see another day!',
  'Phew! We almost had a backup there. Streak extended!',
] as const;

const successMessages = [
  ...noStreakMessages,
  ...earlyStreakMessages,
  ...majorStreakMessages,
  ...rescueStreakMessages,
] as const;

type MessageTemplate = (typeof successMessages)[number];

type DailyLogSuccessOptions = {
  today?: string;
  loggedAt?: Date;
};

export function getDailyLogSuccessMessage(
  entries: DailyEntry[] = [],
  options: DailyLogSuccessOptions = {},
): string {
  const today = options.today ?? getLocalDateKey(options.loggedAt);
  const streakCount = getDailyLogStreakCount(entries, today);
  const isLateStreakLog =
    streakCount >= 2 && Boolean(options.loggedAt && options.loggedAt.getHours() >= 20);

  if (isLateStreakLog) {
    return fillStreakCount(
      rescueStreakMessages[(streakCount - 2) % rescueStreakMessages.length],
      streakCount,
    );
  }

  if (streakCount >= 5) {
    return fillStreakCount(
      majorStreakMessages[(streakCount - 5) % majorStreakMessages.length],
      streakCount,
    );
  }

  if (streakCount >= 2) {
    return fillStreakCount(
      earlyStreakMessages[(streakCount - 2) % earlyStreakMessages.length],
      streakCount,
    );
  }

  const completedEntries = countCompletedEntries(entries, today);

  return noStreakMessages[
    Math.max(0, completedEntries - 1) % noStreakMessages.length
  ];
}

export function isDailyLogSuccessMessage(message: string): boolean {
  return successMessages.some(
    (template) => message === template || matchesTemplate(message, template),
  );
}

function getDailyLogStreakCount(entries: DailyEntry[], today: string): number {
  const bowelMovementDates = new Set(
    entries
      .filter((entry) => entry.hadBowelMovement)
      .map((entry) => entry.localDate),
  );
  let cursor = today;
  let count = 0;

  while (bowelMovementDates.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }

  return count;
}

function countCompletedEntries(entries: DailyEntry[], today: string): number {
  const loggedDates = new Set(
    entries
      .map((entry) => entry.localDate)
      .filter((localDate) => localDate <= today),
  );

  return loggedDates.size;
}

function fillStreakCount(template: MessageTemplate, streakCount: number): string {
  return template.replace('{streak_count}', String(streakCount));
}

function matchesTemplate(message: string, template: MessageTemplate): boolean {
  if (!template.includes('{streak_count}')) {
    return false;
  }

  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\\{streak_count\\}', '\\d+');

  return new RegExp(`^${escaped}$`).test(message);
}
