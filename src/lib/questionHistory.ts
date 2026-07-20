import type { WellnessQuestionHistoryEntry } from '../types';

let historyIdCounter = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function compareWellnessQuestionHistoryEntries(
  a: WellnessQuestionHistoryEntry,
  b: WellnessQuestionHistoryEntry,
): number {
  return b.askedAt.localeCompare(a.askedAt) || b.id.localeCompare(a.id);
}

export function createWellnessQuestionHistoryValue(
  question: string,
  answer: string,
  options: { now?: string; random?: number } = {},
): WellnessQuestionHistoryEntry {
  const normalizedQuestion = question.trim();
  const normalizedAnswer = answer.trim();

  if (!normalizedQuestion || !normalizedAnswer) {
    throw new Error('Question and answer are required.');
  }

  const askedAt = options.now ?? new Date().toISOString();
  historyIdCounter += 1;
  const sequence = historyIdCounter.toString().padStart(6, '0');
  const random = options.random ?? Math.random();
  const entropy = random.toString(36).replace(/^0\./, '').slice(0, 8);

  return {
    id: `wellness-question-${askedAt}-${sequence}-${entropy}`,
    question: normalizedQuestion,
    answer: normalizedAnswer,
    askedAt,
  };
}

export function normalizeWellnessQuestionHistory(
  value: unknown,
): WellnessQuestionHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item): WellnessQuestionHistoryEntry[] => {
      if (
        !isRecord(item) ||
        typeof item.id !== 'string' ||
        typeof item.question !== 'string' ||
        typeof item.answer !== 'string' ||
        typeof item.askedAt !== 'string'
      ) {
        return [];
      }

      const normalized = {
        id: item.id.trim(),
        question: item.question.trim(),
        answer: item.answer.trim(),
        askedAt: item.askedAt.trim(),
      };

      return normalized.id &&
        normalized.question &&
        normalized.answer &&
        normalized.askedAt
        ? [normalized]
        : [];
    })
    .sort(compareWellnessQuestionHistoryEntries);
}

export function formatWellnessQuestionAskedAt(askedAt: string): string {
  const value = new Date(askedAt);

  if (Number.isNaN(value.getTime())) {
    return 'Time unavailable';
  }

  return `${value.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}, ${value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}
