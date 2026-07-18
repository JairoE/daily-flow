jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import type * as SQLite from 'expo-sqlite';

import { migrateDailyEntriesForMultipleEvents } from '../storage/database';

const currentDailyEntryColumnNames = [
  'id',
  'local_date',
  'had_bowel_movement',
  'details_recorded',
  'stool_type',
  'symptom_straining',
  'symptom_pain',
  'symptom_bloating',
  'symptom_incomplete_evacuation',
  'laxative_used',
  'laxative_note',
  'checked_in_at',
  'created_at',
  'updated_at',
];

describe('native daily-entry migration', () => {
  it('rebuilds a legacy unique-date table inside an exclusive transaction', async () => {
    const transactionExec = jest.fn().mockResolvedValue(undefined);
    const transactionGetAll = jest.fn().mockResolvedValue(
      currentDailyEntryColumnNames
        .filter((name) => name !== 'details_recorded')
        .map((name) => ({ name })),
    );
    const transaction = {
      execAsync: transactionExec,
      getAllAsync: transactionGetAll,
    };
    const withExclusiveTransactionAsync = jest
      .fn()
      .mockImplementation(async (task: (txn: typeof transaction) => Promise<void>) => {
        await task(transaction);
      });
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({
        sql: 'CREATE TABLE daily_entries (id TEXT PRIMARY KEY NOT NULL, local_date TEXT NOT NULL UNIQUE)',
      }),
      execAsync: jest.fn(),
      withExclusiveTransactionAsync,
    } as unknown as SQLite.SQLiteDatabase;

    await expect(migrateDailyEntriesForMultipleEvents(db)).resolves.toBe(true);

    expect(withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(transactionGetAll).toHaveBeenCalledWith(
      'PRAGMA table_info(daily_entries)',
    );
    expect(transactionExec).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'ALTER TABLE daily_entries ADD COLUMN details_recorded',
      ),
    );
    expect(db.execAsync).not.toHaveBeenCalled();
    const migrationSql = transactionExec.mock.calls.at(-1)?.[0] as string;
    expect(migrationSql).toContain('CREATE TABLE daily_entries_v2');
    expect(migrationSql).toContain(
      'INSERT INTO daily_entries_v2 (\n        id,\n        local_date,',
    );
    expect(migrationSql).toContain('SELECT\n        id,\n        local_date,');
    expect(migrationSql).toContain('DROP TABLE daily_entries;');
    expect(migrationSql).toContain(
      'ALTER TABLE daily_entries_v2 RENAME TO daily_entries;',
    );
    expect(migrationSql).toContain('daily_entries_date_time_idx');
  });

  it('skips the rebuild for the multi-entry schema and ensures its index', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({
        sql: 'CREATE TABLE daily_entries (id TEXT PRIMARY KEY NOT NULL, local_date TEXT NOT NULL)',
      }),
      getAllAsync: jest
        .fn()
        .mockResolvedValue(
          currentDailyEntryColumnNames.map((name) => ({ name })),
        ),
      execAsync: jest.fn().mockResolvedValue(undefined),
      withExclusiveTransactionAsync: jest.fn(),
    } as unknown as SQLite.SQLiteDatabase;

    await expect(migrateDailyEntriesForMultipleEvents(db)).resolves.toBe(false);

    expect(db.withExclusiveTransactionAsync).not.toHaveBeenCalled();
    expect(db.execAsync).toHaveBeenCalledWith(
      expect.stringContaining('daily_entries_date_time_idx'),
    );
  });
});
