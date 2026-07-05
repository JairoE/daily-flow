# Doctor-Friendly History And Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved doctor-friendly Daily Flow upgrade with richer daily logging, local-first persistence, and clinician-readable History and Trends visualizations.

**Architecture:** Keep the app in the current Expo React Native structure. Extend the storage and type boundary first, compute all chart data in pure trend helpers, then render simple native-view charts without adding chart dependencies.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, expo-sqlite, web localStorage fallback, Jest.

---

## Scope And Assumptions

- This is an upgrade to the existing Daily Flow app, not a rewrite.
- The implementation uses the current tab structure: Today, History, Trends, Settings.
- Data remains local-only on SQLite for native and localStorage for web.
- Existing yes/no entries remain readable and count toward frequency/check-in metrics.
- New detail metrics use only entries saved through the upgraded Today form.
- Charts are built with React Native `View` and `Text` primitives to avoid new dependencies.
- Expo 57 docs were checked before implementation, including the SDK reference and `expo-sqlite` API page.

## File Structure

- Modify `src/types.ts`: add stool, symptom, input, and chart-series types.
- Modify `src/storage/database.ts`: add SQLite columns, migration, row mapping, and richer upsert input.
- Modify `src/storage/database.web.ts`: normalize old localStorage entries and persist richer entries.
- Modify `src/lib/trends.ts`: compute expanded summary metrics and chart series from entries.
- Modify `src/__tests__/trends.test.ts`: cover old entries, Bristol distribution, symptoms, laxative notes, gaps, rolling series, and pending today.
- Modify `App.tsx`: update Today logging, History scan strip/list, Trends summary and native-view charts.

## Mini-Spec

### Data Model

`DailyEntry` gains `detailsRecorded`, `stoolType`, `symptoms`, `laxativeUsed`, and `laxativeNote`. A new `DailyEntryInput` type carries the save payload from Today to storage.

### Surface

- Today: yes/no selection, Bristol picker for yes entries, symptom toggles, laxative toggle, short note, single save action.
- History: 30-day strip, gap labels, and compact daily rows with Bristol/symptom/laxative details.
- Trends: doctor summary panel, frequency bars, rolling 7-day bars, interval bars, Bristol distribution, symptom burden, laxative timeline, and data completeness.

### Flow

1. User opens the app and existing local data loads.
2. Storage maps older rows into the extended entry shape.
3. User saves today's richer check-in.
4. App refreshes entries.
5. Trend helpers derive all History and Trends data.
6. History and Trends render visual summaries from helper output.

### Done Criteria

- Old yes/no-only entries still load.
- New Yes entries require Bristol type.
- New No entries skip Bristol but allow symptoms/laxative fields.
- SQLite and web storage both persist richer entries.
- History shows a 30-day scan strip plus daily details.
- Trends shows all approved summary metrics and charts.
- `npm test` passes.
- `npm run typecheck` passes.
- The Expo web app starts and serves successfully.

## Tasks

### Task 1: Extend Shared Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add stool, symptom, and trend-series types**

Use these exported shapes:

```ts
export type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DailySymptoms = {
  straining: boolean;
  pain: boolean;
  bloating: boolean;
  incompleteEvacuation: boolean;
};

export type DailyEntryInput = {
  hadBowelMovement: boolean;
  stoolType?: StoolType | null;
  symptoms?: Partial<DailySymptoms>;
  laxativeUsed?: boolean;
  laxativeNote?: string;
};

export type BristolDistributionItem = {
  type: StoolType;
  count: number;
};
```

- [ ] **Step 2: Extend `DailyEntry`, `HistoryDay`, and `TrendSummary`**

Add the new entry fields and derived trend fields:

```ts
detailsRecorded: boolean;
stoolType: StoolType | null;
symptoms: DailySymptoms;
laxativeUsed: boolean;
laxativeNote: string;
```

`TrendSummary` should include legacy fields plus average per week, current/longest gaps, Bristol distribution, symptom counts, laxative counts, data completeness, weekly frequency, rolling 7-day, and interval series.

- [ ] **Step 3: Run TypeScript**

Run: `npm run typecheck`

Expected: failures in storage, trends, tests, and UI because the shared type contract has intentionally expanded.

### Task 2: Upgrade Local Storage Boundaries

**Files:**
- Modify: `src/storage/database.ts`
- Modify: `src/storage/database.web.ts`

- [ ] **Step 1: Add SQLite migration columns**

In `src/storage/database.ts`, add these columns to `daily_entries` creation SQL and add a table-info based migration for existing databases:

