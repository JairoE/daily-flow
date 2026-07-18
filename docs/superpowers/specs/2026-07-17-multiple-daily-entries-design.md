# Multiple Daily Entries Design

**Date:** 2026-07-17

**Status:** Approved for implementation

## Goal

Allow a user to record multiple Yes and No bowel-movement check-ins on the
same local date. Preserve every check-in as an individual event, expose the
day's event sequence in History, and make every downstream calculation,
export, reminder, and LLM aggregate distinguish event counts from day counts.

## Project constraints

- Start the work on a new branch from `main`.
- Keep the app local-first and preserve existing user data.
- Support Expo SDK 57, React Native, and React Native Web.
- Consult the exact versioned Expo 57 documentation before writing code:
  <https://docs.expo.dev/versions/v57.0.0/>.
- Continue sending only aggregate wellness data to the LLM proxy. Raw dates,
  entry arrays, laxative notes, profile data, and notification records remain
  forbidden.
- Implement and commit the work incrementally in atomic units.

## Chosen architecture

Each saved check-in is one `DailyEntry` event. Multiple events may share a
`localDate`; their stable identity is `id`, and their chronological order is
`checkedInAt`, with `id` as a deterministic tie-breaker.

Daily calendar and trend state is derived from the event collection. The app
will not persist a second daily-summary record because duplicated summaries
could drift from their source events.

### Alternatives considered

1. **Event rows — chosen.** Individual events are straightforward to edit,
   delete, export, order, aggregate, and pass through SQLite queries.
2. **One daily row with an embedded event array.** This would complicate
   SQLite querying, editing, migration, and CSV export.
3. **Event rows plus persisted daily summaries.** This would speed up some
   reads but create consistency and migration risks without a demonstrated
   performance need.

## Entry semantics

- Every Yes or No submission creates a new event by default.
- Multiple Yes events and multiple No events are both valid on one date.
- Editing updates one event without changing its original `checkedInAt` or
  ring position.
- Deleting removes one event. When the final event for a day is deleted, that
  day becomes Pending or Missed according to the existing date/check-in-time
  rules.
- Existing pre-migration daily entries become one event each and retain their
  IDs, timestamps, dates, details, symptoms, laxative fields, and notes.
- A day with at least one Yes and at least one No has aggregate status
  `mixed`. A day with only Yes events is `yes`; a day with only No events is
  `no`.

## Storage design

### Native SQLite

The `daily_entries.local_date` uniqueness constraint must be removed. Because
SQLite cannot drop that table constraint in place, initialization will run an
exclusive transaction that:

1. Adds any legacy missing columns using the existing column migrations.
2. Creates a replacement `daily_entries_v2` table without a unique constraint
   on `local_date`.
3. Copies every existing row and field into the replacement table.
4. Drops the old table and renames the replacement table.
5. Creates a non-unique index on `(local_date, checked_in_at)`.

The migration must be idempotent. Initialization will inspect the existing
table/index metadata and skip the table rebuild once the non-unique schema is
present. The transaction must roll back fully if any step fails.

New databases use the multi-entry schema immediately. The implementation will
follow Expo SDK 57's `expo-sqlite` async APIs and exclusive-transaction
guidance.

### Web storage

The existing local-storage state already stores an entry array, so its storage
shape remains compatible. Normalization keeps legacy entries intact, while
create/update/delete operations switch from date replacement to ID-based
mutation.

### Storage API

Replace date-based upsert behavior with explicit event operations:

- `createDailyEntry(localDate, input)` creates and returns a new event.
- `updateDailyEntry(id, input)` updates one event or reports that it no longer
  exists.
- `deleteDailyEntry(id)` deletes one event and reports whether it existed.
- `getEntriesByDate(localDate)` returns all events for the date in
  chronological order.
- Recent-entry loading returns all events for each included local date, rather
  than allowing a row limit to cut off events from a busy day.

All list queries use stable ordering by local date, check-in time, and ID.

## Shared daily aggregation

A focused pure helper module will be the single source of truth for grouping
and summarizing events. It will provide:

- Events grouped by `localDate` in chronological order.
- Yes, No, and total event counts.
- Aggregate status (`yes`, `no`, `mixed`, `missed`, or `pending`).
- Whether the day contains any bowel movement.
- A screen-reader summary such as “July 9, three logs: one yes, two no.”

History, trends, reminders, feedback, and UI components must consume these
helpers instead of independently choosing one entry per date.

## User interface

### Today

- Today's status uses all of today's entries.
- A successful save appends a new event and resets the form so another event
  can be recorded.
- A compact “Today's logs” list shows prior events in chronological order.
- Each saved event retains its own Bristol type, symptoms, laxative use, and
  note.

### History calendar

The approved segmented ring is rendered around the date number:

- Zero events: no activity ring.
- One Yes: one continuous full purple ring.
- One No: one continuous full coral-red ring.
- Two or more events: one equal arc per event, separated by narrow visible
  gaps.
- Arcs begin at 12 o'clock and proceed clockwise in `checkedInAt` order.
- Yes arcs are purple; No arcs are coral-red.
- Separator gaps scale down as event counts increase so every event remains
  represented.
- The date number remains the only text inside the ring.
- The whole calendar cell remains at least a 44-point touch target.
- Selection styling sits behind the ring and does not hide event colors.
- Accessibility text announces the exact Yes and No counts; color is not the
  only source of meaning.

The ring will be a focused cross-platform component backed by the Expo 57
compatible `react-native-svg` package. Circle strokes and dash offsets provide
consistent arcs on native and web.

