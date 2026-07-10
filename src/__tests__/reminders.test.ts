import type { Profile } from '../types';
import {
  getLoggedNoReminderDate,
  getReminderCopy,
  getUpcomingMissedReminderTargets,
} from '../lib/reminders';

const profile: Profile = {
  id: 'local-profile',
  displayName: 'Friend',
  timezone: 'America/New_York',
  checkInTime: '20:00',
  remindersEnabled: true,
  privateNotifications: false,
  privacyLockEnabled: false,
  dailyOpenLoveShownDate: null,
  createdAt: '2026-07-05T12:00:00.000Z',
  updatedAt: '2026-07-05T12:00:00.000Z',
};

describe('reminder helpers', () => {
  it('uses discreet copy when private notifications are enabled', () => {
    const copy = getReminderCopy('daily_checkin', true);

    expect(copy.body).toBe('Time for your daily wellness check-in.');
    expect(copy.body).not.toMatch(/bowel/i);
  });

  it('uses non-medical wellness language after a no log', () => {
    const copy = getReminderCopy('logged_no_wellness', false);

    expect(copy.body).toMatch(/Hydration/);
    expect(copy.body).toMatch(/fiber-rich/);
    expect(copy.body).toMatch(/doctor-approved/);
  });

  it('moves late wellness reminders to the next morning', () => {
    const reminderDate = getLoggedNoReminderDate(
      new Date(2026, 6, 5, 20, 30),
    );

    expect(reminderDate.getFullYear()).toBe(2026);
    expect(reminderDate.getMonth()).toBe(6);
    expect(reminderDate.getDate()).toBe(6);
    expect(reminderDate.getHours()).toBe(9);
    expect(reminderDate.getMinutes()).toBe(0);
  });

  it('builds upcoming missed check-in reminder targets', () => {
    const targets = getUpcomingMissedReminderTargets(profile, {
      from: new Date(2026, 6, 5, 19, 0),
      days: 2,
      offsetMinutes: 120,
    });

    expect(targets).toHaveLength(2);
    expect(targets[0].localDate).toBe('2026-07-05');
    expect(targets[0].fireDate.getHours()).toBe(22);
    expect(targets[1].localDate).toBe('2026-07-06');
  });
});
