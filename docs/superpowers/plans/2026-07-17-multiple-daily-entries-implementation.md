# Multiple Daily Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve every Yes/No check-in as an independent event, visualize each day's ordered events in the History calendar, and make storage, analytics, reminders, exports, and LLM summaries handle duplicate dates correctly.

**Architecture:** `DailyEntry` remains the persisted event. A new pure daily-aggregation module groups and sorts events, and every date-oriented consumer derives its day state from that module. Native SQLite migrates away from the `local_date` unique constraint; web storage changes to ID-based mutations. Screens call explicit create/update/delete APIs so creating a second entry can never overwrite the first.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `expo-sqlite`, React Native Web, Jest, Node test runner, and the Expo 57-compatible `react-native-svg` package.

## Global constraints

- Read the exact Expo 57 documentation for every Expo API introduced or changed by this plan before editing code.
- Use test-driven development: add a failing focused test, run it and confirm the expected failure, implement the minimum behavior, then rerun it.
- Preserve legacy rows and timestamps. Never rewrite an existing event merely because another event shares its date.
- Keep LLM requests aggregate-only. Raw dates, entry arrays, notes, profile data, and notification data remain forbidden.
- Use `checkedInAt`, then `id`, as the stable within-day ordering everywhere.
- Commit after each task only when its focused tests and type checking pass.

## File structure

- Create `src/lib/dailyEntries.ts` for stable event ordering, grouping, day summaries, statuses, and accessibility copy.
- Create `src/__tests__/dailyEntries.test.ts` for pure aggregation behavior.
- Modify `src/types.ts` so `HistoryDay` owns `entries` and `HistoryStatus` supports `mixed`; rename event-oriented trend fields accurately.
- Modify `src/storage/database.ts` for the native schema rebuild and ID-based CRUD.
- Modify `src/storage/database.web.ts` for matching web CRUD and recent-date loading.
- Create `src/__tests__/database.web.test.ts` and `src/__tests__/databaseMigration.test.ts` for persistence behavior.
- Modify `src/lib/trends.ts`, `src/lib/dailyLogFeedback.ts`, and `src/lib/exportData.ts` for day-versus-event semantics.
- Modify their existing test files with duplicate-date fixtures.
- Modify `src/services/notifications.ts` and notification tests for the any-Yes rule.
- Modify `src/lib/llmWellnessNotes.ts`, `src/lib/llmWellnessQuestions.ts`, `server/wellness-note-proxy.mjs`, and their tests as one contract change.
- Modify `App.tsx` for append/edit/delete behavior, today's event list, grouped History activity, and the calendar ring.
- Create `src/components/CalendarEntryRing.tsx`, `src/lib/calendarRing.ts`, and focused geometry/component tests.
- Modify `package.json` and `package-lock.json` only through `npx expo install react-native-svg`.

---

### Task 1: Shared daily event aggregation

**Files:**

- Create: `src/lib/dailyEntries.ts`
- Create: `src/__tests__/dailyEntries.test.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/trends.ts`
- Modify: `src/__tests__/trends.test.ts`

**Step 1: Write failing aggregation tests**

Create fixtures with two No entries and one Yes entry on the same date, deliberately supplied out of order. Assert:

```ts
expect(groupEntriesByDate(entries).get('2026-07-09')?.map(({ id }) => id))
  .toEqual(['no-early', 'no-later', 'yes-last']);
expect(summarizeEntryDay('2026-07-09', entries, { today: '2026-07-17' }))
  .toMatchObject({ status: 'mixed', yesCount: 1, noCount: 2, totalCount: 3 });
expect(formatEntryDayAccessibility(summary)).toBe(
  'July 9, 3 logs: 1 yes, 2 no',
);
```

Also cover zero events as `pending` today, zero events as `missed` in the past, one Yes, one No, and ID tie-breaking.

**Step 2: Confirm the tests fail**

Run: `npx jest --runInBand src/__tests__/dailyEntries.test.ts`

Expected: module/type import failures because the new helpers and `mixed` status do not exist.

**Step 3: Implement the pure API**

Add these exports:

```ts
export type EntryDaySummary = {
  localDate: string;
  entries: DailyEntry[];
  status: HistoryStatus;
  yesCount: number;
  noCount: number;
  totalCount: number;
  hasBowelMovement: boolean;
};

export function compareDailyEntries(a: DailyEntry, b: DailyEntry): number;
export function groupEntriesByDate(entries: DailyEntry[]): Map<string, DailyEntry[]>;
export function summarizeEntryDay(
  localDate: string,
  entries: DailyEntry[],
  options: { today?: string; includeTodayAsMissed?: boolean },
): EntryDaySummary;
export function formatEntryDayAccessibility(
  summary: EntryDaySummary,
  label?: string,
): string;
```

