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
const mockUpsertNotificationRecord = storageMocks.upsertNotificationRecord;

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

function record(
  type: NotificationType,
  localDate = '2026-07-17',
  status: 'scheduled' | 'canceled' = 'scheduled',
) {
  return {
    id: `${type}-${localDate}`,
    localDate,
    type,
    notificationId: `${type}-notification`,
    status,
    createdAt: '2026-07-17T12:00:00.000Z',
  };
}

describe('multi-entry notification synchronization', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 17, 12));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleNotificationAsync.mockResolvedValue('new-logged-no');
    mockGetNotificationRecord.mockImplementation(
      async (localDate: string, type: NotificationType) =>
        record(type, localDate),
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

  it('does not schedule a logged-No reminder for a historical date', async () => {
    await syncNotificationsForDate(profile, '2026-07-16');

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'logged_no_wellness-notification',
    );
    expect(mockGetEntriesByDate).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("restores an upcoming missed reminder after today's final event is deleted", async () => {
    mockGetEntriesByDate.mockResolvedValueOnce([]);
    mockGetNotificationRecord.mockImplementation(
      async (localDate: string, type: NotificationType) =>
        record(
          type,
          localDate,
          type === 'missed_checkin' ? 'canceled' : 'scheduled',
        ),
    );

    await syncNotificationsForDate(profile, '2026-07-17');

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'logged_no_wellness-notification',
    );
    expect(mockUpsertNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        localDate: '2026-07-17',
        type: 'missed_checkin',
      }),
    );
    const scheduledRequest = mockScheduleNotificationAsync.mock.calls[0][0];
    const fireDate = scheduledRequest.trigger?.date as Date;
    expect(fireDate).toBeInstanceOf(Date);
    expect([
      fireDate.getFullYear(),
      fireDate.getMonth(),
      fireDate.getDate(),
      fireDate.getHours(),
      fireDate.getMinutes(),
    ]).toEqual([2026, 6, 17, 22, 0]);
  });
});
