import {
  CALENDAR_NO_COLOR,
  CALENDAR_YES_COLOR,
  buildCalendarRingSegments,
} from '../lib/calendarRing';
import type { DailyEntry } from '../types';

const emptySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

function entry(
  id: string,
  checkedInAt: string,
  hadBowelMovement: boolean,
): DailyEntry {
  return {
    id,
    localDate: '2026-07-09',
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

describe('calendar ring geometry', () => {
  const circumference = 100;

  it.each([
    [true, CALENDAR_YES_COLOR],
    [false, CALENDAR_NO_COLOR],
  ] as const)('uses one continuous ring for a single %s log', (value, color) => {
    expect(
      buildCalendarRingSegments(
        [entry('only', '2026-07-09T08:00:00.000Z', value)],
        circumference,
      ),
    ).toEqual([
      {
        entryId: 'only',
        color,
        dashLength: circumference,
        dashOffset: 0,
      },
    ]);
  });

  it('creates two equal separated purple arcs for two Yes logs', () => {
    const segments = buildCalendarRingSegments(
      [
        entry('first', '2026-07-09T08:00:00.000Z', true),
        entry('second', '2026-07-09T13:00:00.000Z', true),
      ],
      circumference,
      4,
    );

    expect(segments.map(({ color }) => color)).toEqual([
      CALENDAR_YES_COLOR,
      CALENDAR_YES_COLOR,
    ]);
    expect(segments[0].dashLength).toBe(46);
    expect(segments[1].dashLength).toBe(46);
    expect(segments[0].dashOffset).toBe(0);
    expect(segments[1].dashOffset).toBe(-50);
  });

  it('keeps No, No, Yes segment colors in chronological order', () => {
    const segments = buildCalendarRingSegments(
      [
        entry('yes-last', '2026-07-09T18:00:00.000Z', true),
        entry('no-later', '2026-07-09T13:00:00.000Z', false),
        entry('no-first', '2026-07-09T08:00:00.000Z', false),
      ],
      circumference,
      3,
    );

    expect(segments.map(({ entryId }) => entryId)).toEqual([
      'no-first',
      'no-later',
      'yes-last',
    ]);
    expect(segments.map(({ color }) => color)).toEqual([
      CALENDAR_NO_COLOR,
      CALENDAR_NO_COLOR,
      CALENDAR_YES_COLOR,
    ]);
    expect(new Set(segments.map(({ dashLength }) => dashLength)).size).toBe(1);
  });

  it('scales separator gaps down for dense days', () => {
    const entries = Array.from({ length: 20 }, (_, index) =>
      entry(
        `entry-${index.toString().padStart(2, '0')}`,
        `2026-07-09T${index.toString().padStart(2, '0')}:00:00.000Z`,
        index % 2 === 0,
      ),
    );

    const segments = buildCalendarRingSegments(entries, circumference, 4);
    const step = Math.abs(segments[1].dashOffset - segments[0].dashOffset);
    const gap = step - segments[0].dashLength;

    expect(gap).toBeLessThan(4);
    expect(segments[0].dashLength).toBeGreaterThan(gap);
  });
});