Change `HistoryStatus` to include `mixed` and change `HistoryDay.entry` to `HistoryDay.entries`. Refactor both history builders to use the helper. Treat `mixed` as answered and as a bowel-movement day.

**Step 4: Verify**

Run:

```bash
npx jest --runInBand src/__tests__/dailyEntries.test.ts src/__tests__/trends.test.ts
npm run typecheck
```

Expected: all focused tests and TypeScript pass.

**Step 5: Commit**

```bash
git add src/lib/dailyEntries.ts src/__tests__/dailyEntries.test.ts src/types.ts src/lib/trends.ts src/__tests__/trends.test.ts
git commit -m "feat: aggregate multiple daily entries"
```

---

### Task 2: Native and web event storage

**Files:**

- Modify: `src/storage/database.ts`
- Modify: `src/storage/database.web.ts`
- Create: `src/__tests__/database.web.test.ts`
- Create: `src/__tests__/databaseMigration.test.ts`
- Modify: `src/__tests__/flowBetterScreen.test.ts`

**Step 1: Write failing storage tests**

For web storage, install a test `window.localStorage`, create two entries on the same date, update the first by ID, and delete the second. Assert the sibling is unchanged and ordering is stable.

For native migration, mock the Expo SQLite database methods. Given a legacy unique index, assert the transaction creates `daily_entries_v2`, copies every column, drops/renames inside one exclusive transaction, and creates `daily_entries_date_time_idx`. Given the new index, assert a second initialization does not rebuild.

**Step 2: Confirm failure**

Run: `npx jest --runInBand src/__tests__/database.web.test.ts src/__tests__/databaseMigration.test.ts`

Expected: missing CRUD exports and schema still contains `local_date TEXT NOT NULL UNIQUE`.

**Step 3: Implement matching storage contracts**

Replace date upsert with:

```ts
export async function createDailyEntry(
  localDate: string,
  input: DailyEntryInput,
): Promise<DailyEntry>;
export async function updateDailyEntry(
  id: string,
  input: DailyEntryInput,
): Promise<DailyEntry | null>;
export async function deleteDailyEntry(id: string): Promise<boolean>;
export async function getEntriesByDate(localDate: string): Promise<DailyEntry[]>;
```

Generate unique IDs from time plus random entropy, preserve `checkedInAt` and `createdAt` on update, and order by `local_date`, `checked_in_at`, then `id`. Interpret `getEntries(limit)` as a distinct-date limit: select the newest date keys, then return every event belonging to those keys.

For SQLite, use `withExclusiveTransactionAsync` and metadata inspection to rebuild only the legacy unique schema. New installs create the non-unique table directly and create:

```sql
CREATE INDEX IF NOT EXISTS daily_entries_date_time_idx
ON daily_entries(local_date, checked_in_at, id);
```

**Step 4: Verify**

Run:

```bash
npx jest --runInBand src/__tests__/database.web.test.ts src/__tests__/databaseMigration.test.ts src/__tests__/flowBetterScreen.test.ts
npm run typecheck
```

**Step 5: Commit**

```bash
git add src/storage/database.ts src/storage/database.web.ts src/__tests__/database.web.test.ts src/__tests__/databaseMigration.test.ts src/__tests__/flowBetterScreen.test.ts
git commit -m "feat: persist multiple entries per day"
```

---

### Task 3: Event-aware trends, feedback, and CSV

**Files:**

- Modify: `src/types.ts`
- Modify: `src/lib/trends.ts`
- Modify: `src/__tests__/trends.test.ts`
- Modify: `src/lib/dailyLogFeedback.ts`
- Modify: `src/__tests__/dailyLogFeedback.test.ts`
- Modify: `src/lib/exportData.ts`
- Modify: `src/__tests__/exportData.test.ts`

**Step 1: Add duplicate-date expectations**

For two Yes events and one No event on one date, assert one bowel-movement day, two bowel movements, one completed day, event-counted stool/symptom/laxative/detail metrics, and a zero-day movement interval. Assert streak feedback still advances once for the date. Assert CSV emits three rows ordered by `checkedInAt`, then ID.

**Step 2: Confirm failure**

Run: `npx jest --runInBand src/__tests__/trends.test.ts src/__tests__/dailyLogFeedback.test.ts src/__tests__/exportData.test.ts`

Expected: current date map overwrites siblings and event counts are too low.

**Step 3: Implement explicit day/event semantics**

Update `TrendSummary` with accurate event fields while keeping the existing day fields needed by the UI:

```ts
bowelMovementCountLast30: number;
bowelMovementDaysLast30: number;
averageBowelMovementsPerWeekLast30: number;
hardOrLumpyMovementsLast30: number;
looseOrWateryMovementsLast30: number;
symptomBurdenEntriesLast30: number;
laxativeUseEntriesLast30: number;
noteEntriesLast30: number;
detailEntriesLast30: number;
```

