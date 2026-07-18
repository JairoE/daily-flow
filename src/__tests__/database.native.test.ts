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
});
