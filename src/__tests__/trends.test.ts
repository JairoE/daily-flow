import type { DailyEntry, DailyEntryInput } from '../types';
import {
  buildHistoryDays,
  filterHistoryDaysForProfile,
  summarizeTrends,
} from '../lib/trends';

const emptySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

function legacyEntry(
  localDate: string,
  hadBowelMovement: boolean,
): DailyEntry {
  return {
    id: `entry-${localDate}`,
    localDate,
    hadBowelMovement,
    detailsRecorded: false,
    stoolType: null,
    symptoms: emptySymptoms,
    laxativeUsed: false,
    laxativeNote: '',
    checkedInAt: `${localDate}T12:00:00.000Z`,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  };
}

function richEntry(localDate: string, input: DailyEntryInput): DailyEntry {
  return {
    id: `entry-${localDate}`,
    localDate,
    hadBowelMovement: input.hadBowelMovement,
    detailsRecorded: true,
    stoolType:
      input.hadBowelMovement && input.stoolType ? input.stoolType : null,
    symptoms: {
      ...emptySymptoms,
      ...input.symptoms,
    },
    laxativeUsed: input.laxativeUsed ?? false,
    laxativeNote: input.laxativeNote ?? '',
    checkedInAt: `${localDate}T12:00:00.000Z`,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  };
}

describe('trend helpers', () => {
  it('summarizes yes, missed, and check-in rate trends', () => {
    const trends = summarizeTrends(
      [
        legacyEntry('2026-07-05', true),
        legacyEntry('2026-07-04', false),
        legacyEntry('2026-07-03', true),
      ],
      { today: '2026-07-05' },
    );

    expect(trends.yesLast7).toBe(2);
    expect(trends.yesLast30).toBe(2);
    expect(trends.missedLast7).toBe(4);
    expect(trends.daysSinceLastYes).toBe(0);
    expect(trends.checkInRateLast7).toBe(43);
    expect(trends.bowelMovementDaysLast30).toBe(2);
    expect(trends.completedDaysLast30).toBe(3);
    expect(trends.detailDays).toBe(0);
  });

  it('keeps today pending until the missed-check-in cutoff passes', () => {
    const [today] = buildHistoryDays([], {
      days: 1,
      today: '2026-07-05',
      includeTodayAsMissed: false,
    });

    expect(today.status).toBe('pending');
  });

  it('can mark today missed after the missed-check-in cutoff', () => {
    const [today] = buildHistoryDays([], {
      days: 1,
      today: '2026-07-05',
      includeTodayAsMissed: true,
    });

    expect(today.status).toBe('missed');
  });

  it('summarizes Bristol, symptom, laxative, and note detail metrics', () => {
    const trends = summarizeTrends(
      [
        richEntry('2026-07-05', {
          hadBowelMovement: false,
          symptoms: { pain: true },
          laxativeUsed: true,
          laxativeNote: 'PEG',
        }),
        richEntry('2026-07-04', {
          hadBowelMovement: false,
          symptoms: { bloating: true },
        }),
        richEntry('2026-07-03', {
          hadBowelMovement: true,
          stoolType: 2,
          symptoms: { straining: true, incompleteEvacuation: true },
          laxativeUsed: true,
        }),
        richEntry('2026-06-29', {
          hadBowelMovement: true,
          stoolType: 2,
          symptoms: { straining: true },
          laxativeNote: 'Changed routine',
        }),
        richEntry('2026-06-28', {
          hadBowelMovement: true,
          stoolType: 6,
        }),
        legacyEntry('2026-06-27', true),
      ],
      { today: '2026-07-05' },
    );

    expect(trends.bristolDistribution).toEqual([
      { type: 1, count: 0 },
      { type: 2, count: 2 },
      { type: 3, count: 0 },
      { type: 4, count: 0 },
      { type: 5, count: 0 },
      { type: 6, count: 1 },
      { type: 7, count: 0 },
    ]);
    expect(trends.mostCommonBristolType).toBe(2);
    expect(trends.hardOrLumpyDays).toBe(2);
    expect(trends.looseOrWateryDays).toBe(1);
    expect(trends.symptomCounts).toEqual({
      straining: 2,
      pain: 1,
      bloating: 1,
      incompleteEvacuation: 1,
    });
    expect(trends.symptomBurdenDays).toBe(4);
    expect(trends.laxativeUseDays).toBe(2);
    expect(trends.noteDays).toBe(2);
    expect(trends.detailDays).toBe(5);
  });

  it('calculates gaps, weekly bars, rolling series, and intervals', () => {
    const trends = summarizeTrends(
      [
        richEntry('2026-07-03', { hadBowelMovement: true, stoolType: 3 }),
        richEntry('2026-06-29', { hadBowelMovement: true, stoolType: 4 }),
        richEntry('2026-06-28', { hadBowelMovement: false }),
        richEntry('2026-06-27', { hadBowelMovement: false }),
        richEntry('2026-06-26', { hadBowelMovement: false }),
        richEntry('2026-06-25', { hadBowelMovement: false }),
        richEntry('2026-06-24', { hadBowelMovement: true, stoolType: 4 }),
      ],
      { today: '2026-07-05' },
    );

    expect(trends.currentGapDays).toBe(2);
    expect(trends.longestGapDays).toBe(4);
    expect(trends.gapCount2Plus).toBe(2);
    expect(trends.averagePerWeekLast30).toBe(0.7);
    expect(trends.weeklyFrequency.length).toBeGreaterThanOrEqual(4);
    expect(trends.rolling7).toHaveLength(30);
    expect(trends.rolling7[29]).toEqual({
      localDate: '2026-07-05',
      label: 'Today',
      count: 2,
    });
    expect(trends.intervals).toEqual([
      {
        localDate: '2026-06-24',
        label: 'Wed, Jun 24',
        daysSincePrevious: null,
      },
      {
        localDate: '2026-06-29',
        label: 'Mon, Jun 29',
        daysSincePrevious: 5,
      },
      {
        localDate: '2026-07-03',
        label: 'Fri, Jul 3',
        daysSincePrevious: 4,
      },
    ]);
  });

  it('filters visible history to profile start while preserving filled earlier days', () => {
    const historyDays = buildHistoryDays(
      [richEntry('2026-07-02', { hadBowelMovement: true, stoolType: 4 })],
      {
        days: 7,
        today: '2026-07-07',
        includeTodayAsMissed: true,
      },
    );

    const visibleDays = filterHistoryDaysForProfile(
      historyDays,
      '2026-07-05T14:30:00.000Z',
    );

    expect(visibleDays.map((day) => day.localDate)).toEqual([
      '2026-07-07',
      '2026-07-06',
      '2026-07-05',
      '2026-07-02',
    ]);
  });
});
