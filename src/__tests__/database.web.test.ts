import {
  createDailyEntry,
  deleteAllData,
  deleteDailyEntry,
  getAllEntries,
  getEntries,
  getEntriesByDate,
  updateDailyEntry,
} from '../storage/database.web';

const values = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => {
    values.delete(key);
  },
  setItem: (key, value) => {
    values.set(key, value);
  },
};

describe('web daily-entry storage', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
  });

  beforeEach(async () => {
    window.localStorage.clear();
    await deleteAllData();
  });

  it('creates multiple independent entries on one date', async () => {
    const first = await createDailyEntry('2026-07-17', {
      hadBowelMovement: false,
    });
    const second = await createDailyEntry('2026-07-17', {
      hadBowelMovement: true,
      stoolType: 4,
    });

    const stored = await getEntriesByDate('2026-07-17');

    expect(first.id).not.toBe(second.id);
    expect(stored).toHaveLength(2);
    expect(stored.map(({ id }) => id)).toEqual([first.id, second.id]);
  });

  it('updates and deletes by id without changing a sibling event', async () => {
    const first = await createDailyEntry('2026-07-17', {
      hadBowelMovement: false,
    });
    const sibling = await createDailyEntry('2026-07-17', {
      hadBowelMovement: true,
      stoolType: 4,
    });

    const updated = await updateDailyEntry(first.id, {
      hadBowelMovement: true,
      stoolType: 2,
    });

    expect(updated).toMatchObject({
      id: first.id,
      checkedInAt: first.checkedInAt,
      createdAt: first.createdAt,
      hadBowelMovement: true,
      stoolType: 2,
    });
    expect(await getEntriesByDate('2026-07-17')).toContainEqual(sibling);
    expect(await deleteDailyEntry(sibling.id)).toBe(true);
    expect(await deleteDailyEntry(sibling.id)).toBe(false);
    expect(await getEntriesByDate('2026-07-17')).toEqual([updated]);
    expect(await updateDailyEntry('missing', { hadBowelMovement: false })).toBeNull();
  });

  it('returns every event belonging to each included recent date', async () => {
    await createDailyEntry('2026-07-16', { hadBowelMovement: false });
    const firstLatest = await createDailyEntry('2026-07-17', {
      hadBowelMovement: false,
    });
    const secondLatest = await createDailyEntry('2026-07-17', {
      hadBowelMovement: true,
    });

    expect((await getEntries(1)).map(({ id }) => id)).toEqual([
      firstLatest.id,
      secondLatest.id,
    ]);
    expect(await getAllEntries()).toHaveLength(3);
  });
});