Build frequency, Bristol, symptom, laxative, detail, and interval series from chronologically sorted Yes events. Build completed/check rates, missed counts, gaps, and feedback from aggregated days.

**Step 4: Verify and commit**

Run the focused tests plus `npm run typecheck`, then:

```bash
git add src/types.ts src/lib/trends.ts src/__tests__/trends.test.ts src/lib/dailyLogFeedback.ts src/__tests__/dailyLogFeedback.test.ts src/lib/exportData.ts src/__tests__/exportData.test.ts
git commit -m "feat: distinguish movement and day metrics"
```

---

### Task 4: Notification rules for multi-entry days

**Files:**

- Modify: `src/services/notifications.ts`
- Modify: `src/__tests__/notifications.test.ts`

**Step 1: Write failing integration tests**

Assert that the first No schedules the logged-No reminder, a later Yes cancels it, and a later No does not re-schedule once any Yes exists. Assert missed-reminder cancellation still happens for the first event and historical rescheduling uses distinct dates.

**Step 2: Confirm failure**

Run: `npx jest --runInBand src/__tests__/notifications.test.ts`

Expected: the current implementation decides from only the just-saved event.

**Step 3: Implement the any-Yes rule**

Change synchronization to load `getEntriesByDate(entry.localDate)`, cancel the missed reminder, then:

- cancel logged-No when any entry is Yes;
- schedule it only when at least one event exists and all are No;
- do nothing when reminders are disabled or the day is empty.

**Step 4: Verify and commit**

Run the focused test and `npm run typecheck`, then:

```bash
git add src/services/notifications.ts src/__tests__/notifications.test.ts
git commit -m "feat: aggregate reminders across daily entries"
```

---

### Task 5: Shared aggregate LLM contract

**Files:**

- Modify: `src/lib/llmWellnessNotes.ts`
- Modify: `src/lib/llmWellnessQuestions.ts`
- Modify: `src/__tests__/llmWellnessNotes.test.ts`
- Modify: `src/__tests__/llmWellnessQuestions.test.ts`
- Modify: `server/wellness-note-proxy.mjs`
- Modify: `server/wellness-note-proxy.test.mjs`

**Step 1: Change tests first**

Require both clients and the proxy to use exactly:

```ts
{
  summaryWindowDays: 30,
  bowelMovementCountLast30,
  bowelMovementDaysLast30,
  averageBowelMovementsPerWeekLast30,
  currentGapDays,
  longestGapDays,
  hardOrLumpyMovementsLast30,
  looseOrWateryMovementsLast30,
  symptomBurdenEntriesLast30,
  laxativeUseEntriesLast30,
  checkInRateLast30,
  detailEntriesLast30,
}
```

Keep tests that reject extra keys, raw entry/date/note/profile fields, invalid numbers, and request-body logging.

**Step 2: Confirm failure**

Run:

```bash
npx jest --runInBand src/__tests__/llmWellnessNotes.test.ts src/__tests__/llmWellnessQuestions.test.ts
node --test server/wellness-note-proxy.test.mjs
```

**Step 3: Update client and server atomically**

Have the question payload reuse the note summary builder/type. Update the server's exact key allowlist, validation, normalized summary, and prompt wording to distinguish movements from movement days.

**Step 4: Verify and commit**

Run the client tests, server tests, and typecheck, then:

```bash
git add src/lib/llmWellnessNotes.ts src/lib/llmWellnessQuestions.ts src/__tests__/llmWellnessNotes.test.ts src/__tests__/llmWellnessQuestions.test.ts server/wellness-note-proxy.mjs server/wellness-note-proxy.test.mjs
git commit -m "feat: send event-aware wellness aggregates"
```

---

### Task 6: Today appends and lists events

**Files:**

- Modify: `App.tsx`
- Modify: `src/__tests__/flowBetterScreen.test.ts`

**Step 1: Write failing UI tests**

Render `TodayScreen` with two entries and assert both chronological log rows appear. Submit a third log and assert `createDailyEntry` is called, the form resets, and the existing logs are not passed as an editable default.

**Step 2: Confirm failure**

Run: `npx jest --runInBand src/__tests__/flowBetterScreen.test.ts`

**Step 3: Implement append behavior**

Derive `todayEntries` from the group helper. Replace both date-upsert handlers with create/update/delete handlers. After create, reload entries, synchronize notifications, show feedback, and reset the form. Add a compact accessible “Today's logs” list that shows time, Yes/No, Bristol type, symptoms, and laxative detail per event.

**Step 4: Verify and commit**

Run the UI tests and typecheck, then:

```bash
git add App.tsx src/__tests__/flowBetterScreen.test.ts
git commit -m "feat: append and show today's logs"
```

---

