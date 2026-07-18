import { Platform } from 'react-native';

import {
  clearNotificationRecords,
  getEntries,
  getEntriesByDate,
  getNotificationRecord,
  getNotificationRecords,
  markNotificationRecordCanceled,
  upsertNotificationRecord,
} from '../storage/database';
import type { DailyEntry, NotificationRecord, NotificationType, Profile } from '../types';
import { getLocalDateKey } from '../lib/dates';
import { getLoggedNoReminderDate, getReminderCopy, getUpcomingMissedReminderTargets } from '../lib/reminders';
import { getDailyTriggerParts } from '../lib/reminders';

type NotificationsModule = typeof import('expo-notifications');

let notificationModulePromise: Promise<NotificationsModule | null> | null = null;
let handlerConfigured = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!notificationModulePromise) {
    notificationModulePromise = Promise.resolve(
      require('expo-notifications') as NotificationsModule,
    );
  }

  return notificationModulePromise;
}

export async function configureNotificationBehavior() {
  const Notifications = await getNotifications();

  if (!Notifications || handlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-flow-reminders', {
      name: 'Daily Flow reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  handlerConfigured = true;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return false;
  }

  const existing = await Notifications.getPermissionsAsync();

  if (existing.status === 'granted') {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: false,
    },
  });

  return requested.status === 'granted';
}

function buildRecord(
  localDate: string,
  type: NotificationType,
  notificationId: string,
): NotificationRecord {
  return {
    id: `${type}-${localDate}`,
    localDate,
    type,
    notificationId,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  };
}

async function cancelRecord(record: NotificationRecord | null) {
  const Notifications = await getNotifications();

  if (!Notifications || !record || record.status === 'canceled') {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(record.notificationId);
  await markNotificationRecordCanceled(record.localDate, record.type);
}

export async function cancelMissedReminderForDate(localDate: string) {
  const record = await getNotificationRecord(localDate, 'missed_checkin');
  await cancelRecord(record);
}

export async function scheduleLoggedNoReminder(profile: Profile, entry: DailyEntry) {
  const Notifications = await getNotifications();

  if (!Notifications || !profile.remindersEnabled || entry.hadBowelMovement) {
    return;
  }

  await cancelRecord(
    await getNotificationRecord(entry.localDate, 'logged_no_wellness'),
  );

  const copy = getReminderCopy(
    'logged_no_wellness',
    profile.privateNotifications,
  );
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: getLoggedNoReminderDate(),
      channelId: 'daily-flow-reminders',
    },
  });

  await upsertNotificationRecord(
    buildRecord(entry.localDate, 'logged_no_wellness', notificationId),
  );
}

async function restoreMissedReminderForDate(
  profile: Profile,
  localDate: string,
  now: Date,
) {
  const Notifications = await getNotifications();

  if (!Notifications || !profile.remindersEnabled) {
    return;
  }

  const target = getUpcomingMissedReminderTargets(profile, {
    from: now,
    days: 1,
  }).find((candidate) => candidate.localDate === localDate);

  if (!target) {
    return;
  }

  const existingRecord = await getNotificationRecord(
    localDate,
    'missed_checkin',
  );

  if (existingRecord?.status === 'scheduled') {
    return;
  }

  const copy = getReminderCopy('missed_checkin', profile.privateNotifications);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: target.fireDate,
      channelId: 'daily-flow-reminders',
    },
  });

  await upsertNotificationRecord(
    buildRecord(localDate, 'missed_checkin', notificationId),
  );
}

export async function rescheduleProfileNotifications(profile: Profile): Promise<boolean> {
  const Notifications = await getNotifications();

  if (!Notifications) {
    await clearNotificationRecords();
    return false;
  }

  await configureNotificationBehavior();
  const existingRecords = await getNotificationRecords();
  await Promise.all(
    existingRecords
      .filter((record) => record.status === 'scheduled')
      .map((record) =>
        Notifications.cancelScheduledNotificationAsync(record.notificationId),
      ),
  );
  await clearNotificationRecords();

  if (!profile.remindersEnabled) {
    return false;
  }

  const permitted = await ensureNotificationPermission();

  if (!permitted) {
    return false;
  }

  const dailyCopy = getReminderCopy(
    'daily_checkin',
    profile.privateNotifications,
  );
  const { hour, minute } = getDailyTriggerParts(profile);
  const dailyNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: dailyCopy.title,
      body: dailyCopy.body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: 'daily-flow-reminders',
    },
  });

  await upsertNotificationRecord(
    buildRecord('daily', 'daily_checkin', dailyNotificationId),
  );

  const entries = await getEntries(30);
  const loggedDates = new Set(entries.map((entry) => entry.localDate));
  const missedCopy = getReminderCopy(
    'missed_checkin',
    profile.privateNotifications,
  );

  for (const target of getUpcomingMissedReminderTargets(profile)) {
    if (loggedDates.has(target.localDate)) {
      continue;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: missedCopy.title,
        body: missedCopy.body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target.fireDate,
        channelId: 'daily-flow-reminders',
      },
    });

    await upsertNotificationRecord(
      buildRecord(target.localDate, 'missed_checkin', notificationId),
    );
  }

  return true;
}

export async function syncNotificationsAfterEntry(
  profile: Profile | null,
  entry: DailyEntry,
) {
  await cancelMissedReminderForDate(entry.localDate);

  if (!profile || !profile.remindersEnabled) {
    return;
  }

  await syncNotificationsForDate(profile, entry.localDate);
}

export async function syncNotificationsForDate(
  profile: Profile,
  localDate: string,
  now = new Date(),
) {
  const loggedNoRecord = await getNotificationRecord(
    localDate,
    'logged_no_wellness',
  );

  if (localDate !== getLocalDateKey(now) || !profile.remindersEnabled) {
    await cancelRecord(loggedNoRecord);
    return;
  }

  const dayEntries = await getEntriesByDate(localDate);

  if (dayEntries.length === 0) {
    await cancelRecord(loggedNoRecord);
    await restoreMissedReminderForDate(profile, localDate, now);
    return;
  }

  await cancelMissedReminderForDate(localDate);

  if (dayEntries.some((dayEntry) => dayEntry.hadBowelMovement)) {
    await cancelRecord(loggedNoRecord);
    return;
  }

  const latestEntry = dayEntries.at(-1);

  if (latestEntry) {
    await scheduleLoggedNoReminder(profile, latestEntry);
  }
}
