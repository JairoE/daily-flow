import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../services/notifications', () => ({
  configureNotificationBehavior: jest.fn(),
  rescheduleProfileNotifications: jest.fn(),
  syncNotificationsAfterEntry: jest.fn(),
}));
jest.mock('../services/exportEntries', () => ({
  exportEntriesCsv: jest.fn(),
}));
jest.mock('../storage/database', () => ({
  createProfile: jest.fn(),
  deleteAllData: jest.fn(),
  getAllEntries: jest.fn(),
  getEntries: jest.fn(),
  getProfile: jest.fn(),
  initializeStorage: jest.fn(),
  saveProfile: jest.fn(),
  upsertDailyEntry: jest.fn(),
}));

import { FlowBetterScreen, TodayScreen } from '../../App';
import type { Profile, TrendSummary } from '../types';

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
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};

const trends: TrendSummary = {
  yesLast7: 2,
  yesLast30: 10,
  missedLast7: 1,
  missedLast30: 4,
  daysSinceLastYes: 2,
  checkInRateLast7: 86,
  bowelMovementDaysLast30: 10,
  averagePerWeekLast30: 2.3,
  currentGapDays: 2,
  longestGapDays: 4,
  gapCount2Plus: 2,
  completedDaysLast30: 26,
  checkInRateLast30: 87,
  bristolDistribution: [],
  mostCommonBristolType: null,
  hardOrLumpyDays: 3,
  looseOrWateryDays: 1,
  symptomCounts: {
    straining: 2,
    pain: 1,
    bloating: 4,
    incompleteEvacuation: 2,
  },
  symptomBurdenDays: 6,
  laxativeUseDays: 2,
  noteDays: 1,
  detailDays: 12,
  weeklyFrequency: [],
  rolling7: [],
  intervals: [],
};

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe('Flow Better screen', () => {
  it('keeps the Today screen focused on daily logging', () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(TodayScreen, {
          entry: null,
          includeTodayAsMissed: false,
          onLog: async () => undefined,
        }),
      );
    });

    expect(renderedText(renderer!)).not.toContain('Gentle wellness note');
  });

  it('owns the wellness note and question experience', () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-16',
          profile,
          trends,
        }),
      );
    });

    const text = renderedText(renderer!);

    expect(text).toContain('Gentle wellness note');
    expect(text).toContain('Ask about your flow');
  });
});