### Task 7: Segmented calendar ring

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/calendarRing.ts`
- Create: `src/__tests__/calendarRing.test.ts`
- Create: `src/components/CalendarEntryRing.tsx`
- Modify: `App.tsx`

**Step 1: Read and install the Expo 57-compatible package**

Read the exact versioned `react-native-svg` page, then run:

```bash
npx expo install react-native-svg
```

**Step 2: Write failing geometry tests**

Expose a pure function:

```ts
export type CalendarRingSegment = {
  entryId: string;
  color: string;
  dashLength: number;
  dashOffset: number;
};

export function buildCalendarRingSegments(
  entries: DailyEntry[],
  circumference: number,
  gapLength?: number,
): CalendarRingSegment[];
```

Assert one Yes produces one continuous purple stroke, two Yes entries produce two equal purple arcs, and No/No/Yes produces red/red/purple arcs in chronological order with equal lengths and visible gaps.

**Step 3: Implement ring and calendar integration**

Render an SVG circle centered behind the date text. Rotate the SVG group -90 degrees so the first arc begins at 12 o'clock. For one event render a continuous stroke; for multiple events calculate equal arc length from `(circumference - totalGap) / count` and use dash offsets. Keep a 44-point button target and place selected-day fill behind the SVG.

Set the button accessibility label from `formatEntryDayAccessibility`; do not use color as the only signal.

**Step 4: Verify and commit**

Run:

```bash
npx jest --runInBand src/__tests__/calendarRing.test.ts src/__tests__/dailyEntries.test.ts
npm run typecheck
```

Then commit:

```bash
git add package.json package-lock.json src/lib/calendarRing.ts src/__tests__/calendarRing.test.ts src/components/CalendarEntryRing.tsx App.tsx
git commit -m "feat: render ordered calendar entry rings"
```

---

### Task 8: Selected-day activity and grouped history

**Files:**

- Modify: `App.tsx`
- Modify: `src/__tests__/flowBetterScreen.test.ts`

**Step 1: Write failing interaction tests**

Select a day containing No/No/Yes and assert the card renders all three rows chronologically, total and Yes/No count pills, and “Add another log.” Open the middle row, edit it by ID without changing `checkedInAt`, delete it after confirmation, and assert deleting the final event returns the panel to an explicit empty state.

**Step 2: Confirm failure**

Run: `npx jest --runInBand src/__tests__/flowBetterScreen.test.ts`

**Step 3: Implement the approved History behavior**

Replace `BackfillEntryPanel` with a selected-day activity card plus an event editor. The card owns three modes: list, create, and edit. List mode shows date, total count, Yes/No pills, chronological event rows, and Add another log. Edit mode receives one `DailyEntry`; create mode starts blank. Delete is available only in edit mode and uses `Alert.alert` confirmation. Missing update/delete results show a recoverable inline message and reload entries.

Update Recent History to render one group per `HistoryDay`, with explicit Yes and No badges and an event-detail summary. Update every remaining `day.entry` consumer to iterate `day.entries` or use the aggregate helper.

**Step 4: Verify and commit**

Run UI tests, all Jest tests, server tests, and typecheck, then:

```bash
git add App.tsx src/__tests__/flowBetterScreen.test.ts
git commit -m "feat: manage daily activity from history"
```

---

### Task 9: Full integration and release verification

**Files:**

- Modify only files required by failures found in this task.

**Step 1: Run the full verification matrix**

```bash
npm test
npm run typecheck
npx expo export --platform web
git diff --check main...HEAD
git status --short
```

Expected: all Jest and server tests pass, TypeScript reports no errors, Expo exports web successfully, the diff has no whitespace errors, and only intentional generated/untracked output remains.

**Step 2: Inspect multi-entry risk points**

Run:

```bash
rg -n "entryMap|day\.entry|getEntryByDate|upsertDailyEntry|ON CONFLICT\(local_date\)|local_date TEXT NOT NULL UNIQUE" App.tsx src server
rg -n "averagePerWeekLast30|hardOrLumpyDays|looseOrWateryDays|symptomBurdenDays|laxativeUseDays|detailDays" App.tsx src server
```

Expected: no stale single-entry storage or daily overwrite paths remain; any legacy metric names that remain are deliberately day-oriented.

**Step 3: Manual web smoke test**

Run `npx expo start --web`, then verify:

1. Log No, No, Yes on one day.
2. Confirm the ring is red/red/purple clockwise from 12 o'clock.
3. Confirm History lists all three events and counts.
4. Edit the second event and delete the first without changing the third.
5. Confirm Today can append another entry.
6. Confirm Trends and wellness-note request data show event and day counts separately.

**Step 4: Commit only if integration fixes were needed**

If a verification command required a fix, rerun that command, stage exactly the
files changed for the fix as listed by `git status --short`, and commit them as
`fix: complete multi-entry integration`. If no fixes were needed, do not create
an empty commit.
