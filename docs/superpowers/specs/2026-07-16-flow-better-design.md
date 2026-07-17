# Flow Better Design

## Goal

Add an opt-in `Flow better ✨` screen for the Daily Flow Pro+ prototype. The
screen moves the existing gentle wellness note out of Today and adds a
single-question LLM experience grounded in the same privacy-safe 30-day trend
summary.

## Product Scope

The feature is available only when the profile's existing
`llmWellnessNotesEnabled` setting is on. In Settings, the visible toggle label
changes from `LLM wellness notes` to `Daily Flow Pro+`. The stored field name
does not change.

The feature remains a one-tester prototype. It does not add accounts,
subscriptions, payments, remote persistence, RAG, conversation history, or a
general-purpose medical chatbot.

## Navigation

The primary navigation stays custom and does not add a navigation library.
`TabKey` gains a `flow-better` value.

The navigation surface has two rows:

1. The first row contains `Today`, `History`, `Trends`, and `Settings`, using
   the existing tab styles and equal-width layout.
2. When Daily Flow Pro+ is enabled, a second full-width row contains a centered
   `Flow better ✨` tab.

The second-row tab matches the approved reference:

- A white rounded interior.
- A thin multicolor outline moving left to right through coral, purple, blue,
  and green.
- Centered bold purple text.
- The same outer navigation surface and shadow as the first row.
- A stable height and full available width on phone and web layouts.

Use the Expo SDK 57-compatible `expo-linear-gradient` package as the outer
rounded shell, with an inset `Pressable` providing the white interior. The
active state keeps the gradient outline but uses a purple interior and white
text. When Flow Better is active, none of the four first-row tabs appears
selected.

The Flow Better tab is not rendered when Daily Flow Pro+ is off. If the setting
is switched off while Flow Better is active, the app returns to Today. The
screen header reads `Flow Better` while the tab is active.

## Flow Better Screen

The screen contains two un-nested, full-width sections in this order.

### Gentle Wellness Note

Move the complete wellness-note panel from Today to Flow Better. Today should
contain only the daily check-in experience.

The note keeps its approved state behavior:

- When Daily Flow Pro+ is configured with an endpoint and access code, show a
  loader while requesting the note.
- Show a valid generated note on success.
- Show the deterministic local fallback note after a timeout, request error,
  provider error, or invalid response.
- If the Pro+ configuration is incomplete, show the fallback immediately.

The request continues to send only the existing compact 30-day trend summary.

### Ask About Your Flow

Add a section titled `Ask about your flow` with:

- A multiline question input.
- A 500-character maximum.
- A clear `Ask` command button.
- A loading state that disables duplicate submissions.
- An answer area below the form.
- Calm inline validation and error messages.

The section shows only the latest submitted question and answer. Replacing the
question and submitting again replaces the prior result. Questions and answers
live in component memory only and disappear when the app reloads. They are not
written to SQLite, web local storage, notification records, logs, or analytics.

An empty or whitespace-only question is rejected on the device. A failed,
timed-out, or unusable response preserves the typed question and displays an
inline retry message. The app must not invent a fallback answer.

## Client Data Flow

The client derives the question endpoint from the configured wellness-note URL
using URL parsing:

```text
https://example.ngrok.app/wellness-note
https://example.ngrok.app/wellness-question
```

The request body is:

```ts
type WellnessQuestionPayload = {
  question: string;
  summary: LlmWellnessNotePayload;
};
```

The summary is built by the existing `buildLlmWellnessNotePayload` helper. The
request must not contain:

- Profile name or profile identifier.
- Raw daily entries or full history.
- Exact dates or timestamps.
- Laxative or context notes.
- Notification records.
- Previous questions or answers.

The client sends the existing bearer access code and expects:

```ts
type WellnessQuestionResponse = {
  answer: string;
};
```

A viable answer is non-empty after whitespace normalization and no longer than
1,600 characters. The client uses the existing eight-second timeout and
returns a typed failure state instead of exposing provider errors.

## Proxy Architecture

