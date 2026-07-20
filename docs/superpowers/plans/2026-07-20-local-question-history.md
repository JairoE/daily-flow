# Local Question History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every successful Flow Better question-and-answer pair locally and render the complete newest-first history with local date and time.

**Architecture:** Add a typed, platform-neutral history value module, then extend the existing native SQLite and web `localStorage` adapters with identical create/list APIs. `FlowBetterScreen` owns loading and visible history state, writes only valid successful responses, and treats history failures as non-blocking.

**Tech Stack:** Expo SDK 57.0.0 reference, Expo 57.0.2, `expo-sqlite` 57.x async API, React 19.2.3, React Native 0.86, TypeScript 6, Jest/jest-expo

## Global Constraints

- Read and follow the exact [Expo SDK 57 SQLite reference](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) before changing storage code.
- Work only on the `codex/local-question-history` branch created from `origin/main`.
- Store only successful question-and-answer pairs; never store validation failures, timeouts, request failures, or invalid responses.
- Keep all successful pairs until the user invokes `Delete all local data`; do not add a retention cap or individual deletion.
- Store history only in native `expo-sqlite` or the existing web `daily-flow-state-v1` local state.
- Do not change the wellness proxy, its privacy-safe logs, OpenAI `store: false`, analytics behavior, or daily-entry CSV schema.
- Keep existing browser state readable when it has no `questionHistory` field.
- Use bound SQLite parameters for question and answer text.
- Display timestamps in the device locale with a medium date and short time; render `Time unavailable` for invalid timestamps.
- Do not add dependencies.

---

### Task 1: Add The Typed History Value Contract

**Files:**
- Create: `src/lib/questionHistory.ts`
- Create: `src/__tests__/questionHistory.test.ts`
- Modify: `src/types.ts:17`

**Interfaces:**
- Consumes: Question and answer strings plus optional deterministic `now` and `random` values for tests.
- Produces: `WellnessQuestionHistoryEntry`, `createWellnessQuestionHistoryValue(question, answer, options)`, `compareWellnessQuestionHistoryEntries(a, b)`, `normalizeWellnessQuestionHistory(value)`, and `formatWellnessQuestionAskedAt(askedAt)`.

- [ ] **Step 1: Write the failing history-value tests**

Create `src/__tests__/questionHistory.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `npx jest src/__tests__/questionHistory.test.ts --runInBand`

Expected: FAIL because `src/lib/questionHistory.ts` does not exist.

- [ ] **Step 3: Add the shared type and minimal helper implementation**

Add to `src/types.ts` after `Profile`:

```ts
export type WellnessQuestionHistoryEntry = {
  id: string;
  question: string;
  answer: string;
  askedAt: string;
};
```

Create `src/lib/questionHistory.ts`:

```ts
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
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npx jest src/__tests__/questionHistory.test.ts --runInBand`

Expected: PASS with five tests.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the typed value contract**

```bash
git add src/types.ts src/lib/questionHistory.ts src/__tests__/questionHistory.test.ts
git commit -m "feat: add question history value contract"
```

---

### Task 2: Persist History In Native And Web Storage

**Files:**
- Modify: `src/storage/database.ts:3-733`
- Modify: `src/storage/database.web.ts:1-358`
- Modify: `src/__tests__/database.native.test.ts:1-63`
- Modify: `src/__tests__/database.web.test.ts:1-99`

**Interfaces:**
- Consumes: `WellnessQuestionHistoryEntry`, `createWellnessQuestionHistoryValue`, `normalizeWellnessQuestionHistory`, and `compareWellnessQuestionHistoryEntries` from Task 1.
- Produces from both storage adapters: `getWellnessQuestionHistory(): Promise<WellnessQuestionHistoryEntry[]>` and `createWellnessQuestionHistoryEntry(question, answer): Promise<WellnessQuestionHistoryEntry>`.

- [ ] **Step 1: Add failing native storage tests**

Append this test inside `describe('native daily-entry storage', ...)` in `src/__tests__/database.native.test.ts`:

```ts
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
```

- [ ] **Step 2: Add failing web persistence and compatibility tests**

Use this import block in `src/__tests__/database.web.test.ts`, then add the
tests below:

```ts
import {
  createDailyEntry,
  createWellnessQuestionHistoryEntry,
  deleteAllData,
  deleteDailyEntry,
  getAllEntries,
  getEntries,
  getEntriesByDate,
  getWellnessQuestionHistory,
  updateDailyEntry,
} from '../storage/database.web';
```

```ts
  it('reads legacy state without question history as an empty collection', async () => {
    window.localStorage.setItem(
      'daily-flow-state-v1',
      JSON.stringify({ profile: null, entries: [], notificationRecords: [] }),
    );

    await expect(getWellnessQuestionHistory()).resolves.toEqual([]);
  });

  it('persists successful question history newest first', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-20T15:00:00.000Z'));
    const first = await createWellnessQuestionHistoryEntry(
      '  First question?  ',
      '  First answer.  ',
    );
    jest.setSystemTime(new Date('2026-07-20T16:00:00.000Z'));
    const second = await createWellnessQuestionHistoryEntry(
      'Second question?',
      'Second answer.',
    );
    jest.useRealTimers();

    expect(first).toMatchObject({
      question: 'First question?',
      answer: 'First answer.',
      askedAt: '2026-07-20T15:00:00.000Z',
    });
    await expect(getWellnessQuestionHistory()).resolves.toEqual([second, first]);
  });

  it('clears question history with all other local data', async () => {
    await createWellnessQuestionHistoryEntry('Question?', 'Answer.');
    await deleteAllData();

    await expect(getWellnessQuestionHistory()).resolves.toEqual([]);
  });
