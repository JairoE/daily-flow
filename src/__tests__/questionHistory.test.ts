import {
  compareWellnessQuestionHistoryEntries,
  createWellnessQuestionHistoryValue,
  formatWellnessQuestionAskedAt,
  normalizeWellnessQuestionHistory,
} from '../lib/questionHistory';

describe('question history values', () => {
  it('creates a normalized value with a deterministic local id and timestamp', () => {
    expect(
      createWellnessQuestionHistoryValue('  What can help?  ', '  A calm answer.  ', {
        now: '2026-07-20T19:42:00.000Z',
        random: 0.123456,
      }),
    ).toEqual({
      id: expect.stringMatching(
        /^wellness-question-2026-07-20T19:42:00\.000Z-\d{6}-/,
      ),
      question: 'What can help?',
      answer: 'A calm answer.',
      askedAt: '2026-07-20T19:42:00.000Z',
    });
  });

  it('rejects empty normalized question or answer text', () => {
    expect(() => createWellnessQuestionHistoryValue(' ', 'Answer')).toThrow(
      'Question and answer are required.',
    );
    expect(() => createWellnessQuestionHistoryValue('Question', ' ')).toThrow(
      'Question and answer are required.',
    );
  });

  it('normalizes valid saved values and returns them newest first', () => {
    expect(
      normalizeWellnessQuestionHistory([
        {
          id: 'older',
          question: ' Older question? ',
          answer: ' Older answer. ',
          askedAt: '2026-07-20T14:00:00.000Z',
        },
        { id: 'invalid', question: '', answer: 'No question.', askedAt: 'now' },
        {
          id: 'newer',
          question: 'Newer question?',
          answer: 'Newer answer.',
          askedAt: '2026-07-20T15:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: 'newer',
        question: 'Newer question?',
        answer: 'Newer answer.',
        askedAt: '2026-07-20T15:00:00.000Z',
      },
      {
        id: 'older',
        question: 'Older question?',
        answer: 'Older answer.',
        askedAt: '2026-07-20T14:00:00.000Z',
      },
    ]);
    expect(normalizeWellnessQuestionHistory(undefined)).toEqual([]);
  });

  it('uses id descending to break equal-timestamp ties', () => {
    const first = {
      id: 'a',
      question: 'First?',
      answer: 'First.',
      askedAt: '2026-07-20T15:00:00.000Z',
    };
    const second = { ...first, id: 'b' };

    expect([first, second].sort(compareWellnessQuestionHistoryEntries)).toEqual([
      second,
      first,
    ]);
  });

  it('formats local date and time without throwing on invalid input', () => {
    const askedAt = '2026-07-20T15:42:00';
    const value = new Date(askedAt);
    const expected = `${value.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}, ${value.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`;

    expect(formatWellnessQuestionAskedAt(askedAt)).toBe(expected);
    expect(formatWellnessQuestionAskedAt('not-a-time')).toBe('Time unavailable');
  });
});
