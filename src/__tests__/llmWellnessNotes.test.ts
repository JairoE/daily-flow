import {
  buildLlmWellnessNotePayload,
  getInitialWellnessNoteDisplayState,
  hasConfiguredLlmWellnessNotes,
  requestLlmWellnessNote,
  resolveWellnessNoteDisplayState,
} from '../lib/llmWellnessNotes';
import type { Profile, TrendSummary } from '../types';

const profile: Profile = {
  id: 'local-profile',
  displayName: 'Jairo',
  timezone: 'America/New_York',
  checkInTime: '20:00',
  remindersEnabled: true,
  privateNotifications: true,
  privacyLockEnabled: false,
  llmWellnessNotesEnabled: true,
  llmWellnessNoteEndpoint: 'https://example.ngrok-free.dev/wellness-note',
  llmWellnessNoteAccessToken: 'test-token',
  dailyOpenLoveShownDate: null,
  createdAt: '2026-07-10T12:00:00.000Z',
  updatedAt: '2026-07-10T12:00:00.000Z',
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
  averagePerWeekLast30: 2.3,
  currentGapDays: 2,
  longestGapDays: 4,
  gapCount2Plus: 2,
  completedDaysLast30: 26,
  checkInRateLast30: 87,
  bristolDistribution: [],
  mostCommonBristolType: null,
  hardOrLumpyMovementsLast30: 3,
  looseOrWateryMovementsLast30: 1,
  hardOrLumpyDays: 3,
  looseOrWateryDays: 1,
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
  symptomBurdenDays: 6,
  laxativeUseDays: 2,
  noteDays: 1,
  detailDays: 12,
  weeklyFrequency: [],
  rolling7: [],
  intervals: [],
};

describe('LLM wellness note helpers', () => {
  it('builds a summaries-only payload', () => {
    const payload = buildLlmWellnessNotePayload(trends);

    expect(payload).toEqual({
      summaryWindowDays: 30,
      bowelMovementDaysLast30: 10,
      averagePerWeekLast30: 2.3,
      currentGapDays: 2,
      longestGapDays: 4,
      hardOrLumpyDays: 3,
      looseOrWateryDays: 1,
      symptomBurdenDays: 6,
      laxativeUseDays: 2,
      checkInRateLast30: 87,
      detailDays: 12,
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /Jairo|localDate|laxativeNote|notificationRecords|entries|2026-07-10/,
    );
  });

  it('requires the opt-in toggle, endpoint, and access token', () => {
    expect(hasConfiguredLlmWellnessNotes(profile)).toBe(true);
    expect(
      hasConfiguredLlmWellnessNotes({
        ...profile,
        llmWellnessNotesEnabled: false,
      }),
    ).toBe(false);
    expect(
      hasConfiguredLlmWellnessNotes({
        ...profile,
        llmWellnessNoteEndpoint: '',
      }),
    ).toBe(false);
    expect(
      hasConfiguredLlmWellnessNotes({
        ...profile,
        llmWellnessNoteAccessToken: '',
      }),
    ).toBe(false);
  });

  it('loads only when an LLM wellness note request can be made', () => {
    expect(getInitialWellnessNoteDisplayState(profile)).toEqual({
      status: 'loading',
    });
    expect(
      getInitialWellnessNoteDisplayState({
        ...profile,
        llmWellnessNotesEnabled: false,
      }),
    ).toEqual({ status: 'fallback' });
    expect(
      getInitialWellnessNoteDisplayState({
        ...profile,
        llmWellnessNoteEndpoint: '',
      }),
    ).toEqual({ status: 'fallback' });
    expect(
      getInitialWellnessNoteDisplayState({
        ...profile,
        llmWellnessNoteAccessToken: '',
      }),
    ).toEqual({ status: 'fallback' });
  });

  it('shows a viable generated note and otherwise falls back', () => {
    expect(
      resolveWellnessNoteDisplayState(
        'Keep noticing patterns with gentle consistency.',
      ),
    ).toEqual({
      status: 'generated',
      note: 'Keep noticing patterns with gentle consistency.',
    });
    expect(resolveWellnessNoteDisplayState(null)).toEqual({
      status: 'fallback',
    });
  });

  it('returns a generated note on a successful response', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ note: 'Keep noticing patterns with gentle consistency.' }),
    }));

    await expect(
      requestLlmWellnessNote(profile, buildLlmWellnessNotePayload(trends), {
        fetchImpl,
      }),
    ).resolves.toBe('Keep noticing patterns with gentle consistency.');

    expect(fetchImpl).toHaveBeenCalledWith(
      profile.llmWellnessNoteEndpoint,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('falls back when disabled, unconfigured, errored, or timed out', async () => {
    const payload = buildLlmWellnessNotePayload(trends);

    await expect(
      requestLlmWellnessNote(
        { ...profile, llmWellnessNotesEnabled: false },
        payload,
      ),
    ).resolves.toBeNull();

    await expect(
      requestLlmWellnessNote(
        { ...profile, llmWellnessNoteEndpoint: '' },
        payload,
      ),
    ).resolves.toBeNull();

    await expect(
      requestLlmWellnessNote(profile, payload, {
        fetchImpl: jest.fn(async () => {
          throw new Error('network down');
        }),
      }),
    ).resolves.toBeNull();

    const abortingFetch = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );

    await expect(
      requestLlmWellnessNote(profile, payload, {
        fetchImpl: abortingFetch,
        timeoutMs: 1,
      }),
    ).resolves.toBeNull();
  });
});
