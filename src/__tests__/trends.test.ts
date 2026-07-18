import type { DailyEntry, DailyEntryInput } from '../types';
import {
  buildHistoryDays,
  buildMonthHistoryDays,
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
    expect(trends.detailEntriesLast30).toBe(0);
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

  it('keeps every event on a mixed day in chronological order', () => {
    const firstNo = {
      ...richEntry('2026-07-05', { hadBowelMovement: false }),
      id: 'first-no',
      checkedInAt: '2026-07-05T08:00:00.000Z',
    };
    const yes = {
      ...richEntry('2026-07-05', {
        hadBowelMovement: true,
        stoolType: 4,
      }),
      id: 'yes-last',
      checkedInAt: '2026-07-05T18:00:00.000Z',
    };
    const secondNo = {
      ...richEntry('2026-07-05', { hadBowelMovement: false }),
      id: 'second-no',
      checkedInAt: '2026-07-05T13:00:00.000Z',
    };

    const [day] = buildHistoryDays([yes, secondNo, firstNo], {
      days: 1,
      today: '2026-07-05',
    });

    expect(day.status).toBe('mixed');
    expect(day.entries.map(({ id }) => id)).toEqual([
      'first-no',
      'second-no',
      'yes-last',
    ]);
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
    expect(trends.hardOrLumpyMovementsLast30).toBe(2);
    expect(trends.looseOrWateryMovementsLast30).toBe(1);
    expect(trends.symptomCounts).toEqual({
      straining: 2,
      pain: 1,
      bloating: 1,
      incompleteEvacuation: 1,
    });
    expect(trends.symptomBurdenEntriesLast30).toBe(4);
    expect(trends.laxativeUseEntriesLast30).toBe(2);
    expect(trends.noteEntriesLast30).toBe(2);
    expect(trends.detailEntriesLast30).toBe(5);
  });

  it('counts duplicate-date movements as events while day metrics stay deduplicated', () => {
    const earlyYes = {
      ...richEntry('2026-07-05', {
        hadBowelMovement: true,
        stoolType: 2,
        symptoms: { straining: true },
      }),
      id: 'early-yes',
      checkedInAt: '2026-07-05T08:00:00.000Z',
    };
    const no = {
      ...richEntry('2026-07-05', {
        hadBowelMovement: false,
        symptoms: { bloating: true },
        laxativeUsed: true,
        laxativeNote: 'PEG',
      }),
      id: 'middle-no',
      checkedInAt: '2026-07-05T13:00:00.000Z',
    };
    const lateYes = {
      ...richEntry('2026-07-05', {
        hadBowelMovement: true,
        stoolType: 6,
      }),
      id: 'late-yes',
      checkedInAt: '2026-07-05T18:00:00.000Z',
    };

    const trends = summarizeTrends([lateYes, no, earlyYes], {
      today: '2026-07-05',
    });

    expect(trends.yesLast30).toBe(1);
    expect(trends.bowelMovementDaysLast30).toBe(1);
    expect(trends.bowelMovementCountLast30).toBe(2);
    expect(trends.completedDaysLast30).toBe(1);
    expect(trends.averageBowelMovementsPerWeekLast30).toBe(0.5);
    expect(trends.hardOrLumpyMovementsLast30).toBe(1);
    expect(trends.looseOrWateryMovementsLast30).toBe(1);
    expect(trends.symptomBurdenEntriesLast30).toBe(2);
    expect(trends.laxativeUseEntriesLast30).toBe(1);
    expect(trends.noteEntriesLast30).toBe(1);
    expect(trends.detailEntriesLast30).toBe(3);
    expect(trends.weeklyFrequency.at(-1)?.count).toBe(2);
    expect(trends.rolling7.at(-1)?.count).toBe(2);
    expect(trends.intervals).toEqual([
      {
        localDate: '2026-07-05',
        label: 'Today',
        daysSincePrevious: null,
      },
      {
        localDate: '2026-07-05',
        label: 'Today',
        daysSincePrevious: 0,
      },
    ]);
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
    expect(trends.averageBowelMovementsPerWeekLast30).toBe(0.7);
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

  it('builds a six-week current-month calendar without profile-start filtering', () => {
    const monthDays = buildMonthHistoryDays(
      [
        richEntry('2026-07-02', { hadBowelMovement: true, stoolType: 4 }),
        richEntry('2026-06-29', { hadBowelMovement: false }),
        richEntry('2026-08-01', { hadBowelMovement: true, stoolType: 3 }),
      ],
      {
        today: '2026-07-07',
        includeTodayAsMissed: true,
      },
    );

    expect(monthDays).toHaveLength(42);
    expect(monthDays[0].localDate).toBe('2026-06-28');
    expect(monthDays[0].isCurrentMonth).toBe(false);
    expect(monthDays[3].localDate).toBe('2026-07-01');
    expect(monthDays[3].isCurrentMonth).toBe(true);
    expect(monthDays[monthDays.length - 1].localDate).toBe('2026-08-08');
    expect(monthDays[monthDays.length - 1].isCurrentMonth).toBe(false);

    expect(monthDays.find((day) => day.localDate === '2026-06-29')?.status).toBe(
      'no',
    );
    expect(monthDays.find((day) => day.localDate === '2026-07-02')?.status).toBe(
      'yes',
    );
    expect(monthDays.find((day) => day.localDate === '2026-07-08')?.status).toBe(
      'pending',
    );
    expect(monthDays.find((day) => day.localDate === '2026-08-01')?.status).toBe(
      'yes',
    );
  });
});
