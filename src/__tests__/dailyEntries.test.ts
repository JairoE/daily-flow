import {
  formatEntryDayAccessibility,
  groupEntriesByDate,
  summarizeEntryDay,
} from '../lib/dailyEntries';
import type { DailyEntry } from '../types';

const emptySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

function entry(
  id: string,
  localDate: string,
  checkedInAt: string,
  hadBowelMovement: boolean,
): DailyEntry {
  return {
    id,
    localDate,
    hadBowelMovement,
    detailsRecorded: true,
    stoolType: hadBowelMovement ? 4 : null,
    symptoms: emptySymptoms,
    laxativeUsed: false,
    laxativeNote: '',
    checkedInAt,
    createdAt: checkedInAt,
    updatedAt: checkedInAt,
  };
}

describe('daily entry aggregation', () => {
  const entries = [
    entry('yes-last', '2026-07-09', '2026-07-09T18:00:00.000Z', true),
    entry('no-later', '2026-07-09', '2026-07-09T13:00:00.000Z', false),
    entry('no-early', '2026-07-09', '2026-07-09T08:00:00.000Z', false),
  ];

  it('groups duplicate dates in checked-in order', () => {
    expect(
      groupEntriesByDate(entries)
        .get('2026-07-09')
        ?.map(({ id }) => id),
    ).toEqual(['no-early', 'no-later', 'yes-last']);
  });

  it('uses the entry id to break timestamp ties', () => {
    const checkedInAt = '2026-07-09T08:00:00.000Z';
    const tied = [
      entry('b', '2026-07-09', checkedInAt, true),
      entry('a', '2026-07-09', checkedInAt, false),
    ];

    expect(
      groupEntriesByDate(tied)
        .get('2026-07-09')
        ?.map(({ id }) => id),
    ).toEqual(['a', 'b']);
  });

  it('summarizes mixed daily activity without losing event order', () => {
    expect(
      summarizeEntryDay('2026-07-09', entries, { today: '2026-07-17' }),
    ).toMatchObject({
      status: 'mixed',
      yesCount: 1,
      noCount: 2,
      totalCount: 3,
      hasBowelMovement: true,
      entries: [
        expect.objectContaining({ id: 'no-early' }),
        expect.objectContaining({ id: 'no-later' }),
        expect.objectContaining({ id: 'yes-last' }),
      ],
    });
  });

  it.each([
    [true, 'yes'],
    [false, 'no'],
  ] as const)('summarizes a single %s event as %s', (hadBowelMovement, status) => {
    const onlyEntry = entry(
      'only',
      '2026-07-09',
      '2026-07-09T08:00:00.000Z',
      hadBowelMovement,
    );

    expect(
      summarizeEntryDay('2026-07-09', [onlyEntry], {
        today: '2026-07-17',
      }).status,
    ).toBe(status);
  });

  it('distinguishes pending today from a missed past date', () => {
    expect(
      summarizeEntryDay('2026-07-17', [], { today: '2026-07-17' }).status,
    ).toBe('pending');
    expect(
      summarizeEntryDay('2026-07-16', [], { today: '2026-07-17' }).status,
    ).toBe('missed');
    expect(
      summarizeEntryDay('2026-07-17', [], {
        today: '2026-07-17',
        includeTodayAsMissed: true,
      }).status,
    ).toBe('missed');
  });

  it('formats an exact non-color accessibility summary', () => {
    const summary = summarizeEntryDay('2026-07-09', entries, {
      today: '2026-07-17',
    });

    expect(formatEntryDayAccessibility(summary, 'July 9')).toBe(
      'July 9, 3 logs: 1 yes, 2 no',
    );
  });
});