```

- [ ] **Step 3: Run both focused storage tests and confirm the expected failures**

Run: `npx jest src/__tests__/database.native.test.ts src/__tests__/database.web.test.ts --runInBand`

Expected: FAIL because both adapters lack the history exports and the native schema lacks the history table.

- [ ] **Step 4: Implement the native SQLite table and bound CRUD functions**

In `src/storage/database.ts`, add `WellnessQuestionHistoryEntry` to the existing
type import and import the Task 1 builder:

```ts
import { createWellnessQuestionHistoryValue } from '../lib/questionHistory';
```

Add this row type:

```ts
type WellnessQuestionHistoryRow = {
  id: string;
  question: string;
  answer: string;
  asked_at: string;
};
```

Add the table and index to `schema` after `notification_records`:

```sql
CREATE TABLE IF NOT EXISTS wellness_question_history (
  id TEXT PRIMARY KEY NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  asked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wellness_question_history_asked_at_idx
ON wellness_question_history(asked_at DESC, id DESC);
```

Add the mapper and exported functions before notification-record functions:

```ts
function mapWellnessQuestionHistoryEntry(
  row: WellnessQuestionHistoryRow,
): WellnessQuestionHistoryEntry {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    askedAt: row.asked_at,
  };
}

export async function getWellnessQuestionHistory(): Promise<
  WellnessQuestionHistoryEntry[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WellnessQuestionHistoryRow>(
    `SELECT * FROM wellness_question_history
     ORDER BY asked_at DESC, id DESC`,
  );

  return rows.map(mapWellnessQuestionHistoryEntry);
}

