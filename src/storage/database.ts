import * as SQLite from 'expo-sqlite';

import type {
  DailyEntry,
  DailyEntryInput,
  DailySymptoms,
  NotificationRecord,
  NotificationType,
  Profile,
  StoolType,
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
  daily_open_love_shown_date: string | null;
  created_at: string;
  updated_at: string;
};

type DailyEntryRow = {
  id: string;
  local_date: string;
  had_bowel_movement: number;
  details_recorded: number;
  stool_type: number | null;
  symptom_straining: number;
  symptom_pain: number;
  symptom_bloating: number;
  symptom_incomplete_evacuation: number;
  laxative_used: number;
  laxative_note: string;
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
  daily_open_love_shown_date TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_entries (
  id TEXT PRIMARY KEY NOT NULL,
  local_date TEXT NOT NULL UNIQUE,
  had_bowel_movement INTEGER NOT NULL,
  details_recorded INTEGER NOT NULL DEFAULT 0,
  stool_type INTEGER NULL,
  symptom_straining INTEGER NOT NULL DEFAULT 0,
  symptom_pain INTEGER NOT NULL DEFAULT 0,
  symptom_bloating INTEGER NOT NULL DEFAULT 0,
  symptom_incomplete_evacuation INTEGER NOT NULL DEFAULT 0,
  laxative_used INTEGER NOT NULL DEFAULT 0,
  laxative_note TEXT NOT NULL DEFAULT '',
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

const defaultSymptoms: DailySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

const profileMigrations: { name: string; sql: string }[] = [
  {
    name: 'daily_open_love_shown_date',
    sql: 'ALTER TABLE profile ADD COLUMN daily_open_love_shown_date TEXT NULL',
  },
];

const dailyEntryMigrations: { name: string; sql: string }[] = [
  {
    name: 'details_recorded',
    sql: 'ALTER TABLE daily_entries ADD COLUMN details_recorded INTEGER NOT NULL DEFAULT 0',
  },
  {
    name: 'stool_type',
    sql: 'ALTER TABLE daily_entries ADD COLUMN stool_type INTEGER NULL',
  },
  {
    name: 'symptom_straining',
    sql: 'ALTER TABLE daily_entries ADD COLUMN symptom_straining INTEGER NOT NULL DEFAULT 0',
  },
  {
    name: 'symptom_pain',
    sql: 'ALTER TABLE daily_entries ADD COLUMN symptom_pain INTEGER NOT NULL DEFAULT 0',
  },
  {
    name: 'symptom_bloating',
    sql: 'ALTER TABLE daily_entries ADD COLUMN symptom_bloating INTEGER NOT NULL DEFAULT 0',
  },
  {
    name: 'symptom_incomplete_evacuation',
    sql: 'ALTER TABLE daily_entries ADD COLUMN symptom_incomplete_evacuation INTEGER NOT NULL DEFAULT 0',
  },
  {
    name: 'laxative_used',
    sql: 'ALTER TABLE daily_entries ADD COLUMN laxative_used INTEGER NOT NULL DEFAULT 0',
  },
  {
    name: 'laxative_note',
    sql: "ALTER TABLE daily_entries ADD COLUMN laxative_note TEXT NOT NULL DEFAULT ''",
  },
];

function isStoolType(value: number | null): value is StoolType {
  return (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7
  );
}

function normalizeSymptoms(input?: Partial<DailySymptoms>): DailySymptoms {
  return {
    straining: input?.straining ?? false,
    pain: input?.pain ?? false,
    bloating: input?.bloating ?? false,
    incompleteEvacuation: input?.incompleteEvacuation ?? false,
  };
}

function normalizeEntryInput(input: DailyEntryInput) {
  const symptoms = normalizeSymptoms(input.symptoms);
  const trimmedNote = (input.laxativeNote ?? '').trim().slice(0, 160);

  return {
    hadBowelMovement: input.hadBowelMovement,
    detailsRecorded: true,
    stoolType:
      input.hadBowelMovement && input.stoolType ? input.stoolType : null,
    symptoms,
    laxativeUsed: input.laxativeUsed ?? false,
    laxativeNote: trimmedNote,
  };
}

async function migrateDailyEntryColumns(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(daily_entries)',
  );
  const existingColumns = new Set(columns.map((column) => column.name));

  for (const migration of dailyEntryMigrations) {
    if (!existingColumns.has(migration.name)) {
      await db.execAsync(migration.sql);
    }
  }
}

async function migrateProfileColumns(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(profile)',
  );
  const existingColumns = new Set(columns.map((column) => column.name));

  for (const migration of profileMigrations) {
    if (!existingColumns.has(migration.name)) {
      await db.execAsync(migration.sql);
    }
  }
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('daily-flow.db').then(async (db) => {
      await db.execAsync(schema);
      await migrateProfileColumns(db);
      await migrateDailyEntryColumns(db);
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
    dailyOpenLoveShownDate: row.daily_open_love_shown_date ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntry(row: DailyEntryRow): DailyEntry {
  return {
    id: row.id,
    localDate: row.local_date,
    hadBowelMovement: row.had_bowel_movement === 1,
    detailsRecorded: row.details_recorded === 1,
    stoolType: isStoolType(row.stool_type) ? row.stool_type : null,
    symptoms: {
      straining: row.symptom_straining === 1,
      pain: row.symptom_pain === 1,
      bloating: row.symptom_bloating === 1,
      incompleteEvacuation: row.symptom_incomplete_evacuation === 1,
    },
    laxativeUsed: row.laxative_used === 1,
    laxativeNote: row.laxative_note ?? '',
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
    dailyOpenLoveShownDate: null,
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
      daily_open_love_shown_date,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      timezone = excluded.timezone,
      check_in_time = excluded.check_in_time,
      reminders_enabled = excluded.reminders_enabled,
      private_notifications = excluded.private_notifications,
      privacy_lock_enabled = excluded.privacy_lock_enabled,
      daily_open_love_shown_date = excluded.daily_open_love_shown_date,
      updated_at = excluded.updated_at`,
    [
      nextProfile.id,
      nextProfile.displayName,
      nextProfile.timezone,
      nextProfile.checkInTime,
      nextProfile.remindersEnabled ? 1 : 0,
      nextProfile.privateNotifications ? 1 : 0,
      nextProfile.privacyLockEnabled ? 1 : 0,
      nextProfile.dailyOpenLoveShownDate,
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

export async function getAllEntries(): Promise<DailyEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DailyEntryRow>(
    `SELECT * FROM daily_entries
     ORDER BY local_date ASC`,
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
  input: DailyEntryInput,
): Promise<DailyEntry> {
  const now = new Date().toISOString();
  const existing = await getEntryByDate(localDate);
  const normalized = normalizeEntryInput(input);
  const entry: DailyEntry = {
    id: existing?.id ?? `entry-${localDate}`,
    localDate,
    hadBowelMovement: normalized.hadBowelMovement,
    detailsRecorded: normalized.detailsRecorded,
    stoolType: normalized.stoolType,
    symptoms: normalized.symptoms,
    laxativeUsed: normalized.laxativeUsed,
    laxativeNote: normalized.laxativeNote,
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
      details_recorded,
      stool_type,
      symptom_straining,
      symptom_pain,
      symptom_bloating,
      symptom_incomplete_evacuation,
      laxative_used,
      laxative_note,
      checked_in_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_date) DO UPDATE SET
      had_bowel_movement = excluded.had_bowel_movement,
      details_recorded = excluded.details_recorded,
      stool_type = excluded.stool_type,
      symptom_straining = excluded.symptom_straining,
      symptom_pain = excluded.symptom_pain,
      symptom_bloating = excluded.symptom_bloating,
      symptom_incomplete_evacuation = excluded.symptom_incomplete_evacuation,
      laxative_used = excluded.laxative_used,
      laxative_note = excluded.laxative_note,
      checked_in_at = excluded.checked_in_at,
      updated_at = excluded.updated_at`,
    [
      entry.id,
      entry.localDate,
      entry.hadBowelMovement ? 1 : 0,
      entry.detailsRecorded ? 1 : 0,
      entry.stoolType,
      entry.symptoms.straining ? 1 : 0,
      entry.symptoms.pain ? 1 : 0,
      entry.symptoms.bloating ? 1 : 0,
      entry.symptoms.incompleteEvacuation ? 1 : 0,
      entry.laxativeUsed ? 1 : 0,
      entry.laxativeNote,
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
