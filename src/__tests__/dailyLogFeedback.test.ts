import { getDailyLogSuccessMessage } from '../lib/dailyLogFeedback';
import type { DailyEntry } from '../types';

const emptySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

function entry(
  localDate: string,
  options: {
    hadBowelMovement?: boolean;
    checkedInAt?: string;
  } = {},
): DailyEntry {
  return {
    id: `entry-${localDate}`,
    localDate,
    hadBowelMovement: options.hadBowelMovement ?? true,
    detailsRecorded: true,
    stoolType: null,
    symptoms: emptySymptoms,
    laxativeUsed: false,
    laxativeNote: '',
    checkedInAt: options.checkedInAt ?? `${localDate}T12:00:00.000Z`,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  };
}

describe('daily log feedback', () => {
  it('starts with the first no-streak message', () => {
    expect(getDailyLogSuccessMessage()).toBe(
      'Thank you for taking a step toward a healthier you.',
    );
  });

  it('cycles no-streak messages by completed entry count', () => {
    const message = getDailyLogSuccessMessage(
      [
        entry('2026-07-10'),
        entry('2026-07-08'),
        entry('2026-07-06'),
        entry('2026-07-04'),
        entry('2026-07-02'),
        entry('2026-06-30'),
        entry('2026-06-28'),
      ],
      { today: '2026-07-10' },
    );

    expect(message).toBe('Thank you for taking a step toward a healthier you.');
  });

  it('counts multiple logs on one date as one completed day', () => {
    const message = getDailyLogSuccessMessage(
      [
        entry('2026-07-10', { hadBowelMovement: false }),
        {
          ...entry('2026-07-10', { hadBowelMovement: false }),
          id: 'second-log-same-day',
          checkedInAt: '2026-07-10T18:00:00.000Z',
        },
      ],
      { today: '2026-07-10' },
    );

    expect(message).toBe('Thank you for taking a step toward a healthier you.');
  });

  it('uses early streak copy for days 2 through 4', () => {
    const message = getDailyLogSuccessMessage(
      [
        entry('2026-07-10'),
        entry('2026-07-09'),
        entry('2026-07-08'),
        entry('2026-07-07'),
      ],
      { today: '2026-07-10' },
    );

    expect(message).toBe(
      "Logged! That's 4 days of treating your gut right.",
    );
  });

  it('uses major streak copy at day 5 and recycles after the message list ends', () => {
    const message = getDailyLogSuccessMessage(
      [
        entry('2026-07-10'),
        entry('2026-07-09'),
        entry('2026-07-08'),
        entry('2026-07-07'),
        entry('2026-07-06'),
        entry('2026-07-05'),
        entry('2026-07-04'),
        entry('2026-07-03'),
        entry('2026-07-02'),
      ],
      { today: '2026-07-10' },
    );

    expect(message).toBe(
      'A 9-day streak?! You are an absolute regular at this.',
    );
  });

  it('uses rescue copy when a streak log happens after 8pm', () => {
    const message = getDailyLogSuccessMessage(
      [entry('2026-07-10'), entry('2026-07-09')],
      {
        today: '2026-07-10',
        loggedAt: new Date(2026, 6, 10, 20, 1),
      },
    );

    expect(message).toBe(
      'Whew, that was a close one! Streak saved just in time.',
    );
  });

  it('treats no bowel movement logs as streak breaks', () => {
    const message = getDailyLogSuccessMessage(
      [
        entry('2026-07-10'),
        entry('2026-07-09'),
        entry('2026-07-08', { hadBowelMovement: false }),
        entry('2026-07-07'),
        entry('2026-07-06'),
        entry('2026-07-05', { hadBowelMovement: false }),
      ],
      { today: '2026-07-10' },
    );

    expect(message).toBe(
      "2 days in a row! You're really flushing out a great new habit.",
    );
  });

  it('does not use rescue copy when the late log is not a bowel movement streak', () => {
    const message = getDailyLogSuccessMessage(
      [
        entry('2026-07-10', { hadBowelMovement: false }),
        entry('2026-07-09'),
        entry('2026-07-08'),
        entry('2026-07-07'),
        entry('2026-07-06'),
        entry('2026-07-05'),
      ],
      {
        today: '2026-07-10',
        loggedAt: new Date(2026, 6, 10, 21, 30),
      },
    );

    expect(message).toBe(
      'Nicely done. See you tomorrow!',
    );
  });
});