export async function createWellnessQuestionHistoryEntry(
  question: string,
  answer: string,
): Promise<WellnessQuestionHistoryEntry> {
  const entry = createWellnessQuestionHistoryValue(question, answer);
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO wellness_question_history (id, question, answer, asked_at)
     VALUES (?, ?, ?, ?)`,
    [entry.id, entry.question, entry.answer, entry.askedAt],
  );

  return entry;
}
```

Add the history deletion as the first statement in `deleteAllData`:

```sql
DELETE FROM wellness_question_history;
```

- [ ] **Step 5: Implement backward-compatible web storage**

In `src/storage/database.web.ts`, add `WellnessQuestionHistoryEntry` to the
existing type import and add the Task 1 helper imports:

```ts
import {
  compareWellnessQuestionHistoryEntries,
  createWellnessQuestionHistoryValue,
  normalizeWellnessQuestionHistory,
} from '../lib/questionHistory';
```

Extend `WebState` and `emptyState()`:

```ts
type WebState = {
  profile: Profile | null;
  entries: DailyEntry[];
  notificationRecords: NotificationRecord[];
  questionHistory: WellnessQuestionHistoryEntry[];
};

function emptyState(): WebState {
  return {
    profile: null,
    entries: [],
    notificationRecords: [],
    questionHistory: [],
  };
}
```

Add this field to the object returned by `readState()`:

```ts
questionHistory: normalizeWellnessQuestionHistory(state.questionHistory),
```

Add these exports before notification-record functions:

```ts
export async function getWellnessQuestionHistory(): Promise<
  WellnessQuestionHistoryEntry[]
> {
  return [...readState().questionHistory].sort(
    compareWellnessQuestionHistoryEntries,
  );
}

export async function createWellnessQuestionHistoryEntry(
  question: string,
  answer: string,
): Promise<WellnessQuestionHistoryEntry> {
  const entry = createWellnessQuestionHistoryValue(question, answer);
  const state = readState();

  writeState({
    ...state,
    questionHistory: [...state.questionHistory, entry].sort(
      compareWellnessQuestionHistoryEntries,
    ),
  });

  return entry;
}
```

- [ ] **Step 6: Run focused and regression storage tests**

Run: `npx jest src/__tests__/questionHistory.test.ts src/__tests__/database.native.test.ts src/__tests__/database.web.test.ts src/__tests__/databaseMigration.test.ts --runInBand`

Expected: PASS with all tests in the four suites.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit both storage adapters**

```bash
git add src/storage/database.ts src/storage/database.web.ts src/__tests__/database.native.test.ts src/__tests__/database.web.test.ts
git commit -m "feat: persist local question history"
```

---

### Task 3: Load, Save, And Render Flow Better History

**Files:**
- Modify: `App.tsx:29-94,398-410,1149-1311,2490-2649,3212-3229`
- Modify: `src/__tests__/flowBetterScreen.test.ts:14-189,678-757`

**Interfaces:**
- Consumes: `getWellnessQuestionHistory`, `createWellnessQuestionHistoryEntry`, `formatWellnessQuestionAskedAt`, and `WellnessQuestionHistoryEntry`.
- Produces: A newest-first `Question history` list, successful-answer persistence, non-blocking load/save warnings, updated privacy copy, and full-data deletion copy.

- [ ] **Step 1: Extend the storage mock and add failing history UI tests**

Add `createWellnessQuestionHistoryEntry: jest.fn()` and
`getWellnessQuestionHistory: jest.fn()` to the database mock. Import both
functions, import `formatWellnessQuestionAskedAt` from
`src/lib/questionHistory`, create typed mocks, and reset them in `beforeEach`
with these safe defaults:

```ts
import {
  createDailyEntry,
  createWellnessQuestionHistoryEntry,
  getEntries,
  getProfile,
  getWellnessQuestionHistory,
  initializeStorage,
} from '../storage/database';
import { formatWellnessQuestionAskedAt } from '../lib/questionHistory';

const mockCreateWellnessQuestionHistoryEntry =
  createWellnessQuestionHistoryEntry as jest.MockedFunction<
    typeof createWellnessQuestionHistoryEntry
  >;
const mockGetWellnessQuestionHistory =
  getWellnessQuestionHistory as jest.MockedFunction<
    typeof getWellnessQuestionHistory
  >;
```

Add these resets before the safe defaults in `beforeEach`:

```ts
mockCreateWellnessQuestionHistoryEntry.mockReset();
mockGetWellnessQuestionHistory.mockReset();
```

```ts
mockGetWellnessQuestionHistory.mockResolvedValue([]);
mockCreateWellnessQuestionHistoryEntry.mockImplementation(
  async (question, answer) => ({
    id: 'saved-history',
    question,
    answer,
    askedAt: '2026-07-20T19:42:00.000Z',
  }),
);
```

Add a fixture helper:

```ts
function questionHistoryEntry(
  id: string,
  question: string,
  answer: string,
  askedAt: string,
) {
  return { id, question, answer, askedAt };
}
```

Append these tests to the Flow Better describe block:

```ts
  it('loads and renders saved question history newest first', async () => {
    const newer = questionHistoryEntry(
      'newer',
      'Newer question?',
      'Newer answer.',
      '2026-07-20T15:42:00',
    );
    const older = questionHistoryEntry(
      'older',
      'Older question?',
      'Older answer.',
      '2026-07-19T15:42:00',
    );
    mockGetWellnessQuestionHistory.mockResolvedValue([newer, older]);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });

    const text = renderedText(renderer!);
    expect(text).toContain('Question history');
    expect(text).toContain('You asked');
    expect(text.indexOf('Newer question?')).toBeLessThan(
      text.indexOf('Older question?'),
    );
    expect(text).toContain(formatWellnessQuestionAskedAt(newer.askedAt));
  });

  it('persists and prepends a successful submitted question and answer', async () => {
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: true,
      answer: 'A saved answer.',
    });
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root
        .findByType(TextInput)
        .props.onChangeText('  What can help?  ');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    expect(mockCreateWellnessQuestionHistoryEntry).toHaveBeenCalledWith(
      'What can help?',
      'A saved answer.',
    );
    expect(renderedText(renderer!)).toContain('A saved answer.');
    expect(renderedText(renderer!)).toContain('What can help?');
  });

  it('does not persist a failed answer request', async () => {
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: false,
      reason: 'request-failed',
    });
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root.findByType(TextInput).props.onChangeText('Question?');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    expect(mockCreateWellnessQuestionHistoryEntry).not.toHaveBeenCalled();
    expect(renderedText(renderer!)).toContain(
      'Unable to answer right now. Please try again.',
    );
  });

  it('keeps question answering usable when history loading fails', async () => {
    mockGetWellnessQuestionHistory.mockRejectedValue(new Error('storage down'));
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });

    expect(renderedText(renderer!)).toContain(
      'Question history is unavailable right now.',
    );
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }),
    ).toBeTruthy();
  });

  it('keeps a valid answer visible when history saving fails', async () => {
    mockRequestLlmWellnessAnswer.mockResolvedValue({
      ok: true,
      answer: 'A visible answer.',
    });
    mockCreateWellnessQuestionHistoryEntry.mockRejectedValue(
      new Error('storage down'),
    );
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-20',
          profile,
          trends,
        }),
      );
      await flushMicrotasks();
    });
    act(() => {
      renderer!.root.findByType(TextInput).props.onChangeText('Question?');
    });
    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Ask' }).props.onPress();
      await flushMicrotasks();
    });

    const text = renderedText(renderer!);
    expect(text).toContain('A visible answer.');
    expect(text).toContain(
      'Answer received, but it could not be added to question history.',
    );
  });
```

- [ ] **Step 2: Add a failing privacy-copy component test**

Export `SettingsScreen` from `App.tsx`, import it in the test file, and add:

```ts
  it('explains local question history retention in Settings', () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(SettingsScreen, {
          profile,
          onSave: async () => undefined,
          onExportData: async () => undefined,
          onDeleteData: () => undefined,
        }),
      );
    });

    expect(renderedText(renderer!)).toContain(
      'Successful questions and answers stay on this device until you delete local data.',
    );
  });
```

- [ ] **Step 3: Run the focused component test and confirm the expected failures**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

Expected: FAIL because the screen does not load, save, or render history and the
Settings copy does not describe retention.

- [ ] **Step 4: Add history state, loading, and successful-answer persistence**

Add the two storage functions to the existing database import in `App.tsx`:

```ts
createWellnessQuestionHistoryEntry,
getWellnessQuestionHistory,
```

Add the timestamp formatter import:

```ts
import { formatWellnessQuestionAskedAt } from './src/lib/questionHistory';
```

Add `WellnessQuestionHistoryEntry` to the existing type import, then add state
after the existing question state:

```ts
const [questionHistory, setQuestionHistory] = useState<
  WellnessQuestionHistoryEntry[]
>([]);
const [historyError, setHistoryError] = useState('');
```

Add this mount effect before `handleAskQuestion`:

```ts
useEffect(() => {
  let cancelled = false;

  getWellnessQuestionHistory()
    .then((entries) => {
      if (!cancelled) {
        setQuestionHistory(entries);
        setHistoryError('');
      }
    })
    .catch(() => {
      if (!cancelled) {
        setHistoryError('Question history is unavailable right now.');
      }
    });

  return () => {
    cancelled = true;
  };
}, []);
```

Replace the successful branch in `handleAskQuestion` with:

```ts
if (result.ok) {
  setAnswer(result.answer);

  try {
    const savedEntry = await createWellnessQuestionHistoryEntry(
      submittedQuestion,
      result.answer,
    );
    setQuestionHistory((current) => [
      savedEntry,
      ...current.filter((entry) => entry.id !== savedEntry.id),
    ]);
    setHistoryError('');
  } catch {
    setHistoryError(
      'Answer received, but it could not be added to question history.',
    );
  }

  return;
}
```

- [ ] **Step 5: Render the history list and local timestamps**

Add this block after the current-answer block and before the Ask panel closes:

```tsx
<View style={styles.questionHistorySection}>
  <Text style={styles.sectionLabel}>Question history</Text>

  {historyError ? (
    <Text accessibilityLiveRegion="polite" style={styles.errorText}>
      {historyError}
    </Text>
  ) : null}

  {questionHistory.length === 0 ? (
    <Text style={styles.bodyText}>
      Successful answers you ask for will appear here on this device.
    </Text>
  ) : (
    questionHistory.map((entry) => (
      <View
        key={entry.id}
        style={styles.questionHistoryCard}
        testID={`question-history-${entry.id}`}
      >
        <Text style={styles.questionHistoryTime}>
          {formatWellnessQuestionAskedAt(entry.askedAt)}
        </Text>
        <Text style={styles.questionHistoryLabel}>You asked</Text>
        <Text style={styles.bodyText}>{entry.question}</Text>
        <Text style={styles.questionHistoryLabel}>Answer</Text>
        <Text style={styles.bodyText}>{entry.answer}</Text>
      </View>
    ))
  )}
</View>
```

Add styles beside the existing wellness styles:

```ts
questionHistorySection: {
  borderTopColor: palette.border,
  borderTopWidth: 1,
  gap: 12,
  marginTop: 20,
  paddingTop: 18,
},
questionHistoryCard: {
  backgroundColor: palette.tile,
  borderRadius: 18,
  gap: 6,
  padding: 14,
},
questionHistoryTime: {
  color: palette.softText,
  fontSize: 12,
  fontWeight: '800',
},
questionHistoryLabel: {
  color: palette.purple,
  fontSize: 13,
  fontWeight: '900',
  marginTop: 4,
  textTransform: 'uppercase',
},
```

- [ ] **Step 6: Update local-retention and deletion copy**

Export `SettingsScreen` and replace its sensitive-data paragraph with:

```tsx
<Text style={styles.bodyText}>
  Data is stored locally on this device. Private reminders hide bowel movement
  wording from notification text. Daily Flow Pro+ sends summary counts and any
  question you choose to submit to your configured proxy. Successful questions
  and answers stay on this device until you delete local data.
</Text>
```

Change the `Delete local data?` alert body to:

```ts
'This removes your profile, check-ins, question history, and reminder records from this device.'
```

- [ ] **Step 7: Run the focused component and storage regression tests**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts src/__tests__/questionHistory.test.ts src/__tests__/database.native.test.ts src/__tests__/database.web.test.ts --runInBand`

Expected: PASS with all tests in the four suites.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the Flow Better history experience**

```bash
git add App.tsx src/__tests__/flowBetterScreen.test.ts
git commit -m "feat: show local question history"
```

---

### Task 4: Document Privacy Behavior And Verify The Complete Branch

**Files:**
- Modify: `README.md:66-97`

**Interfaces:**
- Consumes: The completed local history behavior from Tasks 1-3.
- Produces: User-facing repository documentation that accurately distinguishes local history from proxy submission and confirms the branch is releasable.

- [ ] **Step 1: Update the Pro+ and privacy documentation**

Add this bullet after the existing Q&A bullet in the Daily Flow Pro+ section:

```md
- Keep every successful question and answer in a local, newest-first history
  until `Delete local data` is used.
```

Add this bullet in Data And Privacy after the native/web storage bullets:

```md
- Successful Flow Better questions and answers stay in the same local storage,
  are not included in CSV exports, and are cleared by `Delete local data`.
```

- [ ] **Step 2: Confirm no remote history or export changes were introduced**

Run:

```bash
git diff origin/main...HEAD -- server/ src/lib/exportData.ts src/services/exportEntries.ts
```

Expected: no output.

Run:

```bash
rg -n "wellness_question_history|questionHistory" src App.tsx README.md
```

Expected: matches only the local type, helper, storage adapters, tests, UI, and
documentation added by this plan.

- [ ] **Step 3: Run formatting and type verification**

Run: `git diff --check`

Expected: exit 0 with no output.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 4: Run the complete automated test suite**

Run: `npm test`

Expected: exit 0 with every Jest suite and every `server/*.test.mjs` test
passing.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: explain local question history"
```

- [ ] **Step 6: Re-run final verification after the documentation commit**

Run: `git diff --check && npm run typecheck && npm test`

Expected: exit 0 with no whitespace errors, no TypeScript errors, and all Jest
and Node tests passing.

- [ ] **Step 7: Review the final branch diff against the approved spec**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- App.tsx src/types.ts src/lib/questionHistory.ts src/storage/database.ts src/storage/database.web.ts README.md
```

Expected: only the approved design/plan documents, typed local history helpers,
native/web persistence, Flow Better UI/error behavior, tests, and privacy
documentation are present; the worktree has no uncommitted implementation
changes after the final commit.
