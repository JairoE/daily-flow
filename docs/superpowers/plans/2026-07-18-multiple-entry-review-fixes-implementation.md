# Multiple-Entry Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five blocking multiple-entry review findings while preserving the existing event model, calendar design, and aggregate-only LLM boundary.

**Architecture:** Keep writes local-first and split persistence success from fallible refresh/notification side effects. Make notification reconciliation derive the desired reminder state from today's entries, make future days read-only at UI and handler boundaries, and execute the legacy SQLite rebuild with its prerequisite column migrations in one exclusive transaction.

**Tech Stack:** Expo 57, React Native 0.86, React 19, TypeScript 6, Jest 29, expo-sqlite 57, expo-notifications 57.

## Global Constraints

- Read and follow the exact Expo 57 documentation at `https://docs.expo.dev/versions/v57.0.0/` before production changes.
- Keep LLM requests aggregate-only; no raw entry fields may cross the proxy boundary.
- Preserve chronological event ordering and ID-based CRUD.
- Use test-first red-green cycles and incremental atomic commits.
- Do not include the shared-entry-form or versioned-migration-framework follow-ups.

---

### Task 1: Stabilize History screen tests

**Files:**
- Modify: `src/__tests__/flowBetterScreen.test.ts`

**Interfaces:**
- Consumes: `HistoryScreen`'s existing `getLocalDateKey()` default.
- Produces: deterministic tests whose yesterday is `2026-07-16`.

- [ ] **Step 1: Confirm the existing failure**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

Expected: four History tests fail because the real date is 2026-07-18.

- [ ] **Step 2: Freeze and restore time**

Add suite lifecycle hooks:

```ts
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-07-17T16:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});
```

- [ ] **Step 3: Verify the focused suite**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

Expected: all Flow Better screen tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/flowBetterScreen.test.ts
git commit -m "test: freeze history screen date"
```

### Task 2: Keep future calendar days read-only

**Files:**
- Modify: `App.tsx`
- Modify: `src/__tests__/flowBetterScreen.test.ts`

**Interfaces:**
- Consumes: ISO `YYYY-MM-DD` local-date keys, which compare chronologically as strings.
- Produces: `SelectedDayActivity` without mutation actions for `localDate > today`, plus save-handler validation.

- [ ] **Step 1: Write failing UI tests**

Select a future `HistoryMonthDay`, assert the selected-day panel shows `Future dates are read-only.` and does not expose `Add another log` or an editable entry action.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

Expected: FAIL because the current selected-day panel exposes mutation actions.

- [ ] **Step 3: Add UI and handler guards**

Compute `isFutureDate = localDate > getLocalDateKey()` in the selected-day activity and editor. Render the read-only explanation instead of mutation controls, and throw `Choose today or an earlier date.` from the top-level create handler and editor save path when the date is future.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

```bash
git add App.tsx src/__tests__/flowBetterScreen.test.ts
git commit -m "fix: keep future history dates read only"
```

### Task 3: Make the native daily-entry migration atomic

**Files:**
- Modify: `src/storage/database.ts`
- Modify: `src/__tests__/databaseMigration.test.ts`
- Modify: `src/__tests__/database.native.test.ts`

**Interfaces:**
- Consumes: Expo SQLite 57 transaction objects, which expose the same query interface as `SQLiteDatabase`.
- Produces: `migrateDailyEntriesForMultipleEvents(db)` that owns both prerequisite daily-entry column migration and any legacy rebuild.

- [ ] **Step 1: Write a failing migration test**

Give the exclusive transaction a `getAllAsync()` result missing `details_recorded`; assert its `execAsync()` receives the `ALTER TABLE` before the rebuild SQL and the root database does not receive that ALTER.

- [ ] **Step 2: Run the migration tests and verify RED**

Run: `npx jest src/__tests__/databaseMigration.test.ts src/__tests__/database.native.test.ts --runInBand`

Expected: FAIL because column additions currently occur before `migrateDailyEntriesForMultipleEvents()` and outside its transaction.

- [ ] **Step 3: Move column migration into the owned path**

Allow `migrateDailyEntryColumns()` to accept the shared database/transaction query interface. On a legacy unique-date table, call it through the exclusive transaction before rebuilding. On a modern table, call it on the database before ensuring the index. Remove the standalone call from `getDatabase()`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx jest src/__tests__/databaseMigration.test.ts src/__tests__/database.native.test.ts --runInBand`

```bash
git add src/storage/database.ts src/__tests__/databaseMigration.test.ts src/__tests__/database.native.test.ts
git commit -m "fix: migrate daily entries atomically"
```

### Task 4: Reconcile reminders from today's resulting state

**Files:**
- Modify: `src/services/notifications.ts`
- Modify: `src/__tests__/notifications.test.ts`

**Interfaces:**
- Consumes: `getUpcomingMissedReminderTargets(profile, { from, days: 1 })` and current daily entries.
- Produces: `syncNotificationsForDate(profile, localDate, now?)` that schedules only for today and restores one still-upcoming missed reminder for an empty today.

- [ ] **Step 1: Write failing notification tests**

Add tests proving a historical No-only day does not schedule, and deleting today's final event schedules the still-upcoming missed reminder rather than a logged-No reminder.

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `npx jest src/__tests__/notifications.test.ts --runInBand`

Expected: FAIL because historical reconciliation schedules relative to now and empty today never restores the missed reminder.

- [ ] **Step 3: Implement date-aware reconciliation**

Cancel stale logged-No records for non-today dates. For empty today, cancel logged-No and schedule the single future missed target when reminders are enabled and no scheduled missed record already exists. For non-empty today, cancel missed and preserve the existing Yes/No aggregate behavior.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx jest src/__tests__/notifications.test.ts --runInBand`

```bash
git add src/services/notifications.ts src/__tests__/notifications.test.ts
git commit -m "fix: reconcile reminders for todays entries"
```

### Task 5: Separate committed writes from side-effect failures

**Files:**
- Modify: `App.tsx`
- Modify: `src/__tests__/flowBetterScreen.test.ts`

**Interfaces:**
- Consumes: committed `DailyEntry` values returned by native/web storage.
- Produces: create, update, and delete handlers that reject only persistence failures, update local entry state immediately, then report refresh or reminder failures without reopening the form.

- [ ] **Step 1: Write a failing app-level regression test**

Bootstrap the real `App` with mocked local storage, make `syncNotificationsAfterEntry()` reject after `createDailyEntry()` resolves, submit one No log, and assert the form resets, the saved entry remains represented, and `createDailyEntry()` was called once.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

Expected: FAIL because notification rejection currently rejects `TodayScreen.onLog` and preserves the form as if persistence failed.

- [ ] **Step 3: Implement the persistence boundary**

After create/update/delete returns, mutate `entries` from the committed result. Catch refresh failures without rejecting the form. Catch notification reconciliation failures separately and show `Log saved, but reminders could not be updated.` (or the matching update/delete copy). Keep persistence errors rejectable.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

```bash
git add App.tsx src/__tests__/flowBetterScreen.test.ts
git commit -m "fix: preserve successful entry writes"
```

### Task 6: Complete verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: all preceding fixes.
- Produces: evidence that tests, types, and the Expo 57 web bundle pass.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all Jest and Node server tests pass.

- [ ] **Step 2: Run TypeScript**

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 3: Build the Expo web export**

Run: `npx expo export -p web`

Expected: export completes successfully with output in `dist/`.

- [ ] **Step 4: Inspect the final diff and push**

```bash
git status --short
git diff main...HEAD --check
git log --oneline main..HEAD
git push
```
