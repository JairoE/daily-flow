import {
  buildWellnessQuestionPayload,
  deriveWellnessQuestionEndpoint,
  requestLlmWellnessAnswer,
} from '../lib/llmWellnessQuestions';
import type { LlmWellnessNotePayload } from '../lib/llmWellnessNotes';
import type { Profile } from '../types';

const profile: Profile = {
  id: 'local-profile',
  displayName: 'Jairo',
  timezone: 'America/New_York',
  checkInTime: '20:00',
  remindersEnabled: true,
  privateNotifications: true,
  privacyLockEnabled: false,
  llmWellnessNotesEnabled: true,
  llmWellnessNoteEndpoint: 'https://example.ngrok.app/wellness-note',
  llmWellnessNoteAccessToken: 'test-token',
  dailyOpenLoveShownDate: null,
  createdAt: '2026-07-10T12:00:00.000Z',
  updatedAt: '2026-07-10T12:00:00.000Z',
};

const summary: LlmWellnessNotePayload = {
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
};

describe('LLM wellness question helpers', () => {
  it('derives the sibling question endpoint with URL parsing', () => {
    expect(
      deriveWellnessQuestionEndpoint(
        'https://example.ngrok.app/wellness-note',
      ),
    ).toBe('https://example.ngrok.app/wellness-question');
    expect(
      deriveWellnessQuestionEndpoint(
        'http://192.168.1.168:8787/wellness-note',
      ),
    ).toBe('http://192.168.1.168:8787/wellness-question');
    expect(
      deriveWellnessQuestionEndpoint('https://example.com/api'),
    ).toBeNull();
    expect(deriveWellnessQuestionEndpoint('not a url')).toBeNull();
  });

  it('builds a trimmed question plus summary and rejects invalid questions', () => {
    expect(
      buildWellnessQuestionPayload(
        '  What supports regularity?  ',
        summary,
      ),
    ).toEqual({
      question: 'What supports regularity?',
      summary,
    });
    expect(buildWellnessQuestionPayload('   ', summary)).toBeNull();
    expect(buildWellnessQuestionPayload('x'.repeat(501), summary)).toBeNull();
    expect(
      JSON.stringify(buildWellnessQuestionPayload('Help?', summary)),
    ).not.toMatch(
      /Jairo|localDate|laxativeNote|notificationRecords|entries|2026-07-10/,
    );
  });

  it('returns a normalized answer from the sibling endpoint', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ answer: '  Gentle consistency can help.  ' }),
    }));

    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, {
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: true,
      answer: 'Gentle consistency can help.',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.ngrok.app/wellness-question',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: 'What can help?', summary }),
      }),
    );
  });

  it('returns typed failures without calling the provider for invalid setup', async () => {
    const fetchImpl = jest.fn();

    await expect(
      requestLlmWellnessAnswer(
        { ...profile, llmWellnessNotesEnabled: false },
        'What can help?',
        summary,
        { fetchImpl },
      ),
    ).resolves.toEqual({ ok: false, reason: 'not-configured' });
    await expect(
      requestLlmWellnessAnswer(profile, '   ', summary, { fetchImpl }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-question' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns typed failures for transport and invalid response errors', async () => {
    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, {
        fetchImpl: jest.fn(async () => {
          throw new Error('network down');
        }),
      }),
    ).resolves.toEqual({ ok: false, reason: 'request-failed' });

    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, {
        fetchImpl: jest.fn(async () => ({
          ok: true,
          json: async () => ({ answer: 'x'.repeat(1601) }),
        })),
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-response' });
  });

  it('aborts after the configured timeout', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );

    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, {
        fetchImpl,
        timeoutMs: 1,
      }),
    ).resolves.toEqual({ ok: false, reason: 'request-failed' });
  });
});