### Selected-day activity

Selecting a calendar date shows the approved activity card directly below the
calendar:

- Date heading and total-log count.
- Visible Yes and No count pills.
- Chronological rows containing time, Yes/No label, and recorded details.
- A row opens that individual event for editing.
- Delete is available from the event editor and requires confirmation.
- “Add another log” opens a blank form for the selected date.
- Save, validation, and failure messages appear next to the active editor.

### Recent history

Recent history remains grouped by local date rather than rendering duplicate
day headings. Each day displays Yes and No count badges plus a concise summary
of its event details. Mixed days display both labels explicitly.

## Trends and feedback

Metrics must explicitly choose event-based or day-based semantics.

### Day-based metrics

These de-duplicate local dates:

- Yes days in the last 7 and 30 days.
- Bowel-movement days in the last 30 days.
- Completed days and check-in rates.
- Missed days.
- Current and longest day gaps.
- Streak and milestone feedback.

A mixed day counts as an answered day and a bowel-movement day.

### Event-based metrics

These count individual events:

- Total bowel movements in the last 30 days.
- Average bowel movements per week.
- Weekly and rolling-seven-day frequency.
- Bristol distribution.
- Hard/lumpy and loose/watery movement counts.
- Symptom occurrence counts and symptom-burden entries.
- Laxative-use entries, note entries, and detailed entries.
- Movement intervals, including a zero-day interval for multiple movements on
  one local date when the chart remains day-granular.

Trend labels must say “days,” “movements,” or “entries” accurately. Existing
metrics will not silently keep a day-oriented label after switching to event
counts.

## LLM aggregate contract

The wellness-note and wellness-question clients continue sharing one summary
payload. The payload will include both day and event context:

- `summaryWindowDays: 30`
- `bowelMovementCountLast30`
- `bowelMovementDaysLast30`
- `averageBowelMovementsPerWeekLast30`
- `currentGapDays`
- `longestGapDays`
- `hardOrLumpyMovementsLast30`
- `looseOrWateryMovementsLast30`
- `symptomBurdenEntriesLast30`
- `laxativeUseEntriesLast30`
- `checkInRateLast30`
- `detailEntriesLast30`

Client types, payload builders, server allowlists, validation, OpenAI prompt
copy, and tests change together. The server continues rejecting unexpected
fields and forbidden raw-data keys. Logs must not include request content.

## Notifications

- The first event on a date cancels that date's missed-check-in reminder.
- A logged-No wellness reminder is scheduled only when the day has one or more
  events and none are Yes.
- Saving a Yes event cancels any logged-No wellness reminder for that date.
- A later No event does not re-schedule the reminder if the day already
  contains a Yes.
- Rescheduling and missed-date detection continue to use unique local dates.

## Export

CSV export remains one row per `DailyEntry` event. Multiple entries on the
same date produce multiple rows, retain unique IDs/timestamps, and use stable
date/time ordering. The export row count is the number of event rows.

## Error handling and recovery

- A requested edit/delete for a missing ID displays a recoverable message and
  refreshes local entries.
- Forms prevent duplicate submission while a write is pending.
- Migration failure leaves the previous database intact through transaction
  rollback and surfaces the existing initialization error path.
- Invalid LLM payloads fail closed and fall back to the existing local wellness
  copy.
- Empty and deleted-day UI states are explicit rather than rendering a blank
  panel.

## Testing strategy

Use test-driven development for every behavior change.

### Pure/domain tests

- Group duplicate-date events chronologically.
- Derive Yes, No, mixed, missed, and pending days.
- Count day-based metrics once per date.
- Count event-based frequency, stool, symptom, laxative, and detail metrics per
  matching event.
- Generate segmented-ring geometry for one, two, mixed, and higher event
  counts in chronological color order.
- Keep feedback streaks date-based.

### Storage tests

- Preserve legacy rows during the native schema rebuild.
- Create multiple entries for the same date on native and web.
- Update/delete by ID without touching sibling events.
- Return all events for an included recent date.

### UI tests

- Today appends rather than replaces and resets after save.
- Calendar accessibility labels include exact event counts.
- Segmented rings use purple and coral-red in chronological order.
- Selecting a day renders every event and its details.
- Add, edit, delete, and final-entry empty states update calendar and history.

### Integration tests

- Notifications use the any-Yes rule.
- CSV emits one row per event with stable ordering.
- Both LLM clients send the updated aggregate summary.
- Proxy validation accepts the new contract and rejects legacy, extra, or raw
  fields.
- Type checking, Jest tests, server tests, and Expo web export all pass.

## Incremental commit boundaries

Implementation should use atomic commits whose tests pass independently:

1. Design specification.
2. Shared event grouping and day aggregation.
3. Native and web multi-entry storage plus migration.
4. Event-aware trends, feedback, and exports.
5. Notification aggregation rules.
6. LLM client/server aggregate contract.
7. Today multi-entry logging experience.
8. History segmented rings and selected-day activity UI.
9. Final integration, accessibility, and documentation adjustments.

## Success criteria

- A user can save multiple Yes and No entries on one date without overwriting
  earlier entries.
- Calendar rings show every event as an ordered purple or coral-red segment.
- History exposes and edits each individual event.
- Existing installations retain all prior entries.
- Trends and labels distinguish events from unique days.
- LLM analysis receives accurate total-movement and bowel-movement-day
  aggregates.
- Reminders, feedback, and exports behave correctly with duplicate dates.
- Automated tests, type checking, server tests, and Expo web export pass.
