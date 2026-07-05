import type { DailyEntry, HistoryDay, TrendSummary } from '../types';
import {
  daysBetween,
  formatFriendlyDate,
  getLocalDateKey,
  getRecentDateKeys,
} from './dates';

function entryMap(entries: DailyEntry[]): Map<string, DailyEntry> {
  return new Map(entries.map((entry) => [entry.localDate, entry]));
}

export function buildHistoryDays(
  entries: DailyEntry[],
  options: {
    days?: number;
    today?: string;
    includeTodayAsMissed?: boolean;
  } = {},
): HistoryDay[] {
  const days = options.days ?? 30;
  const today = options.today ?? getLocalDateKey();
  const byDate = entryMap(entries);

  return getRecentDateKeys(days, today)
    .reverse()
    .map((localDate) => {
      const entry = byDate.get(localDate) ?? null;
      const isToday = localDate === today;

      if (entry) {
        return {
          localDate,
          label: formatFriendlyDate(localDate, today),
          status: entry.hadBowelMovement ? 'yes' : 'no',
          entry,
        };
      }

      return {
        localDate,
        label: formatFriendlyDate(localDate, today),
        status:
          isToday && !options.includeTodayAsMissed ? 'pending' : 'missed',
        entry: null,
      };
    });
}

export function summarizeTrends(
  entries: DailyEntry[],
  options: {
    today?: string;
    includeTodayAsMissed?: boolean;
  } = {},
): TrendSummary {
  const today = options.today ?? getLocalDateKey();
  const history30 = buildHistoryDays(entries, {
    days: 30,
    today,
    includeTodayAsMissed: options.includeTodayAsMissed,
  });
  const history7 = history30.slice(0, 7);
  const yesEntries = entries
    .filter((entry) => entry.hadBowelMovement && entry.localDate <= today)
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  const lastYes = yesEntries[0]?.localDate ?? null;
  const answeredLast7 = history7.filter(
    (day) => day.status === 'yes' || day.status === 'no',
  ).length;

  return {
    yesLast7: history7.filter((day) => day.status === 'yes').length,
    yesLast30: history30.filter((day) => day.status === 'yes').length,
    missedLast7: history7.filter((day) => day.status === 'missed').length,
    missedLast30: history30.filter((day) => day.status === 'missed').length,
    daysSinceLastYes: lastYes ? daysBetween(lastYes, today) : null,
    checkInRateLast7: Math.round((answeredLast7 / 7) * 100),
  };
}
