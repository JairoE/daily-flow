import type {
  BristolDistributionItem,
  DailyEntry,
  HistoryDay,
  HistoryMonthDay,
  IntervalPoint,
  RollingFrequencyPoint,
  StoolType,
  SymptomCounts,
  TrendSummary,
  WeeklyFrequencyPoint,
} from '../types';
import {
  addDays,
  daysBetween,
  formatFriendlyDate,
  getLocalDateKey,
  getRecentDateKeys,
  parseLocalDateKey,
} from './dates';
import { groupEntriesByDate, summarizeEntryDay } from './dailyEntries';

const stoolTypes: StoolType[] = [1, 2, 3, 4, 5, 6, 7];

const emptySymptomCounts: SymptomCounts = {
  straining: 0,
  pain: 0,
  bloating: 0,
  incompleteEvacuation: 0,
};

function isAnswered(day: HistoryDay): boolean {
  return day.status === 'yes' || day.status === 'no' || day.status === 'mixed';
}

function isNonPending(day: HistoryDay): boolean {
  return day.status !== 'pending';
}

function isNoBowelMovementDay(day: HistoryDay): boolean {
  return day.status === 'no' || day.status === 'missed';
}

function roundedOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function formatShortDate(localDate: string): string {
  return parseLocalDateKey(localDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function summarizeGaps(chronologicalDays: HistoryDay[]) {
  let currentRun = 0;
  let longestGapDays = 0;
  let gapCount2Plus = 0;
  let seenYes = false;

  for (const day of chronologicalDays) {
    if (!isNonPending(day)) {
      continue;
    }

    if (day.status === 'yes' || day.status === 'mixed') {
      if (seenYes && currentRun >= 2) {
        gapCount2Plus += 1;
      }

      if (seenYes) {
        longestGapDays = Math.max(longestGapDays, currentRun);
      }

      seenYes = true;
      currentRun = 0;
      continue;
    }

    if (seenYes && isNoBowelMovementDay(day)) {
      currentRun += 1;
    }
  }

  if (seenYes && currentRun >= 2) {
    gapCount2Plus += 1;
  }

  if (seenYes) {
    longestGapDays = Math.max(longestGapDays, currentRun);
  }

  return {
    longestGapDays,
    gapCount2Plus,
  };
}

function buildWeeklyFrequency(
  chronologicalDays: HistoryDay[],
): WeeklyFrequencyPoint[] {
  const points: WeeklyFrequencyPoint[] = [];

  for (let index = 0; index < chronologicalDays.length; index += 7) {
    const weekDays = chronologicalDays.slice(index, index + 7);
    const firstDay = weekDays[0];
    const lastDay = weekDays[weekDays.length - 1];

    if (!firstDay || !lastDay) {
      continue;
    }

    points.push({
      label: `${formatShortDate(firstDay.localDate)}-${formatShortDate(lastDay.localDate)}`,
      startDate: firstDay.localDate,
      endDate: lastDay.localDate,
      count: weekDays.reduce(
        (count, day) =>
          count + day.entries.filter((entry) => entry.hadBowelMovement).length,
        0,
      ),
    });
  }

  return points;
}

function buildRolling7(chronologicalDays: HistoryDay[]): RollingFrequencyPoint[] {
  return chronologicalDays.map((day, index) => {
    const windowDays = chronologicalDays.slice(Math.max(0, index - 6), index + 1);

    return {
      localDate: day.localDate,
      label: day.label,
      count: windowDays.reduce(
        (count, item) =>
          count + item.entries.filter((entry) => entry.hadBowelMovement).length,
        0,
      ),
    };
  });
}

function buildIntervals(chronologicalDays: HistoryDay[]): IntervalPoint[] {
  let previousYesDate: string | null = null;
  const intervals: IntervalPoint[] = [];

  for (const day of chronologicalDays) {
    for (const entry of day.entries) {
      if (!entry.hadBowelMovement) {
        continue;
      }

      intervals.push({
        localDate: day.localDate,
        label: day.label,
        daysSincePrevious: previousYesDate
          ? daysBetween(previousYesDate, day.localDate)
          : null,
      });
      previousYesDate = day.localDate;
    }
  }

  return intervals;
}

function buildBristolDistribution(
  detailEntries: DailyEntry[],
): BristolDistributionItem[] {
  return stoolTypes.map((type) => ({
    type,
    count: detailEntries.filter(
      (entry) => entry.hadBowelMovement && entry.stoolType === type,
    ).length,
  }));
}

function findMostCommonBristolType(
  distribution: BristolDistributionItem[],
): StoolType | null {
  const sorted = [...distribution].sort((a, b) => b.count - a.count);
  const top = sorted[0];

  return top && top.count > 0 ? top.type : null;
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
  const byDate = groupEntriesByDate(entries);

  return getRecentDateKeys(days, today)
    .reverse()
    .map((localDate) => {
      const summary = summarizeEntryDay(localDate, byDate.get(localDate) ?? [], {
        today,
        includeTodayAsMissed: options.includeTodayAsMissed,
      });
      return {
        localDate,
        label: formatFriendlyDate(localDate, today),
        status: summary.status,
        entries: summary.entries,
        entry: summary.entries.at(-1) ?? null,
      };
    });
}

export function buildMonthHistoryDays(
  entries: DailyEntry[],
  options: {
    today?: string;
    includeTodayAsMissed?: boolean;
  } = {},
): HistoryMonthDay[] {
  const today = options.today ?? getLocalDateKey();
  const currentDate = parseLocalDateKey(today);
  const monthStart = getLocalDateKey(
    new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
  );
  const gridStart = addDays(monthStart, -parseLocalDateKey(monthStart).getDay());
  const byDate = groupEntriesByDate(entries);

  return Array.from({ length: 42 }, (_, index) => {
    const localDate = addDays(gridStart, index);
    const summary = summarizeEntryDay(localDate, byDate.get(localDate) ?? [], {
      today,
      includeTodayAsMissed: options.includeTodayAsMissed,
    });
    const isCurrentMonth =
      parseLocalDateKey(localDate).getMonth() === currentDate.getMonth();

    return {
      localDate,
      label: formatFriendlyDate(localDate, today),
      status: summary.status,
      entries: summary.entries,
      entry: summary.entries.at(-1) ?? null,
      isCurrentMonth,
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
  const chronological30 = [...history30].reverse();
  const yesEntries = entries
    .filter((entry) => entry.hadBowelMovement && entry.localDate <= today)
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  const lastYes = yesEntries[0]?.localDate ?? null;
  const answeredLast7 = history7.filter(isAnswered).length;
  const nonPendingLast7 = history7.filter(isNonPending).length;
  const answeredLast30 = history30.filter(isAnswered).length;
  const nonPendingLast30 = history30.filter(isNonPending).length;
  const windowEntries = chronological30.flatMap((day) => day.entries);
  const detailEntries = windowEntries.filter((entry) => entry.detailsRecorded);
  const bowelMovementCountLast30 = windowEntries.filter(
    (entry) => entry.hadBowelMovement,
  ).length;
  const bristolDistribution = buildBristolDistribution(detailEntries);
  const symptomCounts = detailEntries.reduce<SymptomCounts>(
    (counts, entry) => ({
      straining: counts.straining + (entry.symptoms.straining ? 1 : 0),
      pain: counts.pain + (entry.symptoms.pain ? 1 : 0),
      bloating: counts.bloating + (entry.symptoms.bloating ? 1 : 0),
      incompleteEvacuation:
        counts.incompleteEvacuation +
        (entry.symptoms.incompleteEvacuation ? 1 : 0),
    }),
    emptySymptomCounts,
  );
  const gapSummary = summarizeGaps(chronological30);
  const yesLast30 = history30.filter(
    (day) => day.status === 'yes' || day.status === 'mixed',
  ).length;
  const averageBowelMovementsPerWeekLast30 = roundedOneDecimal(
    (bowelMovementCountLast30 / 30) * 7,
  );
  const hardOrLumpyMovementsLast30 = detailEntries.filter(
    (entry) =>
      entry.hadBowelMovement &&
      entry.stoolType !== null &&
      entry.stoolType <= 2,
  ).length;
  const looseOrWateryMovementsLast30 = detailEntries.filter(
    (entry) =>
      entry.hadBowelMovement &&
      entry.stoolType !== null &&
      entry.stoolType >= 6,
  ).length;
  const symptomBurdenEntriesLast30 = detailEntries.filter(
    (entry) =>
      entry.symptoms.straining ||
      entry.symptoms.pain ||
      entry.symptoms.bloating ||
      entry.symptoms.incompleteEvacuation,
  ).length;
  const laxativeUseEntriesLast30 = detailEntries.filter(
    (entry) => entry.laxativeUsed,
  ).length;
  const noteEntriesLast30 = detailEntries.filter((entry) =>
    Boolean(entry.laxativeNote.trim()),
  ).length;

  return {
    yesLast7: history7.filter(
      (day) => day.status === 'yes' || day.status === 'mixed',
    ).length,
    yesLast30,
    missedLast7: history7.filter((day) => day.status === 'missed').length,
    missedLast30: history30.filter((day) => day.status === 'missed').length,
    daysSinceLastYes: lastYes ? daysBetween(lastYes, today) : null,
    checkInRateLast7: percent(answeredLast7, nonPendingLast7),
    bowelMovementCountLast30,
    bowelMovementDaysLast30: yesLast30,
    averageBowelMovementsPerWeekLast30,
    currentGapDays: lastYes ? daysBetween(lastYes, today) : null,
    longestGapDays: gapSummary.longestGapDays,
    gapCount2Plus: gapSummary.gapCount2Plus,
    completedDaysLast30: answeredLast30,
    checkInRateLast30: percent(answeredLast30, nonPendingLast30),
    bristolDistribution,
    mostCommonBristolType: findMostCommonBristolType(bristolDistribution),
    hardOrLumpyMovementsLast30,
    looseOrWateryMovementsLast30,
    symptomCounts,
    symptomBurdenEntriesLast30,
    laxativeUseEntriesLast30,
    noteEntriesLast30,
    detailEntriesLast30: detailEntries.length,
    weeklyFrequency: buildWeeklyFrequency(chronological30),
    rolling7: buildRolling7(chronological30),
    intervals: buildIntervals(chronological30),
  };
}
