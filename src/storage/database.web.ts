import type {
  DailyEntry,
  NotificationRecord,
  NotificationType,
  Profile,
} from '../types';

const PROFILE_ID = 'local-profile';
const WEB_STORAGE_KEY = 'daily-flow-state-v1';

type WebState = {
  profile: Profile | null;
  entries: DailyEntry[];
  notificationRecords: NotificationRecord[];
};

function emptyState(): WebState {
  return {
    profile: null,
    entries: [],
    notificationRecords: [],
  };
}

function readState(): WebState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return emptyState();
  }

  const raw = window.localStorage.getItem(WEB_STORAGE_KEY);

  if (!raw) {
    return emptyState();
  }

  try {
    return JSON.parse(raw) as WebState;
  } catch {
    return emptyState();
  }
}

function writeState(state: WebState) {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(state));
  }
}

export async function initializeStorage() {
  readState();
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
  return readState().profile;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const nextProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
  const state = readState();

  writeState({ ...state, profile: nextProfile });
  return nextProfile;
}

export async function getEntries(limit = 30): Promise<DailyEntry[]> {
  return readState()
    .entries.sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, limit);
}

export async function getEntryByDate(
  localDate: string,
): Promise<DailyEntry | null> {
  return readState().entries.find((entry) => entry.localDate === localDate) ?? null;
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
  const state = readState();

  writeState({
    ...state,
    entries: [
      entry,
      ...state.entries.filter((item) => item.localDate !== localDate),
    ],
  });

  return entry;
}

export async function getNotificationRecords(): Promise<NotificationRecord[]> {
  return readState().notificationRecords;
}

export async function getNotificationRecord(
  localDate: string,
  type: NotificationType,
): Promise<NotificationRecord | null> {
  return (
    readState().notificationRecords.find(
      (record) => record.localDate === localDate && record.type === type,
    ) ?? null
  );
}

export async function upsertNotificationRecord(
  record: NotificationRecord,
): Promise<void> {
  const state = readState();

  writeState({
    ...state,
    notificationRecords: [
      record,
      ...state.notificationRecords.filter(
        (item) => !(item.localDate === record.localDate && item.type === record.type),
      ),
    ],
  });
}

export async function clearNotificationRecords(): Promise<void> {
  const state = readState();
  writeState({ ...state, notificationRecords: [] });
}

export async function markNotificationRecordCanceled(
  localDate: string,
  type: NotificationType,
): Promise<void> {
  const state = readState();

  writeState({
    ...state,
    notificationRecords: state.notificationRecords.map((record) =>
      record.localDate === localDate && record.type === type
        ? { ...record, status: 'canceled' }
        : record,
    ),
  });
}

export async function deleteAllData(): Promise<void> {
  writeState(emptyState());
}
