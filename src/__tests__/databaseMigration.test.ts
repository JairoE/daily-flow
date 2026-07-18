jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import type * as SQLite from 'expo-sqlite';

import { migrateDailyEntriesForMultipleEvents } from '../storage/database';

describe('native daily-entry migration', () => {
  it('rebuilds a legacy unique-date table inside an exclusive transaction', async () => {
    const transactionExec = jest.fn().mockResolvedValue(undefined);
    const transaction = { execAsync: transactionExec };
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
    expect(transactionExec).toHaveBeenCalledTimes(1);
    const migrationSql = transactionExec.mock.calls[0][0] as string;
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
