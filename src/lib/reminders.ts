import type { NotificationType, Profile } from '../types';
import {
  addDays,
  getCheckInDateTime,
  getLocalDateKey,
  parseCheckInTime,
} from './dates';

export type ReminderCopy = {
  title: string;
  body: string;
};

export type MissedReminderTarget = {
  localDate: string;
  fireDate: Date;
};

export function getReminderCopy(
  type: NotificationType,
  privateNotifications: boolean,
): ReminderCopy {
  if (privateNotifications) {
    return {
      title: 'Daily Flow',
      body: 'Time for your daily wellness check-in.',
    };
  }

  if (type === 'daily_checkin') {
    return {
      title: 'Daily check-in',
      body: 'Quick check-in: did you have a bowel movement today?',
    };
  }

  if (type === 'logged_no_wellness') {
    return {
      title: 'Gentle wellness note',
      body: 'Hydration, fiber-rich foods, and any doctor-approved routine can support regularity.',
    };
  }

  return {
    title: 'Gentle reminder',
    body: 'Check in when you have a moment. Small daily notes can make patterns easier to see.',
  };
}

export function getDailyTriggerParts(profile: Profile): {
  hour: number;
  minute: number;
} {
  return parseCheckInTime(profile.checkInTime);
}

export function getLoggedNoReminderDate(now = new Date()): Date {
  const reminder = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  if (reminder.getHours() >= 21 || reminder.getHours() < 7) {
    reminder.setDate(reminder.getDate() + (reminder.getHours() >= 21 ? 1 : 0));
    reminder.setHours(9, 0, 0, 0);
  }

  return reminder;
}

export function getUpcomingMissedReminderTargets(
  profile: Profile,
  options: {
    from?: Date;
    days?: number;
    offsetMinutes?: number;
  } = {},
): MissedReminderTarget[] {
  const from = options.from ?? new Date();
  const days = options.days ?? 7;
  const offsetMinutes = options.offsetMinutes ?? 120;
  const today = getLocalDateKey(from);

  return Array.from({ length: days }, (_, index) => {
    const localDate = addDays(today, index);
    return {
      localDate,
      fireDate: getCheckInDateTime(
        localDate,
        profile.checkInTime,
        offsetMinutes,
      ),
    };
  }).filter((target) => target.fireDate.getTime() > from.getTime());
}
