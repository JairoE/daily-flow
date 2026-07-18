import type { DailyEntry, HistoryStatus } from '../types';
import { getLocalDateKey, parseLocalDateKey } from './dates';

export type EntryDaySummary = {
  localDate: string;
  entries: DailyEntry[];
  status: HistoryStatus;
  yesCount: number;
  noCount: number;
  totalCount: number;
  hasBowelMovement: boolean;
};

export function compareDailyEntries(a: DailyEntry, b: DailyEntry): number {
  return a.checkedInAt.localeCompare(b.checkedInAt) || a.id.localeCompare(b.id);
}

export function groupEntriesByDate(
  entries: DailyEntry[],
): Map<string, DailyEntry[]> {
  const grouped = new Map<string, DailyEntry[]>();

  for (const entry of entries) {
    const dayEntries = grouped.get(entry.localDate) ?? [];
    dayEntries.push(entry);
    grouped.set(entry.localDate, dayEntries);
  }

  for (const dayEntries of grouped.values()) {
    dayEntries.sort(compareDailyEntries);
  }

  return grouped;
}

export function summarizeEntryDay(
  localDate: string,
  entries: DailyEntry[],
  options: { today?: string; includeTodayAsMissed?: boolean } = {},
): EntryDaySummary {
  const today = options.today ?? getLocalDateKey();
  const dayEntries = entries
    .filter((entry) => entry.localDate === localDate)
    .sort(compareDailyEntries);
  const yesCount = dayEntries.filter((entry) => entry.hadBowelMovement).length;
  const noCount = dayEntries.length - yesCount;
  let status: HistoryStatus;

  if (yesCount > 0 && noCount > 0) {
    status = 'mixed';
  } else if (yesCount > 0) {
    status = 'yes';
  } else if (noCount > 0) {
    status = 'no';
  } else if (
    localDate > today ||
    (localDate === today && !options.includeTodayAsMissed)
  ) {
    status = 'pending';
  } else {
    status = 'missed';
  }

  return {
    localDate,
    entries: dayEntries,
    status,
    yesCount,
    noCount,
    totalCount: dayEntries.length,
    hasBowelMovement: yesCount > 0,
  };
}

function defaultAccessibilityDate(localDate: string): string {
  return parseLocalDateKey(localDate).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

export function formatEntryDayAccessibility(
  summary: EntryDaySummary,
  label = defaultAccessibilityDate(summary.localDate),
): string {
  if (summary.totalCount === 0) {
    return `${label}, no logs`;
  }

  const logLabel = summary.totalCount === 1 ? 'log' : 'logs';

  return `${label}, ${summary.totalCount} ${logLabel}: ${summary.yesCount} yes, ${summary.noCount} no`;
}
