import * as SQLite from 'expo-sqlite';

import type {
  DailyEntry,
  NotificationRecord,
  NotificationType,
  Profile,
} from '../types';

const PROFILE_ID = 'local-profile';

type ProfileRow = {
  id: string;
  display_name: string;
  timezone: string;
  check_in_time: string;
  reminders_enabled: number;
  private_notifications: number;
  privacy_lock_enabled: number;
  created_at: string;
  updated_at: string;
};

type DailyEntryRow = {
  id: string;
  local_date: string;
  had_bowel_movement: number;
  checked_in_at: string;
  created_at: string;
  updated_at: string;
};

type NotificationRecordRow = {
  id: string;
  local_date: string;
  type: NotificationType;
  notification_id: string;
  status: NotificationRecord['status'];
  created_at: string;
};

const schema = `
CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  check_in_time TEXT NOT NULL,
  reminders_enabled INTEGER NOT NULL,
  private_notifications INTEGER NOT NULL,
  privacy_lock_enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_entries (
  id TEXT PRIMARY KEY NOT NULL,
  local_date TEXT NOT NULL UNIQUE,
  had_bowel_movement INTEGER NOT NULL,
  checked_in_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_records (
  id TEXT PRIMARY KEY NOT NULL,
  local_date TEXT NOT NULL,
  type TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_records_date_type_idx
ON notification_records(local_date, type);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('daily-flow.db').then(async (db) => {
      await db.execAsync(schema);
      return db;
    });
  }

  return dbPromise;
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    timezone: row.timezone,
    checkInTime: row.check_in_time,
    remindersEnabled: row.reminders_enabled === 1,
    privateNotifications: row.private_notifications === 1,
    privacyLockEnabled: row.privacy_lock_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntry(row: DailyEntryRow): DailyEntry {
  return {
    id: row.id,
    localDate: row.local_date,
    hadBowelMovement: row.had_bowel_movement === 1,
    checkedInAt: row.checked_in_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNotificationRecord(row: NotificationRecordRow): NotificationRecord {
  return {
    id: row.id,
    localDate: row.local_date,
    type: row.type,
    notificationId: row.notification_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function initializeStorage() {
  await getDatabase();
}

export function createProfile(values: {
  displayName: string;
  checkInTime: string;
  remindersEnabled: boolean;
  privateNotifications: boolean;
}): Profile {
  const now = new Date().toISOString();

  return {
    id: PROFILE_ID,
    displayName: values.displayName.trim() || 'Friend',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local',
    checkInTime: values.checkInTime,
    remindersEnabled: values.remindersEnabled,
    privateNotifications: values.privateNotifications,
    privacyLockEnabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProfileRow>(
    'SELECT * FROM profile LIMIT 1',
  );

  return row ? mapProfile(row) : null;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const nextProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO profile (
      id,
      display_name,
      timezone,
      check_in_time,
      reminders_enabled,
      private_notifications,
      privacy_lock_enabled,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      timezone = excluded.timezone,
      check_in_time = excluded.check_in_time,
      reminders_enabled = excluded.reminders_enabled,
      private_notifications = excluded.private_notifications,
      privacy_lock_enabled = excluded.privacy_lock_enabled,
      updated_at = excluded.updated_at`,
    [
      nextProfile.id,
      nextProfile.displayName,
      nextProfile.timezone,
      nextProfile.checkInTime,
      nextProfile.remindersEnabled ? 1 : 0,
      nextProfile.privateNotifications ? 1 : 0,
      nextProfile.privacyLockEnabled ? 1 : 0,
      nextProfile.createdAt,
      nextProfile.updatedAt,
    ],
  );

  return nextProfile;
}

export async function getEntries(limit = 30): Promise<DailyEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DailyEntryRow>(
    `SELECT * FROM daily_entries
     ORDER BY local_date DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map(mapEntry);
}

export async function getEntryByDate(
  localDate: string,
): Promise<DailyEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DailyEntryRow>(
    'SELECT * FROM daily_entries WHERE local_date = ? LIMIT 1',
    [localDate],
  );

  return row ? mapEntry(row) : null;
}

export async function upsertDailyEntry(
  localDate: string,
  hadBowelMovement: boolean,
): Promise<DailyEntry> {
  const now = new Date().toISOString();
  const existing = await getEntryByDate(localDate);
  const entry: DailyEntry = {
    id: existing?.id ?? `entry-${localDate}`,
    localDate,
    hadBowelMovement,
    checkedInAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO daily_entries (
      id,
      local_date,
      had_bowel_movement,
      checked_in_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_date) DO UPDATE SET
      had_bowel_movement = excluded.had_bowel_movement,
      checked_in_at = excluded.checked_in_at,
      updated_at = excluded.updated_at`,
    [
      entry.id,
      entry.localDate,
      entry.hadBowelMovement ? 1 : 0,
      entry.checkedInAt,
      entry.createdAt,
      entry.updatedAt,
    ],
  );

  return entry;
}

export async function getNotificationRecords(): Promise<NotificationRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<NotificationRecordRow>(
    'SELECT * FROM notification_records ORDER BY created_at DESC',
  );

  return rows.map(mapNotificationRecord);
}

export async function getNotificationRecord(
  localDate: string,
  type: NotificationType,
): Promise<NotificationRecord | null> {
  const records = await getNotificationRecords();
  return (
    records.find(
      (record) => record.localDate === localDate && record.type === type,
    ) ?? null
  );
}

export async function upsertNotificationRecord(
  record: NotificationRecord,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO notification_records (
      id,
      local_date,
      type,
      notification_id,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_date, type) DO UPDATE SET
      notification_id = excluded.notification_id,
      status = excluded.status,
      created_at = excluded.created_at`,
    [
      record.id,
      record.localDate,
      record.type,
      record.notificationId,
      record.status,
      record.createdAt,
    ],
  );
}

export async function clearNotificationRecords(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM notification_records');
}

export async function markNotificationRecordCanceled(
  localDate: string,
  type: NotificationType,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE notification_records
     SET status = 'canceled'
     WHERE local_date = ? AND type = ?`,
    [localDate, type],
  );
}

export async function deleteAllData(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
    DELETE FROM notification_records;
    DELETE FROM daily_entries;
    DELETE FROM profile;
  `);
}
