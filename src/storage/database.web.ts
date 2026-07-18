import type {
  DailyEntry,
  DailyEntryInput,
  DailySymptoms,
  NotificationRecord,
  NotificationType,
  Profile,
  StoolType,
} from '../types';
import { compareDailyEntries } from '../lib/dailyEntries';

const PROFILE_ID = 'local-profile';
const WEB_STORAGE_KEY = 'daily-flow-state-v1';
let entryIdCounter = 0;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoolType(value: unknown): value is StoolType {
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

function normalizeEntry(rawEntry: DailyEntry): DailyEntry {
  const raw = rawEntry as DailyEntry & {
    detailsRecorded?: boolean;
    stoolType?: unknown;
    symptoms?: Partial<DailySymptoms>;
    laxativeUsed?: boolean;
    laxativeNote?: string;
  };

  return {
    ...rawEntry,
    detailsRecorded: raw.detailsRecorded ?? false,
    stoolType: isStoolType(raw.stoolType) ? raw.stoolType : null,
    symptoms: normalizeSymptoms(raw.symptoms),
    laxativeUsed: raw.laxativeUsed ?? false,
    laxativeNote: raw.laxativeNote ?? '',
  };
}

function normalizeProfile(rawProfile: Profile | null | undefined): Profile | null {
  if (!rawProfile) {
    return null;
  }

  const raw = rawProfile as Profile & {
    llmWellnessNotesEnabled?: boolean;
    llmWellnessNoteEndpoint?: string;
    llmWellnessNoteAccessToken?: string;
  };

  return {
    ...rawProfile,
    llmWellnessNotesEnabled: raw.llmWellnessNotesEnabled ?? false,
    llmWellnessNoteEndpoint: raw.llmWellnessNoteEndpoint ?? '',
    llmWellnessNoteAccessToken: raw.llmWellnessNoteAccessToken ?? '',
    dailyOpenLoveShownDate: rawProfile.dailyOpenLoveShownDate ?? null,
  };
}

function normalizeEntryInput(input: DailyEntryInput) {
  return {
    hadBowelMovement: input.hadBowelMovement,
    detailsRecorded: true,
    stoolType:
      input.hadBowelMovement && input.stoolType ? input.stoolType : null,
    symptoms: normalizeSymptoms(input.symptoms),
    laxativeUsed: input.laxativeUsed ?? false,
    laxativeNote: (input.laxativeNote ?? '').trim().slice(0, 160),
  };
}

function createEntryId(localDate: string, now: string): string {
  entryIdCounter += 1;
  const sequence = entryIdCounter.toString().padStart(6, '0');
  const entropy = Math.random().toString(36).slice(2, 10);
  return `entry-${localDate}-${now}-${sequence}-${entropy}`;
}

function compareEntriesByDateAscending(a: DailyEntry, b: DailyEntry): number {
  return a.localDate.localeCompare(b.localDate) || compareDailyEntries(a, b);
}

function compareEntriesByDateDescending(a: DailyEntry, b: DailyEntry): number {
  return b.localDate.localeCompare(a.localDate) || compareDailyEntries(a, b);
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
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      return emptyState();
    }

    const state = parsed as WebState;

    return {
      profile: normalizeProfile(state.profile),
      entries: Array.isArray(state.entries)
        ? state.entries.map(normalizeEntry)
        : [],
      notificationRecords: Array.isArray(state.notificationRecords)
        ? state.notificationRecords
        : [],
    };
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
    llmWellnessNotesEnabled: false,
    llmWellnessNoteEndpoint: '',
    llmWellnessNoteAccessToken: '',
    dailyOpenLoveShownDate: null,
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
  const entries = [...readState().entries].sort(compareEntriesByDateDescending);
  const includedDates = new Set<string>();

  for (const entry of entries) {
    if (includedDates.size >= limit && !includedDates.has(entry.localDate)) {
      continue;
    }

    includedDates.add(entry.localDate);
  }

  return entries.filter((entry) => includedDates.has(entry.localDate));
}

export async function getAllEntries(): Promise<DailyEntry[]> {
  return [...readState().entries].sort(compareEntriesByDateAscending);
}

export async function getEntriesByDate(
  localDate: string,
): Promise<DailyEntry[]> {
  return readState()
    .entries.filter((entry) => entry.localDate === localDate)
    .sort(compareDailyEntries);
}

export async function createDailyEntry(
  localDate: string,
  input: DailyEntryInput,
): Promise<DailyEntry> {
  const now = new Date().toISOString();
  const normalized = normalizeEntryInput(input);
  const entry: DailyEntry = {
    id: createEntryId(localDate, now),
    localDate,
    hadBowelMovement: normalized.hadBowelMovement,
    detailsRecorded: normalized.detailsRecorded,
    stoolType: normalized.stoolType,
    symptoms: normalized.symptoms,
    laxativeUsed: normalized.laxativeUsed,
    laxativeNote: normalized.laxativeNote,
    checkedInAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const state = readState();

  writeState({
    ...state,
    entries: [...state.entries, entry],
  });

  return entry;
}

export async function updateDailyEntry(
  id: string,
  input: DailyEntryInput,
): Promise<DailyEntry | null> {
  const state = readState();
  const existing = state.entries.find((entry) => entry.id === id);

  if (!existing) {
    return null;
  }

  const normalized = normalizeEntryInput(input);
  const updated: DailyEntry = {
    ...existing,
    hadBowelMovement: normalized.hadBowelMovement,
    detailsRecorded: normalized.detailsRecorded,
    stoolType: normalized.stoolType,
    symptoms: normalized.symptoms,
    laxativeUsed: normalized.laxativeUsed,
    laxativeNote: normalized.laxativeNote,
    updatedAt: new Date().toISOString(),
  };

  writeState({
    ...state,
    entries: state.entries.map((entry) => (entry.id === id ? updated : entry)),
  });

  return updated;
}

export async function deleteDailyEntry(id: string): Promise<boolean> {
  const state = readState();
  const nextEntries = state.entries.filter((entry) => entry.id !== id);

  if (nextEntries.length === state.entries.length) {
    return false;
  }

  writeState({ ...state, entries: nextEntries });
  return true;
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
