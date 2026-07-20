jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

const allProfileColumns = [
  'llm_wellness_notes_enabled',
  'llm_wellness_note_endpoint',
  'llm_wellness_note_access_token',
  'daily_open_love_shown_date',
].map((name) => ({ name }));

const allDailyEntryColumns = [
  'details_recorded',
  'stool_type',
  'symptom_straining',
  'symptom_pain',
  'symptom_bloating',
  'symptom_incomplete_evacuation',
  'laxative_used',
  'laxative_note',
].map((name) => ({ name }));

describe('native daily-entry storage', () => {
  it('inserts independent rows when multiple events share a date', async () => {
    jest.resetModules();
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const db = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      getAllAsync: jest.fn().mockImplementation(async (sql: string) =>
        sql.includes('table_info(profile)')
          ? allProfileColumns
          : allDailyEntryColumns,
      ),
      getFirstAsync: jest.fn().mockResolvedValue({
        sql: 'CREATE TABLE daily_entries (id TEXT PRIMARY KEY NOT NULL, local_date TEXT NOT NULL)',
      }),
      runAsync,
      withExclusiveTransactionAsync: jest.fn(),
    };
    const SQLite = jest.requireMock('expo-sqlite') as {
      openDatabaseAsync: jest.Mock;
    };
    SQLite.openDatabaseAsync.mockResolvedValue(db);
    const { createDailyEntry } = require('../storage/database') as typeof import('../storage/database');

    const first = await createDailyEntry('2026-07-17', {
      hadBowelMovement: false,
    });
    const second = await createDailyEntry('2026-07-17', {
      hadBowelMovement: true,
      stoolType: 4,
    });

    expect(first.id).not.toBe(second.id);
    const insertCalls = runAsync.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO daily_entries'),
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0][0]).not.toContain('ON CONFLICT(local_date)');
    expect(insertCalls[0][1][1]).toBe('2026-07-17');
    expect(insertCalls[1][1][1]).toBe('2026-07-17');
  });

  it('creates, lists, and clears local wellness question history', async () => {
    jest.resetModules();
    const historyRows = [
      {
        id: 'history-2',
        question: 'Second question?',
        answer: 'Second answer.',
        asked_at: '2026-07-20T16:00:00.000Z',
      },
      {
        id: 'history-1',
        question: 'First question?',
        answer: 'First answer.',
        asked_at: '2026-07-20T15:00:00.000Z',
      },
    ];
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('table_info(profile)')) return allProfileColumns;
      if (sql.includes('table_info(daily_entries)')) return allDailyEntryColumns;
      if (sql.includes('FROM wellness_question_history')) return historyRows;
      return [];
    });
    const db = {
      execAsync,
      getAllAsync,
      getFirstAsync: jest.fn().mockResolvedValue({
        sql: 'CREATE TABLE daily_entries (id TEXT PRIMARY KEY NOT NULL, local_date TEXT NOT NULL)',
      }),
      runAsync,
      withExclusiveTransactionAsync: jest.fn(),
    };
    const SQLite = jest.requireMock('expo-sqlite') as {
      openDatabaseAsync: jest.Mock;
    };
    SQLite.openDatabaseAsync.mockResolvedValue(db);
    const {
      createWellnessQuestionHistoryEntry,
      deleteAllData,
      getWellnessQuestionHistory,
    } = require('../storage/database') as typeof import('../storage/database');

    const created = await createWellnessQuestionHistoryEntry(
      '  What can help?  ',
      '  A calm answer.  ',
    );

    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS wellness_question_history',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'wellness_question_history_asked_at_idx',
    );
    expect(created).toMatchObject({
      question: 'What can help?',
      answer: 'A calm answer.',
    });
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO wellness_question_history'),
      [created.id, created.question, created.answer, created.askedAt],
    );
    await expect(getWellnessQuestionHistory()).resolves.toEqual([
      {
        id: 'history-2',
        question: 'Second question?',
        answer: 'Second answer.',
        askedAt: '2026-07-20T16:00:00.000Z',
      },
      {
        id: 'history-1',
        question: 'First question?',
        answer: 'First answer.',
        askedAt: '2026-07-20T15:00:00.000Z',
      },
    ]);
    expect(getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY asked_at DESC, id DESC'),
    );

    await deleteAllData();
    expect(execAsync.mock.calls.at(-1)?.[0]).toContain(
      'DELETE FROM wellness_question_history;',
    );
  });
});
