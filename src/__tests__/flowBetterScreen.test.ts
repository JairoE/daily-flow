import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';

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
  deleteAllData: jest.fn(),
  deleteDailyEntry: jest.fn(),
  getAllEntries: jest.fn(),
  getEntries: jest.fn(),
  getEntriesByDate: jest.fn(),
  getProfile: jest.fn(),
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

import { FlowBetterScreen, HistoryScreen, TodayScreen } from '../../App';
import { requestLlmWellnessAnswer } from '../lib/llmWellnessQuestions';
import type { DailyEntry, Profile, TrendSummary } from '../types';

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

describe('Flow Better screen', () => {
  beforeEach(() => {
    mockRequestLlmWellnessAnswer.mockReset();
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
