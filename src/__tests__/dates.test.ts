import {
  addDays,
  getCheckInDateTime,
  normalizeCheckInTime,
} from '../lib/dates';

describe('date helpers', () => {
  it('normalizes valid 24-hour check-in times', () => {
    expect(normalizeCheckInTime('9:05')).toBe('09:05');
    expect(normalizeCheckInTime('20:30')).toBe('20:30');
  });

  it('rejects invalid check-in times', () => {
    expect(normalizeCheckInTime('24:00')).toBeNull();
    expect(normalizeCheckInTime('8pm')).toBeNull();
  });

  it('adds days using local calendar dates', () => {
    expect(addDays('2026-07-05', 1)).toBe('2026-07-06');
    expect(addDays('2026-07-05', -2)).toBe('2026-07-03');
  });

  it('builds a check-in datetime with reminder offset', () => {
    const date = getCheckInDateTime('2026-07-05', '20:30', 120);

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(22);
    expect(date.getMinutes()).toBe(30);
  });
});
