import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';

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
jest.mock('../lib/llmWellnessNotes', () => ({
  ...jest.requireActual('../lib/llmWellnessNotes'),
  requestLlmWellnessNote: jest.fn(async () => null),
}));
jest.mock('../lib/llmWellnessQuestions', () => ({
  ...jest.requireActual('../lib/llmWellnessQuestions'),
  requestLlmWellnessAnswer: jest.fn(),
}));

import { FlowBetterScreen, TodayScreen } from '../../App';
import { requestLlmWellnessAnswer } from '../lib/llmWellnessQuestions';
import type { Profile, TrendSummary } from '../types';

const mockRequestLlmWellnessAnswer =
  requestLlmWellnessAnswer as jest.MockedFunction<
    typeof requestLlmWellnessAnswer
  >;

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
  bowelMovementCountLast30: 10,
  bowelMovementDaysLast30: 10,
  averageBowelMovementsPerWeekLast30: 2.3,
  currentGapDays: 2,
  longestGapDays: 4,
  gapCount2Plus: 2,
  completedDaysLast30: 26,
  checkInRateLast30: 87,
  bristolDistribution: [],
  mostCommonBristolType: null,
  hardOrLumpyMovementsLast30: 3,
  looseOrWateryMovementsLast30: 1,
  symptomCounts: {
    straining: 2,
    pain: 1,
    bloating: 4,
    incompleteEvacuation: 2,
  },
  symptomBurdenEntriesLast30: 6,
  laxativeUseEntriesLast30: 2,
  noteEntriesLast30: 1,
  detailEntriesLast30: 12,
  weeklyFrequency: [],
  rolling7: [],
  intervals: [],
};

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe('Flow Better screen', () => {
  beforeEach(() => {
    mockRequestLlmWellnessAnswer.mockReset();
  });

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

  it('keeps a pending answer aligned with its submitted question', async () => {
    let resolveAnswer: (
      result: Awaited<ReturnType<typeof requestLlmWellnessAnswer>>,
    ) => void = () => undefined;
    mockRequestLlmWellnessAnswer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve;
        }),
    );
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-16',
          profile: {
            ...profile,
            llmWellnessNotesEnabled: true,
            llmWellnessNoteEndpoint:
              'https://example.ngrok.app/wellness-note',
            llmWellnessNoteAccessToken: 'test-token',
          },
          trends,
        }),
      );
    });

    const input = renderer!.root.findByType(TextInput);

    act(() => {
      input.props.onChangeText('What may support regularity?');
    });

    const askButton = renderer!.root.findByProps({
      accessibilityLabel: 'Ask',
    });

    await act(async () => {
      askButton.props.onPress();
      await Promise.resolve();
    });

    expect(renderer!.root.findByType(TextInput).props.editable).toBe(false);

    await act(async () => {
      resolveAnswer({ ok: true, answer: 'A gentle answer.' });
      await Promise.resolve();
    });

    expect(renderedText(renderer!)).toContain('A gentle answer.');

    act(() => {
      renderer!.root
        .findByType(TextInput)
        .props.onChangeText('What about hydration?');
    });

    expect(renderedText(renderer!)).not.toContain('A gentle answer.');
  });
});
