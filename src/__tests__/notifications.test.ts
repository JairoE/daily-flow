jest.mock('../storage/database', () => ({
  clearNotificationRecords: jest.fn(),
  getEntries: jest.fn(),
  getEntriesByDate: jest.fn(),
  getNotificationRecord: jest.fn(),
  getNotificationRecords: jest.fn(),
  markNotificationRecordCanceled: jest.fn(),
  upsertNotificationRecord: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

const storageMocks = jest.requireMock('../storage/database') as {
  getEntriesByDate: jest.Mock;
  getNotificationRecord: jest.Mock;
  markNotificationRecordCanceled: jest.Mock;
  upsertNotificationRecord: jest.Mock;
};
const notificationMocks = jest.requireMock('expo-notifications') as {
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
};
const mockGetEntriesByDate = storageMocks.getEntriesByDate;
const mockGetNotificationRecord = storageMocks.getNotificationRecord;
const mockScheduleNotificationAsync =
  notificationMocks.scheduleNotificationAsync;
const mockCancelScheduledNotificationAsync =
  notificationMocks.cancelScheduledNotificationAsync;

import {
  syncNotificationsAfterEntry,
  syncNotificationsForDate,
} from '../services/notifications';
import type { DailyEntry, NotificationType, Profile } from '../types';

const profile: Profile = {
  id: 'local-profile',
  displayName: 'Friend',
  timezone: 'America/New_York',
  checkInTime: '20:00',
  remindersEnabled: true,
  privateNotifications: true,
  privacyLockEnabled: false,
  llmWellnessNotesEnabled: false,
  llmWellnessNoteEndpoint: '',
  llmWellnessNoteAccessToken: '',
  dailyOpenLoveShownDate: null,
  createdAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-17T12:00:00.000Z',
};

function entry(id: string, hadBowelMovement: boolean): DailyEntry {
  return {
    id,
    localDate: '2026-07-17',
    hadBowelMovement,
    detailsRecorded: true,
    stoolType: hadBowelMovement ? 4 : null,
    symptoms: {
      straining: false,
      pain: false,
      bloating: false,
      incompleteEvacuation: false,
    },
    laxativeUsed: false,
    laxativeNote: '',
    checkedInAt: `2026-07-17T${id}.000Z`,
    createdAt: '2026-07-17T12:00:00.000Z',
    updatedAt: '2026-07-17T12:00:00.000Z',
  };
}

function record(type: NotificationType) {
  return {
    id: `${type}-2026-07-17`,
    localDate: '2026-07-17',
    type,
    notificationId: `${type}-notification`,
    status: 'scheduled' as const,
    createdAt: '2026-07-17T12:00:00.000Z',
  };
}

describe('multi-entry notification synchronization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleNotificationAsync.mockResolvedValue('new-logged-no');
    mockGetNotificationRecord.mockImplementation(
      async (_localDate: string, type: NotificationType) => record(type),
    );
  });

  it('schedules after only No entries, cancels after Yes, and does not reschedule', async () => {
    const firstNo = entry('08:00:00', false);
    const yes = entry('13:00:00', true);
    const laterNo = entry('18:00:00', false);

    mockGetEntriesByDate.mockResolvedValueOnce([firstNo]);
    await syncNotificationsAfterEntry(profile, firstNo);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);

    mockGetEntriesByDate.mockResolvedValueOnce([firstNo, yes]);
    await syncNotificationsAfterEntry(profile, yes);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'logged_no_wellness-notification',
    );

    mockGetEntriesByDate.mockResolvedValueOnce([firstNo, yes, laterNo]);
    await syncNotificationsAfterEntry(profile, laterNo);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('still cancels a missed reminder after reminders were disabled', async () => {
    await syncNotificationsAfterEntry(
      { ...profile, remindersEnabled: false },
      entry('08:00:00', false),
    );

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'missed_checkin-notification',
    );
    expect(mockGetEntriesByDate).not.toHaveBeenCalled();
  });

  it('cancels a logged-No reminder after the final event is deleted', async () => {
    mockGetEntriesByDate.mockResolvedValueOnce([]);

    await syncNotificationsForDate(profile, '2026-07-17');

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'logged_no_wellness-notification',
    );
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
