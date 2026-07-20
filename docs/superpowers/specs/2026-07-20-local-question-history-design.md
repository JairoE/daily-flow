# Local Question History Design

## Goal

Persist every successful Flow Better question-and-answer pair locally and show
the complete history below the current answer, newest first, with the local date
and time. The history remains on the device until the user invokes the existing
`Delete all local data` action.

## Product Scope

Question history remains part of the opt-in Daily Flow Pro+ experience. A
history record is created only after `/wellness-question` returns a valid
answer. Empty questions, validation failures, timeouts, request failures, and
invalid responses do not create records.

The feature does not add accounts, cloud synchronization, analytics, remote
history, CSV export fields, individual history deletion, retention limits, or
changes to the proxy's privacy-safe logging. Questions and answers remain local
after the response reaches the device.

## Data Model

Add a shared application type:

```ts
type WellnessQuestionHistoryEntry = {
  id: string;
  question: string;
  answer: string;
  askedAt: string;
};
```

`askedAt` is an ISO 8601 timestamp generated when the successful pair is saved.
The storage layer generates both `id` and `askedAt`, so callers provide only the
validated question and answer.

Native builds add this SQLite table:

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

The table is added to the existing idempotent schema initialization. Existing
profiles, daily entries, and notification records are not rewritten.

Web builds add `questionHistory: WellnessQuestionHistoryEntry[]` to the existing
`daily-flow-state-v1` payload. State normalization treats a missing or invalid
history value as an empty array so existing browser data remains readable.

## Storage API

Both platform storage adapters expose the same functions:

```ts
getWellnessQuestionHistory(): Promise<WellnessQuestionHistoryEntry[]>

createWellnessQuestionHistoryEntry(
  question: string,
  answer: string,
): Promise<WellnessQuestionHistoryEntry>
```

`getWellnessQuestionHistory` returns every record ordered by `askedAt`
descending and uses `id` descending as a deterministic tie-breaker.

`createWellnessQuestionHistoryEntry` trims the question and answer, generates a
unique local ID and current ISO timestamp, persists the complete record, and
returns it. It rejects empty normalized values rather than creating corrupt
history. The existing client response validation remains the primary content
length boundary.

The existing `deleteAllData` operation deletes every native history row and
resets web history to an empty array together with the profile, check-ins, and
notification records.

## Flow Better User Experience

`FlowBetterScreen` loads question history when it mounts. Beneath the existing
question form and current answer, it renders a full-width `Question history`
section.

The section uses a phone-friendly vertical list rather than a wide tabular
grid. Each item contains:

- A local date-and-time label derived from `askedAt`.
- A `You asked` label followed by the complete question.
- An `Answer` label followed by the complete answer.

The timestamp label uses the device locale with a medium date and short time
(for example, `Jul 20, 2026, 3:42 PM`). Invalid timestamps fall back to the
literal label `Time unavailable` rather than throwing during render.

Items appear newest first. When there are no saved entries, the section shows a
short empty-state message. There are no per-item delete controls.

Editing the input keeps the existing behavior of clearing the current answer,
but it does not affect saved history. Navigating away and back reloads history
from local storage.

## Submission Data Flow

The submission flow captures `submittedQuestion = question.trim()` before the
network request. On a valid response:

1. Display the returned answer as the current answer.
2. Persist `submittedQuestion` and the returned answer through
   `createWellnessQuestionHistoryEntry`.
3. Prepend the returned record to the in-memory history list without waiting
   for a screen reload.

Using the captured submitted value ensures that editing the input while a
request is pending cannot associate an answer with a different question.

Failed, timed-out, or unusable LLM responses preserve existing behavior and do
not call the history write API.

## Error Handling

History failures never disable the wellness-note or question-answer features.

- If initial history loading fails, show a calm inline history warning and
  leave the question form usable.
- If the LLM answer succeeds but history persistence fails, keep the current
  answer visible and show that it could not be added to history.
- A later successful load or save clears the corresponding history warning.
- Storage errors are not sent to the proxy or analytics and do not expose
  database implementation details in user-facing text.

## Privacy

Questions, answers, IDs, and timestamps are stored only in the app's existing
local persistence layer: `expo-sqlite` on native platforms and browser
`localStorage` on web. The proxy continues to exclude question and answer text
from logs and continues to send OpenAI requests with `store: false`.

History is not included in daily-entry CSV exports. The Settings privacy copy
will state that successful questions and answers are stored locally and removed
by `Delete all local data`.

## Component And File Boundaries

- `src/types.ts`: define `WellnessQuestionHistoryEntry`.
- `src/storage/database.ts`: create and query the native SQLite table and clear
  it with all other local data.
- `src/storage/database.web.ts`: normalize, create, list, and clear browser
  history in the existing state object.
- `src/lib/questionHistory.ts`: provide pure normalization, ordering, ID, and
  local date/time formatting helpers shared by the adapters and UI where
  platform-neutral behavior benefits from focused tests.
- `App.tsx`: load history, persist successful answers, render the history
  section, and show non-blocking history errors.
- `src/__tests__/questionHistory.test.ts`: test pure ordering, normalization,
  and timestamp display behavior.
- `src/__tests__/database.web.test.ts`: test web persistence, legacy-state
  compatibility, ordering, and deletion.
- `src/__tests__/flowBetterScreen.test.ts`: test loading, successful writes,
  failure exclusion, rendering order, and non-blocking errors.

No server files or API contracts change.

## Testing

Automated coverage will prove:

- Native schema initialization declares the history table and ordering index.
- Web history creation persists a complete normalized entry.
- Existing web state without `questionHistory` reads as empty history.
- Both adapters return deterministic newest-first ordering.
- `Delete all local data` clears history.
- Flow Better loads and renders saved entries newest first.
- A successful LLM answer is saved with the captured submitted question.
- Empty, failed, timed-out, and invalid-answer paths create no history entry.
- History-load and history-save errors leave question answering usable and show
  non-technical inline warnings.
- Local date and time labels are derived from the saved ISO timestamp.

Verification includes the focused red-green test cycles, the complete Jest and
Node test suite, and TypeScript type checking.

## Expo SDK 57 Reference

Implementation follows the exact
[Expo SDK 57 SQLite documentation](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/).
The documented `openDatabaseAsync`, `runAsync`, and `getAllAsync` APIs match the
project's existing adapter. SQLite persists across app restarts, and bound
parameters are used for user-provided question and answer text.
