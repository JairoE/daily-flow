import type { DailyEntry } from '../types';
import { buildHistoryDays, summarizeTrends } from '../lib/trends';

function entry(localDate: string, hadBowelMovement: boolean): DailyEntry {
  return {
    id: `entry-${localDate}`,
    localDate,
    hadBowelMovement,
    checkedInAt: `${localDate}T12:00:00.000Z`,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  };
}

describe('trend helpers', () => {
  it('summarizes yes, missed, and check-in rate trends', () => {
    const trends = summarizeTrends(
      [
        entry('2026-07-05', true),
        entry('2026-07-04', false),
        entry('2026-07-03', true),
      ],
      { today: '2026-07-05' },
    );

    expect(trends.yesLast7).toBe(2);
    expect(trends.yesLast30).toBe(2);
    expect(trends.missedLast7).toBe(4);
    expect(trends.daysSinceLastYes).toBe(0);
    expect(trends.checkInRateLast7).toBe(43);
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
});