Add a dedicated `POST /wellness-question` route to the existing local Node
proxy. Do not add a mode field to `/wellness-note` or weaken its strict
summaries-only validator.

The new route reuses:

- Bearer-token authentication.
- Allowed-origin enforcement and CORS headers.
- Request-body size enforcement.
- OpenAI API key and model configuration.
- Privacy-safe operational logging.
- Provider timeout and `store: false`.

Its validator accepts exactly `question` and `summary`. The question must be a
trimmed string from 1 through 500 characters. The nested summary must pass the
existing wellness-note summary validation. Unknown top-level fields and
forbidden raw-data keys are rejected.

The OpenAI prompt instructs the model to:

- Answer only gastrointestinal wellness and bowel-pattern questions.
- Use the supplied summary only when it is relevant to the question.
- Be concise, calm, non-judgmental, and educational.
- Avoid diagnosis, treatment claims, prescriptions, medication
  recommendations, and dosage instructions.
- Avoid presenting the answer as a substitute for a clinician.
- Encourage clinician discussion when a pattern sounds concerning.
- Recommend urgent professional help when the user's wording describes a
  potentially urgent situation.
- State its limitation briefly when the question is unrelated or cannot be
  answered safely.

The proxy normalizes the response and returns `{ "answer": "..." }`. It logs
request type, model, response ID, token metadata, status, and output length
only. It never logs the question, summary values, answer text, access token, or
OpenAI key.

## Error And Safety Behavior

The note and question requests are independent. A failed daily note does not
disable the question form, and a failed question does not replace or remove the
daily note.

The UI distinguishes:

- Empty question validation.
- Pro+ configuration missing.
- Request in progress.
- Generic request failure or timeout.
- Successful answer.

Provider error details remain server-side. The user sees concise copy such as
`Your question could not be answered right now. Please try again.`

This feature provides general wellness information. It does not diagnose,
treat, establish a clinician relationship, or provide medication or dosage
instructions.

## Component And File Boundaries

Keep the existing app structure while separating pure request logic:

- `App.tsx`: dynamic navigation, `FlowBetterScreen`, section layout, and local
  question/answer state.
- `src/types.ts`: add `flow-better` to `TabKey`.
- `src/lib/llmWellnessNotes.ts`: retain note-specific payload and request
  behavior.
- `src/lib/llmWellnessQuestions.ts`: question payload validation, endpoint
  derivation, request state, and client request helper.
- `server/wellness-note-proxy.mjs`: add the independent question route,
  validator, prompt, OpenAI request, and response normalization.
- `package.json`: add the Expo SDK 57-compatible `expo-linear-gradient`
  package.

No storage schema changes are needed because the setting field already exists
and question history is intentionally ephemeral.

## Testing

Add tests for:

- Visible tabs include Flow Better only when Daily Flow Pro+ is enabled.
- Disabling Pro+ while Flow Better is selected resolves the active tab to
  Today.
- The question endpoint is derived safely from the configured note endpoint.
- The question payload contains only `question` and the compact summary.
- Empty, over-limit, failed, timed-out, and invalid answer cases return typed
  client failures.
- A successful client response returns a normalized answer.
- The proxy rejects missing or wrong bearer tokens, disallowed origins,
  oversized bodies, unknown fields, forbidden raw-data keys, invalid
  questions, and invalid summaries.
- A mocked OpenAI response returns `{ answer }`.
- Privacy-safe logs exclude question text, answer text, summary values, and
  secrets.
- Existing `/wellness-note` tests remain unchanged and passing.
- Today no longer renders the wellness-note panel.
- Flow Better renders both sections and the loading, success, and error states.

Manual verification covers phone-width and desktop-width web layouts, native
Expo rendering, keyboard behavior, the two-row tab layout, the gradient outline
and active state, successful local/ngrok calls, and graceful behavior when the
proxy is stopped.

## References

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [Expo SDK 57 LinearGradient](https://docs.expo.dev/versions/v57.0.0/sdk/linear-gradient/)
