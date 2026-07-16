import type { Profile } from '../types';
import {
  hasConfiguredLlmWellnessNotes,
  type LlmWellnessNotePayload,
} from './llmWellnessNotes';

export const MAX_WELLNESS_QUESTION_CHARS = 500;
export const MAX_WELLNESS_ANSWER_CHARS = 1600;

export type WellnessQuestionPayload = {
  question: string;
  summary: LlmWellnessNotePayload;
};

export type WellnessQuestionResult =
  | { ok: true; answer: string }
  | {
      ok: false;
      reason:
        | 'not-configured'
        | 'invalid-question'
        | 'request-failed'
        | 'invalid-response';
    };

type WellnessQuestionFetchResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type WellnessQuestionFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<WellnessQuestionFetchResponse>;

export function deriveWellnessQuestionEndpoint(
  endpoint: string,
): string | null {
  try {
    const url = new URL(endpoint.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const segments = url.pathname.split('/');

    if (segments[segments.length - 1] !== 'wellness-note') {
      return null;
    }

    segments[segments.length - 1] = 'wellness-question';
    url.pathname = segments.join('/');
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}

export function buildWellnessQuestionPayload(
  question: string,
  summary: LlmWellnessNotePayload,
): WellnessQuestionPayload | null {
  const trimmed = question.trim();

  if (!trimmed || trimmed.length > MAX_WELLNESS_QUESTION_CHARS) {
    return null;
  }

  return { question: trimmed, summary };
}

function readAnswerResponse(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('answer' in value)) {
    return null;
  }

  const answer = (value as { answer?: unknown }).answer;

  if (typeof answer !== 'string') {
    return null;
  }

  const normalized = answer.replace(/\s+/g, ' ').trim();

  return normalized.length > 0 &&
    normalized.length <= MAX_WELLNESS_ANSWER_CHARS
    ? normalized
    : null;
}

export async function requestLlmWellnessAnswer(
  profile: Profile,
  question: string,
  summary: LlmWellnessNotePayload,
  options: {
    timeoutMs?: number;
    fetchImpl?: WellnessQuestionFetch;
  } = {},
): Promise<WellnessQuestionResult> {
  if (!hasConfiguredLlmWellnessNotes(profile)) {
    return { ok: false, reason: 'not-configured' };
  }

  const endpoint = deriveWellnessQuestionEndpoint(
    profile.llmWellnessNoteEndpoint,
  );
  const payload = buildWellnessQuestionPayload(question, summary);

  if (!endpoint) {
    return { ok: false, reason: 'not-configured' };
  }

  if (!payload) {
    return { ok: false, reason: 'invalid-question' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 8000,
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${profile.llmWellnessNoteAccessToken.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: 'request-failed' };
    }

    const answer = readAnswerResponse(await response.json());

    return answer
      ? { ok: true, answer }
      : { ok: false, reason: 'invalid-response' };
  } catch {
    return { ok: false, reason: 'request-failed' };
  } finally {
    clearTimeout(timeout);
  }
}
