import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';

jest.mock('../services/notifications', () => ({
  configureNotificationBehavior: jest.fn(),
  rescheduleProfileNotifications: jest.fn(),
  syncNotificationsAfterEntry: jest.fn(),
  syncNotificationsForDate: jest.fn(),
}));
jest.mock('../services/exportEntries', () => ({
  exportEntriesCsv: jest.fn(),
}));
jest.mock('../storage/database', () => ({
  createDailyEntry: jest.fn(),
  createProfile: jest.fn(),
  createWellnessQuestionHistoryEntry: jest.fn(),
  deleteAllData: jest.fn(),
  deleteDailyEntry: jest.fn(),
  getAllEntries: jest.fn(),
  getEntries: jest.fn(),
  getEntriesByDate: jest.fn(),
  getProfile: jest.fn(),
  getWellnessQuestionHistory: jest.fn(),
  initializeStorage: jest.fn(),
  saveProfile: jest.fn(),
  updateDailyEntry: jest.fn(),
}));
jest.mock('../lib/llmWellnessNotes', () => ({
  ...jest.requireActual('../lib/llmWellnessNotes'),
  requestLlmWellnessNote: jest.fn(async () => null),
}));
jest.mock('../lib/llmWellnessQuestions', () => ({
  ...jest.requireActual('../lib/llmWellnessQuestions'),
  requestLlmWellnessAnswer: jest.fn(),
}));

import App, {
  FlowBetterScreen,
  HistoryScreen,
  SettingsScreen,
  TodayScreen,
} from '../../App';
import { requestLlmWellnessAnswer } from '../lib/llmWellnessQuestions';
import { formatWellnessQuestionAskedAt } from '../lib/questionHistory';
import {
  configureNotificationBehavior,
  rescheduleProfileNotifications,
  syncNotificationsAfterEntry,
} from '../services/notifications';
import {
  createDailyEntry,
  createWellnessQuestionHistoryEntry,
  getEntries,
  getProfile,
  getWellnessQuestionHistory,
  initializeStorage,
} from '../storage/database';
import type { DailyEntry, Profile, TrendSummary } from '../types';

const mockRequestLlmWellnessAnswer =
  requestLlmWellnessAnswer as jest.MockedFunction<
    typeof requestLlmWellnessAnswer
  >;
const mockCreateWellnessQuestionHistoryEntry =
  createWellnessQuestionHistoryEntry as jest.MockedFunction<
    typeof createWellnessQuestionHistoryEntry
  >;
const mockGetWellnessQuestionHistory =
  getWellnessQuestionHistory as jest.MockedFunction<
    typeof getWellnessQuestionHistory
  >;
const mockConfigureNotificationBehavior =
  configureNotificationBehavior as jest.MockedFunction<
    typeof configureNotificationBehavior
  >;
const mockRescheduleProfileNotifications =
  rescheduleProfileNotifications as jest.MockedFunction<
    typeof rescheduleProfileNotifications
  >;
const mockSyncNotificationsAfterEntry =
  syncNotificationsAfterEntry as jest.MockedFunction<
    typeof syncNotificationsAfterEntry
  >;
const mockCreateDailyEntry = createDailyEntry as jest.MockedFunction<
  typeof createDailyEntry
>;
const mockGetEntries = getEntries as jest.MockedFunction<typeof getEntries>;
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;
const mockInitializeStorage = initializeStorage as jest.MockedFunction<
  typeof initializeStorage
>;
const originalConsoleWarn = console.warn.bind(console);
let consoleWarnSpy: jest.SpyInstance;

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

function renderedQuestionHistoryIds(
  renderer: ReactTestRenderer,
): string[] {
  return [
    ...new Set(
      renderer.root
        .findAll(
          (node) =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('question-history-'),
        )
        .map((node) => node.props.testID as string),
    ),
  ];
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function dailyEntry(
  id: string,
  checkedInAt: string,
  hadBowelMovement: boolean,
): DailyEntry {
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
    checkedInAt,
    createdAt: checkedInAt,
    updatedAt: checkedInAt,
  };
}

function questionHistoryEntry(
  id: string,
  question: string,
  answer: string,
  askedAt: string,
) {
  return { id, question, answer, askedAt };
}