```sql
details_recorded INTEGER NOT NULL DEFAULT 0,
stool_type INTEGER NULL,
symptom_straining INTEGER NOT NULL DEFAULT 0,
symptom_pain INTEGER NOT NULL DEFAULT 0,
symptom_bloating INTEGER NOT NULL DEFAULT 0,
symptom_incomplete_evacuation INTEGER NOT NULL DEFAULT 0,
laxative_used INTEGER NOT NULL DEFAULT 0,
laxative_note TEXT NOT NULL DEFAULT ''
```

- [ ] **Step 2: Normalize entry reads**

Map native rows and web JSON entries into complete `DailyEntry` objects. Missing old fields must become:

```ts
detailsRecorded: false,
stoolType: null,
symptoms: {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
},
laxativeUsed: false,
laxativeNote: '',
```

- [ ] **Step 3: Update upsert API**

Change `upsertDailyEntry(localDate, hadBowelMovement)` to `upsertDailyEntry(localDate, input)` where `input` is `DailyEntryInput`. Normalize notes by trimming to 160 characters, force `stoolType` to null for No entries, and set `detailsRecorded: true` for upgraded saves.

- [ ] **Step 4: Run existing tests**

Run: `npm test -- --runInBand src/__tests__/trends.test.ts`

Expected: failures in tests that still construct old `DailyEntry` objects. Fix in Task 3.

### Task 3: Expand Trend Helpers With Tests

**Files:**
- Modify: `src/lib/trends.ts`
- Modify: `src/__tests__/trends.test.ts`

- [ ] **Step 1: Update test fixtures**

Add fixture helpers for old and rich entries:

```ts
function legacyEntry(localDate: string, hadBowelMovement: boolean): DailyEntry
function richEntry(localDate: string, values: DailyEntryInput): DailyEntry
```

- [ ] **Step 2: Add metric tests**

Cover:

```ts
expect(trends.bristolDistribution.find((item) => item.type === 2)?.count).toBe(2);
expect(trends.symptomCounts.straining).toBe(2);
expect(trends.symptomBurdenDays).toBe(3);
expect(trends.laxativeUseDays).toBe(2);
expect(trends.currentGapDays).toBe(2);
expect(trends.longestGapDays).toBe(4);
expect(trends.rolling7).toHaveLength(30);
```

- [ ] **Step 3: Implement pure calculations**

Keep `buildHistoryDays` pure. In `summarizeTrends`, derive metrics from the 30-day history, with old `detailsRecorded === false` entries excluded from Bristol/symptom/laxative denominators.

- [ ] **Step 4: Run trend tests**

Run: `npm test -- --runInBand src/__tests__/trends.test.ts`

Expected: PASS.

### Task 4: Build Rich Today Logging

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Update `handleLog`**

Change the app-level handler to accept `DailyEntryInput`, call the new storage upsert, refresh entries, and keep notification sync behavior.

- [ ] **Step 2: Replace immediate yes/no logging with a draft form**

`TodayScreen` should maintain:

```ts
const [hadBowelMovement, setHadBowelMovement] = useState<boolean | null>(null);
const [stoolType, setStoolType] = useState<StoolType | null>(null);
const [symptoms, setSymptoms] = useState<DailySymptoms>(emptySymptoms);
const [laxativeUsed, setLaxativeUsed] = useState(false);
const [laxativeNote, setLaxativeNote] = useState('');
```

- [ ] **Step 3: Add validation**

When saving:

```ts
if (hadBowelMovement === null) show "Choose Yes or No first."
if (hadBowelMovement && stoolType === null) show "Choose a Bristol stool type."
if (laxativeNote.trim().length > 160) show "Keep the note to 160 characters or fewer."
```

- [ ] **Step 4: Run TypeScript**

Run: `npm run typecheck`

Expected: remaining UI/chart type errors only if Trends/History still use old fields. Fix in Task 5.

### Task 5: Build History And Trends Visuals

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Upgrade History**

Add a 30-day strip above the existing list. Each tile shows status, date number, optional Bristol type, symptom marker, and laxative marker. Add gap labels for runs of 2+ days without a yes.

- [ ] **Step 2: Upgrade Trends**

Render:

```txt
Doctor summary
Frequency bars
Rolling 7-day trend
Interval chart
Bristol distribution
Symptom burden
Laxative timeline
Data completeness
```

Use compact view-based charts and neutral labels. Do not add a chart library.

- [ ] **Step 3: Add empty states**

When a chart has no useful data, show:

```txt
More check-ins will fill this in.
```

- [ ] **Step 4: Run TypeScript**

Run: `npm run typecheck`

Expected: PASS.

### Task 6: Full Verification

**Files:**
- Verify the whole repo.

- [ ] **Step 1: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Start Expo web**

Run: `npm run web -- --port 8081`

Expected: Expo serves a local web URL. Use another port if 8081 is occupied.

- [ ] **Step 4: Smoke check the running app**

Open the local URL. Confirm onboarding loads or existing Daily Flow data loads, Today can save a rich entry, and History/Trends render without runtime errors.
