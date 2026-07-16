import type { Profile, TrendSummary } from '../types';

export type LlmWellnessNotePayload = {
  summaryWindowDays: 30;
  bowelMovementDaysLast30: number;
  averagePerWeekLast30: number;
  currentGapDays: number | null;
  longestGapDays: number;
  hardOrLumpyDays: number;
  looseOrWateryDays: number;
  symptomBurdenDays: number;
  laxativeUseDays: number;
  checkInRateLast30: number;
  detailDays: number;
};

type WellnessNoteFetchResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type WellnessNoteFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<WellnessNoteFetchResponse>;

export function buildLlmWellnessNotePayload(
  trends: TrendSummary,
): LlmWellnessNotePayload {
  return {
    summaryWindowDays: 30,
    bowelMovementDaysLast30: trends.bowelMovementDaysLast30,
    averagePerWeekLast30: trends.averagePerWeekLast30,
    currentGapDays: trends.currentGapDays,
    longestGapDays: trends.longestGapDays,
    hardOrLumpyDays: trends.hardOrLumpyDays,
    looseOrWateryDays: trends.looseOrWateryDays,
    symptomBurdenDays: trends.symptomBurdenDays,
    laxativeUseDays: trends.laxativeUseDays,
    checkInRateLast30: trends.checkInRateLast30,
    detailDays: trends.detailDays,
  };
}

export function hasConfiguredLlmWellnessNotes(profile: Profile): boolean {
  return (
    profile.llmWellnessNotesEnabled &&
    profile.llmWellnessNoteEndpoint.trim().length > 0 &&
    profile.llmWellnessNoteAccessToken.trim().length > 0
  );
}

function readNoteResponse(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('note' in value)) {
    return null;
  }

  const note = (value as { note?: unknown }).note;

  if (typeof note !== 'string') {
    return null;
  }

  const trimmed = note.trim();

  return trimmed.length > 0 && trimmed.length <= 280 ? trimmed : null;
}

export async function requestLlmWellnessNote(
  profile: Profile,
  payload: LlmWellnessNotePayload,
  options: {
    timeoutMs?: number;
    fetchImpl?: WellnessNoteFetch;
  } = {},
): Promise<string | null> {
  if (!hasConfiguredLlmWellnessNotes(profile)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 8000,
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(profile.llmWellnessNoteEndpoint.trim(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${profile.llmWellnessNoteAccessToken.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return readNoteResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