describe('Flow Better screen', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 17, 12));
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation((...args) => {
      if (!String(args[0]).includes('SafeAreaView has been deprecated')) {
        originalConsoleWarn(...args);
      }
    });
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestLlmWellnessAnswer.mockReset();
    mockConfigureNotificationBehavior.mockReset();
    mockRescheduleProfileNotifications.mockReset();
    mockSyncNotificationsAfterEntry.mockReset();
    mockCreateDailyEntry.mockReset();
    mockCreateWellnessQuestionHistoryEntry.mockReset();
    mockGetEntries.mockReset();
    mockGetProfile.mockReset();
    mockGetWellnessQuestionHistory.mockReset();
    mockInitializeStorage.mockReset();
    mockGetWellnessQuestionHistory.mockResolvedValue([]);
    mockCreateWellnessQuestionHistoryEntry.mockImplementation(
      async (question, answer) => ({
        id: 'saved-history',
        question,
        answer,
        askedAt: '2026-07-20T19:42:00.000Z',
      }),
    );
  });

  it('keeps the Today screen focused on daily logging', () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(TodayScreen, {
          entries: [],
          includeTodayAsMissed: false,
          onLog: async () => undefined,
        }),
      );
    });

    expect(renderedText(renderer!)).not.toContain('Gentle wellness note');
  });

  it("renders all of today's logs in chronological order", () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(TodayScreen, {
          entries: [
            dailyEntry('later-yes', '2026-07-17T18:00:00.000Z', true),
            dailyEntry('early-no', '2026-07-17T08:00:00.000Z', false),
          ],
          includeTodayAsMissed: false,
          onLog: async () => undefined,
        }),
      );
    });

    const text = renderedText(renderer!);
    expect(text).toContain("Today's logs");
    expect(text).toContain('2 logs');
    expect(text.indexOf('No movement')).toBeLessThan(
      text.indexOf('Bowel movement · Bristol 4'),
    );
  });

  it('resets the form after appending a log', async () => {
    const onLog = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(TodayScreen, {
          entries: [],
          includeTodayAsMissed: false,
          onLog,
        }),
      );
    });

    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Log no for today',
      }).props.onPress();
    });

    await act(async () => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Save log',
      }).props.onPress();
      await Promise.resolve();
    });

    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({ hadBowelMovement: false }),
    );
    expect(
      renderer!.root.findByProps({
        accessibilityLabel: 'Log no for today',
      }).props.accessibilityState.selected,
    ).toBe(false);
  });

  it('keeps a committed log when reminder synchronization fails', async () => {
    const savedEntry = dailyEntry(
      'saved-no',
      '2026-07-17T16:30:00.000Z',
      false,
    );
    mockInitializeStorage.mockResolvedValue(undefined);
    mockConfigureNotificationBehavior.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({
      ...profile,
      dailyOpenLoveShownDate: '2026-07-17',
    });
    mockGetEntries
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Refresh unavailable.'));
    mockRescheduleProfileNotifications.mockResolvedValue(true);
    mockCreateDailyEntry.mockResolvedValue(savedEntry);
    mockSyncNotificationsAfterEntry.mockRejectedValue(
      new Error('Notifications unavailable.'),
    );
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(createElement(App));
      await flushMicrotasks();
    });

    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Log no for today',
      }).props.onPress();
    });

    await act(async () => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Save log',
      }).props.onPress();
      await flushMicrotasks();
    });

    expect(mockCreateDailyEntry).toHaveBeenCalledTimes(1);
    expect(mockSyncNotificationsAfterEntry).toHaveBeenCalledTimes(1);
    expect(
      renderer!.root.findByProps({
        accessibilityLabel: 'Log no for today',
      }).props.accessibilityState.selected,
    ).toBe(false);
    expect(renderedText(renderer!)).toContain(
      'Log saved, but reminders could not be updated.',
    );
    expect(renderedText(renderer!)).toContain('1 log · 0 Yes · 1 No');
  });

  it('preserves overlapping committed logs when refresh fails', async () => {
    const firstEntry = dailyEntry(
      'first-no',
      '2026-07-17T16:30:00.000Z',
      false,
    );
    const secondEntry = dailyEntry(
      'second-no',
      '2026-07-17T16:31:00.000Z',
      false,
    );
    mockInitializeStorage.mockResolvedValue(undefined);
    mockConfigureNotificationBehavior.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({
      ...profile,
      dailyOpenLoveShownDate: '2026-07-17',
    });
    mockGetEntries
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error('Refresh unavailable.'));
    mockRescheduleProfileNotifications.mockResolvedValue(true);
    mockCreateDailyEntry
      .mockResolvedValueOnce(firstEntry)
      .mockResolvedValueOnce(secondEntry);
    mockSyncNotificationsAfterEntry.mockRejectedValue(
      new Error('Notifications unavailable.'),
    );
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(createElement(App));
      await flushMicrotasks();
    });

    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Log no for today',
      }).props.onPress();
    });

    const saveButton = renderer!.root.findByProps({
      accessibilityLabel: 'Save log',
    });

    await act(async () => {
      saveButton.props.onPress();
      saveButton.props.onPress();
      await flushMicrotasks();
    });

    expect(mockCreateDailyEntry).toHaveBeenCalledTimes(2);
    expect(renderedText(renderer!)).toContain('2 logs · 0 Yes · 2 No');
  });

  it('shows every selected-day event with counts and an add action', () => {
    const entries = [
      {
        ...dailyEntry('no-first', '2026-07-16T08:00:00.000Z', false),
        localDate: '2026-07-16',
      },
      {
        ...dailyEntry('no-second', '2026-07-16T13:00:00.000Z', false),
        localDate: '2026-07-16',
      },
      {
        ...dailyEntry('yes-last', '2026-07-16T18:00:00.000Z', true),
        localDate: '2026-07-16',
      },
    ];
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(HistoryScreen, {
          monthDays: [
            {
              localDate: '2026-07-16',
              label: 'Yesterday',
              status: 'mixed',
              entries,
              isCurrentMonth: true,
            },
          ],
          onCreateEntry: async () => undefined,
          onDeleteEntry: async () => true,
          onUpdateEntry: async () => entries[0],
        }),
      );
    });

    const text = renderedText(renderer!);
    expect(text).toContain('Selected day activity');
    expect(text).toContain('3 logs');
    expect(text).toContain('1 Yes');
    expect(text).toContain('2 No');
    expect(text).toContain('3 logs · 1 Yes · 2 No');
    const entryTestIds = new Set(
      renderer!.root
        .findAll(
          (node) =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('history-entry-'),
        )
        .map((node) => node.props.testID),
    );
    expect(entryTestIds.size).toBe(3);
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Add another log' }),
    ).toBeTruthy();
  });

  it('adds another selected-day log without replacing prior events', async () => {
    const onCreateEntry = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(HistoryScreen, {
          monthDays: [
            {
              localDate: '2026-07-16',
              label: 'Yesterday',
              status: 'yes',
              entries: [
                {
                  ...dailyEntry(
                    'existing',
                    '2026-07-16T08:00:00.000Z',
                    true,
                  ),
                  localDate: '2026-07-16',
                },
              ],
              isCurrentMonth: true,
            },
          ],
          onCreateEntry,
          onDeleteEntry: async () => true,
          onUpdateEntry: async () => null,
        }),
      );
    });

    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Add another log',
      }).props.onPress();
    });

    expect(renderedText(renderer!)).toContain('Add log');

    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Choose No for this log',
      }).props.onPress();
    });

    await act(async () => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Save new log',
      }).props.onPress();
      await Promise.resolve();
    });

    expect(onCreateEntry).toHaveBeenCalledWith(
      '2026-07-16',
      expect.objectContaining({ hadBowelMovement: false }),
    );
  });

  it('keeps future calendar days read-only', () => {
    const futureEntry = {
      ...dailyEntry('future', '2026-07-18T12:00:00.000Z', true),
      localDate: '2026-07-18',
    };
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(HistoryScreen, {
          monthDays: [
            {
              localDate: '2026-07-16',
              label: 'Yesterday',
              status: 'missed',
              entries: [],
              isCurrentMonth: true,
            },
            {
              localDate: '2026-07-18',
              label: 'Tomorrow',
              status: 'yes',
              entries: [futureEntry],
              isCurrentMonth: true,
            },
          ],
          onCreateEntry: async () => undefined,
          onDeleteEntry: async () => true,
          onUpdateEntry: async () => futureEntry,
        }),
      );
    });

    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Tomorrow, 1 log: 1 yes, 0 no',
      }).props.onPress();
    });

    expect(renderedText(renderer!)).toContain('Future dates are read-only.');
    expect(
      renderer!.root.findAllByProps({ accessibilityLabel: 'Add another log' }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({
        accessibilityLabel: 'Edit Yes log at 8:00 AM',
      }),
    ).toHaveLength(0);
  });

  it('edits one selected-day event by id', async () => {
    const existing = {
      ...dailyEntry('existing', '2026-07-16T08:00:00.000Z', false),
      localDate: '2026-07-16',
    };
    const onUpdateEntry = jest.fn(async (_id, input) => ({
      ...existing,
      ...input,
      stoolType: input.stoolType ?? null,
    }));
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(HistoryScreen, {
          monthDays: [
            {
              localDate: '2026-07-16',
              label: 'Yesterday',
              status: 'no',
              entries: [existing],
              isCurrentMonth: true,
            },
          ],
          onCreateEntry: async () => undefined,
          onDeleteEntry: async () => true,
          onUpdateEntry,
        }),
      );
    });

    act(() => {
      renderer!.root.findAllByProps({ testID: 'history-entry-existing' })[0]
        .props.onPress();
    });
    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Choose Yes for this log',
      }).props.onPress();
    });
    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Select Type 4: Smooth soft shape',
      }).props.onPress();
    });

    await act(async () => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Save changes',
      }).props.onPress();
      await Promise.resolve();
    });

    expect(onUpdateEntry).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({
        hadBowelMovement: true,
        stoolType: 4,
      }),
    );
  });

  it('confirms deletion of one event and supports the final-entry empty state', async () => {
    const existing = {
      ...dailyEntry('existing', '2026-07-16T08:00:00.000Z', false),
      localDate: '2026-07-16',
    };
    const onDeleteEntry = jest.fn(async () => true);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      (_title, _message, buttons) => {
        buttons?.find((button) => button.style === 'destructive')?.onPress?.();
      },
    );
    const props = {
      onCreateEntry: async () => undefined,
      onDeleteEntry,
      onUpdateEntry: async () => existing,
    };
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(HistoryScreen, {
          ...props,
          monthDays: [
            {
              localDate: '2026-07-16',
              label: 'Yesterday',
              status: 'no',
              entries: [existing],
              isCurrentMonth: true,
            },
          ],
        }),
      );
    });

    act(() => {
      renderer!.root.findAllByProps({ testID: 'history-entry-existing' })[0]
        .props.onPress();
    });
    await act(async () => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Delete this log',
      }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete this log?',
      expect.any(String),
      expect.any(Array),
    );
    expect(onDeleteEntry).toHaveBeenCalledWith('existing');

    act(() => {
      renderer!.update(
        createElement(HistoryScreen, {
          ...props,
          monthDays: [
            {
              localDate: '2026-07-16',
              label: 'Yesterday',
              status: 'missed',
              entries: [],
              isCurrentMonth: true,
            },
          ],
        }),
      );
    });

    expect(renderedText(renderer!)).toContain('No logs saved for this day.');
    alertSpy.mockRestore();
  });

  it('owns the wellness note and question experience', async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-16',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
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

    expect(
      renderer!.root
        .findByProps({ accessibilityLiveRegion: 'polite' })
        .findByType(Text).props.children,
    ).toBe('A gentle answer.');

    act(() => {
      renderer!.root
        .findByType(TextInput)
        .props.onChangeText('What about hydration?');
    });

    expect(
      renderer!.root.findAllByProps({ accessibilityLiveRegion: 'polite' }),
    ).toHaveLength(0);
    expect(renderedText(renderer!)).toContain('A gentle answer.');
  });

  it('loads and renders saved question history newest first', async () => {
    const newer = questionHistoryEntry(
      'newer',
      'Newer question?',
      'Newer answer.',
      '2026-07-20T15:42:00',
    );
    const older = questionHistoryEntry(
      'older',
      'Older question?',
      'Older answer.',
      '2026-07-19T15:42:00',
    );
    mockGetWellnessQuestionHistory.mockResolvedValue([newer, older]);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });

    const text = renderedText(renderer!);
    expect(text).toContain('Question history');
    expect(text).toContain('You asked');
    expect(text.indexOf('Newer question?')).toBeLessThan(
      text.indexOf('Older question?'),
    );
    expect(text).toContain(formatWellnessQuestionAskedAt(newer.askedAt));
  });

  it('keeps a newly saved answer when the initial history load resolves later', async () => {
    const older = questionHistoryEntry(
      'older',
      'Older loaded question?',
      'Older loaded answer.',
      '2026-07-19T15:42:00',
    );
    let resolveHistory: (
      entries: Awaited<ReturnType<typeof getWellnessQuestionHistory>>,
    ) => void = () => undefined;
    mockGetWellnessQuestionHistory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHistory = resolve;
        }),
    );
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: true,
      answer: 'Newly saved answer.',
    });
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await Promise.resolve();
    });
    act(() => {
      renderer!.root
        .findByType(TextInput)
        .props.onChangeText('Newly saved question?');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      resolveHistory([older]);
      await flushMicrotasks();
    });

    expect(renderedQuestionHistoryIds(renderer!)).toEqual([
      'question-history-saved-history',
      'question-history-older',
    ]);
  });

  it('persists and prepends a successful submitted question and answer', async () => {
    const existing = questionHistoryEntry(
      'existing',
      'Existing question?',
      'Existing answer.',
      '2026-07-19T15:42:00',
    );
    mockGetWellnessQuestionHistory.mockResolvedValue([existing]);
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: true,
      answer: 'A saved answer.',
    });
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root
        .findByType(TextInput)
        .props.onChangeText('  What can help?  ');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    expect(mockCreateWellnessQuestionHistoryEntry).toHaveBeenCalledWith(
      'What can help?',
      'A saved answer.',
    );
    const text = renderedText(renderer!);
    expect(text).toContain('A saved answer.');
    expect(text).toContain('What can help?');
    expect(text).toContain('Existing question?');
    expect(renderedQuestionHistoryIds(renderer!)).toEqual([
      'question-history-saved-history',
      'question-history-existing',
    ]);
  });

  it('does not persist a failed answer request', async () => {
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: false,
      reason: 'request-failed',
    });
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root.findByType(TextInput).props.onChangeText('Question?');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    expect(mockCreateWellnessQuestionHistoryEntry).not.toHaveBeenCalled();
    expect(renderedText(renderer!)).toContain(
      'Unable to answer right now. Please try again.',
    );
  });

  it('keeps question answering usable when history loading fails', async () => {
    mockGetWellnessQuestionHistory.mockRejectedValue(new Error('storage down'));
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });

    expect(renderedText(renderer!)).toContain(
      'Question history is unavailable right now.',
    );
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }),
    ).toBeTruthy();
  });

  it('keeps the load warning visible after a successful history save', async () => {
    mockGetWellnessQuestionHistory.mockRejectedValue(new Error('storage down'));
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: true,
      answer: 'A newly saved answer.',
    });
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root.findByType(TextInput).props.onChangeText('Question?');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    const text = renderedText(renderer!);
    expect(text).toContain('A newly saved answer.');
    expect(text).toContain('Question history is unavailable right now.');
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }),
    ).toBeTruthy();
  });

  it('keeps a valid answer visible when history saving fails', async () => {
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: true,
      answer: 'A visible answer.',
    });
    mockCreateWellnessQuestionHistoryEntry.mockRejectedValue(
      new Error('storage down'),
    );
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root.findByType(TextInput).props.onChangeText('Question?');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    const text = renderedText(renderer!);
    expect(text).toContain('A visible answer.');
    expect(text).toContain(
      'Answer received, but it could not be added to question history.',
    );
  });

  it('explains local question history retention in Settings', () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(SettingsScreen, {
          profile,
          onSave: async () => undefined,
          onExportData: async () => undefined,
          onDeleteData: () => undefined,
        }),
      );
    });

    expect(renderedText(renderer!)).toContain(
      'Successful questions and answers stay on this device until you delete local data.',
    );
  });

  it('includes question history in the delete local data confirmation', async () => {
    mockInitializeStorage.mockResolvedValue(undefined);
    mockConfigureNotificationBehavior.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({
      ...profile,
      dailyOpenLoveShownDate: '2026-07-17',
    });
    mockGetEntries.mockResolvedValue([]);
    mockRescheduleProfileNotifications.mockResolvedValue(true);
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(createElement(App));
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Open Settings tab',
      }).props.onPress();
    });
    act(() => {
      renderer!.root.findByProps({
        accessibilityLabel: 'Delete local data',
      }).props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete local data?',
      expect.stringContaining('question history'),
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });
});
