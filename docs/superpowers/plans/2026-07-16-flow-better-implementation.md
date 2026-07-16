# Flow Better Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, two-section Flow Better screen with a generated daily wellness note and one-at-a-time LLM question answering grounded in privacy-safe 30-day trend summaries.

**Architecture:** Keep the app's custom tab navigation and local profile setting, but separate tab-access rules and wellness-question networking into pure tested modules. Extend the existing authenticated local proxy with an independent `/wellness-question` contract so question input cannot weaken the summaries-only `/wellness-note` route.

**Tech Stack:** Expo SDK 57, React 19.2.3, React Native 0.86, TypeScript 6, Jest/jest-expo, Node.js test runner, OpenAI Responses API, `expo-linear-gradient` ~57.0.1

## Global Constraints

- Read and follow the exact [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) before changing Expo code.
- Install `expo-linear-gradient` with `npx expo install expo-linear-gradient`; do not hand-edit an unverified package version.
- Keep the first navigation row as `Today`, `History`, `Trends`, and `Settings`.
- Render centered `Flow better ✨` on a full-width second row only when `llmWellnessNotesEnabled` is true.
- Rename only the visible toggle copy to `Daily Flow Pro+`; keep the persisted profile field and storage schema unchanged.
- Move the gentle wellness note completely out of Today and preserve its loading/generated/fallback behavior.
- Send only the current question and `LlmWellnessNotePayload`; never send names, raw entries, exact dates, local notes, notifications, prior questions, or prior answers.
- Keep question and answer state in memory only. Do not add persistence or analytics.
- Keep `/wellness-note` and its tests behaviorally unchanged.
- Enforce a 500-character question limit, a 1,600-character answer limit, an eight-second timeout, bearer auth, strict CORS, and `store: false`.
- Keep provider and transport details out of client error copy and keep question, answer, summary values, and secrets out of server logs.
- Do not add RAG, accounts, billing, subscriptions, or remote database work in this implementation.

---

### Task 1: Add Tested Pro+ Navigation Rules

**Files:**
- Create: `src/lib/navigation.ts`
- Create: `src/__tests__/navigation.test.ts`
- Modify: `src/types.ts:136`

**Interfaces:**
- Consumes: `TabKey` from `src/types.ts` and the profile's `llmWellnessNotesEnabled` boolean.
- Produces: `primaryTabs`, `flowBetterTab`, `getVisibleTabs(proEnabled)`, and `resolveAccessibleTab(activeTab, proEnabled)` for `App.tsx`.

- [ ] **Step 1: Write the failing navigation tests**

```ts
import {
  flowBetterTab,
  getVisibleTabs,
  primaryTabs,
  resolveAccessibleTab,
} from '../lib/navigation';

describe('Pro+ navigation', () => {
  it('keeps the four primary tabs in their existing order', () => {
    expect(primaryTabs).toEqual([
      { key: 'today', label: 'Today' },
      { key: 'history', label: 'History' },
      { key: 'trends', label: 'Trends' },
      { key: 'settings', label: 'Settings' },
    ]);
  });

  it('shows Flow better only when Daily Flow Pro+ is enabled', () => {
    expect(getVisibleTabs(false)).toEqual(primaryTabs);
    expect(getVisibleTabs(true)).toEqual([...primaryTabs, flowBetterTab]);
    expect(flowBetterTab).toEqual({
      key: 'flow-better',
      label: 'Flow better ✨',
    });
  });

  it('returns to Today when Flow Better access is removed', () => {
    expect(resolveAccessibleTab('flow-better', false)).toBe('today');
    expect(resolveAccessibleTab('flow-better', true)).toBe('flow-better');
    expect(resolveAccessibleTab('settings', false)).toBe('settings');
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npx jest src/__tests__/navigation.test.ts --runInBand`

Expected: FAIL because `src/lib/navigation.ts` does not exist and `flow-better` is not a `TabKey`.

- [ ] **Step 3: Add the minimal tab type and navigation helper**

Change `TabKey` in `src/types.ts` to:

```ts
export type TabKey =
  | 'today'
  | 'flow-better'
  | 'history'
  | 'trends'
  | 'settings';
```

Create `src/lib/navigation.ts`:

```ts
import type { TabKey } from '../types';

export type AppTab = {
  key: TabKey;
  label: string;
};

export const primaryTabs: readonly AppTab[] = [
  { key: 'today', label: 'Today' },
  { key: 'history', label: 'History' },
  { key: 'trends', label: 'Trends' },
  { key: 'settings', label: 'Settings' },
];

export const flowBetterTab: AppTab = {
  key: 'flow-better',
  label: 'Flow better ✨',
};

export function getVisibleTabs(proEnabled: boolean): readonly AppTab[] {
  return proEnabled ? [...primaryTabs, flowBetterTab] : primaryTabs;
}

export function resolveAccessibleTab(
  activeTab: TabKey,
  proEnabled: boolean,
): TabKey {
  return activeTab === 'flow-better' && !proEnabled ? 'today' : activeTab;
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npx jest src/__tests__/navigation.test.ts --runInBand`

Expected: PASS with three tests passing.

Run: `npm run typecheck`

Expected: PASS. `App.tsx` still compiles because the existing four tab values remain valid.

- [ ] **Step 5: Commit the navigation contract**

```bash
git add src/types.ts src/lib/navigation.ts src/__tests__/navigation.test.ts
git commit -m "Add Daily Flow Pro navigation rules"
```

---

### Task 2: Add The Typed Wellness-Question Client

**Files:**
- Create: `src/lib/llmWellnessQuestions.ts`
- Create: `src/__tests__/llmWellnessQuestions.test.ts`

**Interfaces:**
- Consumes: `Profile`, `LlmWellnessNotePayload`, the configured `/wellness-note` endpoint, the existing access token, and an injectable fetch implementation.
- Produces: `deriveWellnessQuestionEndpoint(endpoint)`, `buildWellnessQuestionPayload(question, summary)`, and `requestLlmWellnessAnswer(profile, question, summary, options)` returning `WellnessQuestionResult`.

- [ ] **Step 1: Write failing client-contract tests**

Create `src/__tests__/llmWellnessQuestions.test.ts` with a complete `Profile` fixture and this summary fixture:

```ts
import {
  buildWellnessQuestionPayload,
  deriveWellnessQuestionEndpoint,
  requestLlmWellnessAnswer,
} from '../lib/llmWellnessQuestions';
import type { LlmWellnessNotePayload } from '../lib/llmWellnessNotes';
import type { Profile } from '../types';

const profile: Profile = {
  id: 'local-profile',
  displayName: 'Jairo',
  timezone: 'America/New_York',
  checkInTime: '20:00',
  remindersEnabled: true,
  privateNotifications: true,
  privacyLockEnabled: false,
  llmWellnessNotesEnabled: true,
  llmWellnessNoteEndpoint: 'https://example.ngrok.app/wellness-note',
  llmWellnessNoteAccessToken: 'test-token',
  dailyOpenLoveShownDate: null,
  createdAt: '2026-07-10T12:00:00.000Z',
  updatedAt: '2026-07-10T12:00:00.000Z',
};

const summary: LlmWellnessNotePayload = {
  summaryWindowDays: 30,
  bowelMovementDaysLast30: 10,
  averagePerWeekLast30: 2.3,
  currentGapDays: 2,
  longestGapDays: 4,
  hardOrLumpyDays: 3,
  looseOrWateryDays: 1,
  symptomBurdenDays: 6,
  laxativeUseDays: 2,
  checkInRateLast30: 87,
  detailDays: 12,
};

describe('LLM wellness question helpers', () => {
  it('derives the sibling question endpoint with URL parsing', () => {
    expect(
      deriveWellnessQuestionEndpoint(
        'https://example.ngrok.app/wellness-note',
      ),
    ).toBe('https://example.ngrok.app/wellness-question');
    expect(
      deriveWellnessQuestionEndpoint(
        'http://192.168.1.168:8787/wellness-note',
      ),
    ).toBe('http://192.168.1.168:8787/wellness-question');
    expect(deriveWellnessQuestionEndpoint('https://example.com/api')).toBeNull();
    expect(deriveWellnessQuestionEndpoint('not a url')).toBeNull();
  });

  it('builds a trimmed question plus summary and rejects invalid questions', () => {
    expect(buildWellnessQuestionPayload('  What supports regularity?  ', summary)).toEqual({
      question: 'What supports regularity?',
      summary,
    });
    expect(buildWellnessQuestionPayload('   ', summary)).toBeNull();
    expect(buildWellnessQuestionPayload('x'.repeat(501), summary)).toBeNull();
    expect(JSON.stringify(buildWellnessQuestionPayload('Help?', summary))).not.toMatch(
      /Jairo|localDate|laxativeNote|notificationRecords|entries|2026-07-10/,
    );
  });

  it('returns a normalized answer from the sibling endpoint', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ answer: '  Gentle consistency can help.  ' }),
    }));

    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, { fetchImpl }),
    ).resolves.toEqual({ ok: true, answer: 'Gentle consistency can help.' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.ngrok.app/wellness-question',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: 'What can help?', summary }),
      }),
    );
  });

  it('returns typed failures without calling the provider for invalid setup', async () => {
    const fetchImpl = jest.fn();

    await expect(
      requestLlmWellnessAnswer(
        { ...profile, llmWellnessNotesEnabled: false },
        'What can help?',
        summary,
        { fetchImpl },
      ),
    ).resolves.toEqual({ ok: false, reason: 'not-configured' });
    await expect(
      requestLlmWellnessAnswer(profile, '   ', summary, { fetchImpl }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-question' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns typed failures for transport and invalid response errors', async () => {
    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, {
        fetchImpl: jest.fn(async () => {
          throw new Error('network down');
        }),
      }),
    ).resolves.toEqual({ ok: false, reason: 'request-failed' });

    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, {
        fetchImpl: jest.fn(async () => ({
          ok: true,
          json: async () => ({ answer: 'x'.repeat(1601) }),
        })),
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-response' });
  });

  it('aborts after the configured timeout', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    await expect(
      requestLlmWellnessAnswer(profile, 'What can help?', summary, {
        fetchImpl,
        timeoutMs: 1,
      }),
    ).resolves.toEqual({ ok: false, reason: 'request-failed' });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npx jest src/__tests__/llmWellnessQuestions.test.ts --runInBand`

Expected: FAIL because `src/lib/llmWellnessQuestions.ts` does not exist.

- [ ] **Step 3: Implement the minimal client helper**

Create `src/lib/llmWellnessQuestions.ts` with:

```ts
import type { Profile } from '../types';
import {
  hasConfiguredLlmWellnessNotes,
  type LlmWellnessNotePayload,
} from './llmWellnessNotes';

export const MAX_WELLNESS_QUESTION_CHARS = 500;
export const MAX_WELLNESS_ANSWER_CHARS = 1600;

export type WellnessQuestionPayload = {
  question: string;
  summary: LlmWellnessNotePayload;
};

export type WellnessQuestionResult =
  | { ok: true; answer: string }
  | {
      ok: false;
      reason:
        | 'not-configured'
        | 'invalid-question'
        | 'request-failed'
        | 'invalid-response';
    };

type WellnessQuestionFetchResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type WellnessQuestionFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<WellnessQuestionFetchResponse>;

export function deriveWellnessQuestionEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const segments = url.pathname.split('/');

    if (segments[segments.length - 1] !== 'wellness-note') {
      return null;
    }

    segments[segments.length - 1] = 'wellness-question';
    url.pathname = segments.join('/');
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}

export function buildWellnessQuestionPayload(
  question: string,
  summary: LlmWellnessNotePayload,
): WellnessQuestionPayload | null {
  const trimmed = question.trim();

  if (!trimmed || trimmed.length > MAX_WELLNESS_QUESTION_CHARS) {
    return null;
  }

  return { question: trimmed, summary };
}

function readAnswerResponse(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('answer' in value)) {
    return null;
  }

  const answer = (value as { answer?: unknown }).answer;

  if (typeof answer !== 'string') {
    return null;
  }

  const normalized = answer.replace(/\s+/g, ' ').trim();

  return normalized.length > 0 && normalized.length <= MAX_WELLNESS_ANSWER_CHARS
    ? normalized
    : null;
}

export async function requestLlmWellnessAnswer(
  profile: Profile,
  question: string,
  summary: LlmWellnessNotePayload,
  options: {
    timeoutMs?: number;
    fetchImpl?: WellnessQuestionFetch;
  } = {},
): Promise<WellnessQuestionResult> {
  if (!hasConfiguredLlmWellnessNotes(profile)) {
    return { ok: false, reason: 'not-configured' };
  }

  const endpoint = deriveWellnessQuestionEndpoint(
    profile.llmWellnessNoteEndpoint,
  );
  const payload = buildWellnessQuestionPayload(question, summary);

  if (!endpoint) {
    return { ok: false, reason: 'not-configured' };
  }

  if (!payload) {
    return { ok: false, reason: 'invalid-question' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${profile.llmWellnessNoteAccessToken.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: 'request-failed' };
    }

    const answer = readAnswerResponse(await response.json());

    return answer
      ? { ok: true, answer }
      : { ok: false, reason: 'invalid-response' };
  } catch {
    return { ok: false, reason: 'request-failed' };
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npx jest src/__tests__/llmWellnessQuestions.test.ts --runInBand`

Expected: PASS with six tests passing.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the client contract**

```bash
git add src/lib/llmWellnessQuestions.ts src/__tests__/llmWellnessQuestions.test.ts
git commit -m "Add wellness question client"
```

---

### Task 3: Add The Isolated Wellness-Question Proxy Route

**Files:**
- Modify: `server/wellness-note-proxy.mjs`
- Modify: `server/wellness-note-proxy.test.mjs`

**Interfaces:**
- Consumes: `POST /wellness-question`, bearer token, allowed origin, `{ question, summary }`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
- Produces: `{ answer: string }` or a generic JSON error while preserving the existing `/wellness-note` contract.

- [ ] **Step 1: Add failing validation and OpenAI-response tests**

Extend the proxy test imports with `requestOpenAiWellnessAnswer` and
`validateWellnessQuestionPayload`, then add:

```js
const questionPayload = {
  question: 'What gentle habits may support regularity?',
  summary: payload,
};

test('accepts only a bounded question and valid summary', () => {
  assert.equal(validateWellnessQuestionPayload(questionPayload).ok, true);
  assert.equal(
    validateWellnessQuestionPayload({ ...questionPayload, question: '   ' }).status,
    400,
  );
  assert.equal(
    validateWellnessQuestionPayload({ ...questionPayload, question: 'x'.repeat(501) }).status,
    400,
  );
  assert.equal(
    validateWellnessQuestionPayload({ ...questionPayload, entries: [] }).status,
    400,
  );
  assert.equal(
    validateWellnessQuestionPayload({ ...questionPayload, extra: true }).status,
    400,
  );
  assert.equal(
    validateWellnessQuestionPayload({
      ...questionPayload,
      summary: { ...payload, localDate: '2026-07-16' },
    }).status,
    400,
  );
});

test('applies auth, origin, size, and route policy to wellness questions', () => {
  const base = {
    method: 'POST',
    pathname: '/wellness-question',
    origin: 'https://jairoe.github.io',
    authorization: `Bearer ${accessToken}`,
    body: questionPayload,
    bodyBytes: JSON.stringify(questionPayload).length,
    allowedOrigins,
    accessToken,
  };

  assert.equal(validateRequestPolicy(base).ok, true);
  assert.equal(validateRequestPolicy({ ...base, authorization: '' }).status, 401);
  assert.equal(
    validateRequestPolicy({ ...base, origin: 'https://example.com' }).status,
    403,
  );
  assert.equal(
    validateRequestPolicy({ ...base, bodyBytes: MAX_BODY_BYTES + 1 }).status,
    413,
  );
});

test('returns a normalized answer from a mocked OpenAI response', async () => {
  const logs = [];
  const answer = await requestOpenAiWellnessAnswer({
    payload: questionPayload,
    apiKey: 'test-key',
    model: 'test-model',
    logger: {
      info(message, metadata) {
        logs.push({ level: 'info', message, metadata });
      },
      warn(message, metadata) {
        logs.push({ level: 'warn', message, metadata });
      },
      error(message, metadata) {
        logs.push({ level: 'error', message, metadata });
      },
    },
    fetchImpl: async (_url, init) => {
      const requestBody = JSON.parse(init.body);

      assert.equal(requestBody.model, 'test-model');
      assert.deepEqual(requestBody.reasoning, { effort: 'none' });
      assert.equal(requestBody.max_output_tokens, 512);
      assert.equal(requestBody.store, false);
      assert.match(requestBody.input, /gentle habits may support regularity/);
      assert.match(requestBody.input, /summaryWindowDays/);
      assert.doesNotMatch(requestBody.input, /localDate|laxativeNote|entries/);

      return {
        ok: true,
        json: async () => ({
          output_text: 'Gradual fiber, enough fluids, and regular movement may support regularity.',
        }),
      };
    },
  });

  assert.equal(
    answer,
    'Gradual fiber, enough fluids, and regular movement may support regularity.',
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /gentle habits|Gradual fiber|summaryWindowDays|bowelMovementDaysLast30|test-key/,
  );
});

test('keeps wellness-question content out of transport-error logs', async () => {
  const logs = [];
  const transportError = new Error('private transport detail');
  transportError.name = 'AbortError';

  await assert.rejects(
    requestOpenAiWellnessAnswer({
      payload: questionPayload,
      apiKey: 'test-key',
      model: 'test-model',
      logger: {
        info(message, metadata) {
          logs.push({ level: 'info', message, metadata });
        },
        warn(message, metadata) {
          logs.push({ level: 'warn', message, metadata });
        },
        error(message, metadata) {
          logs.push({ level: 'error', message, metadata });
        },
      },
      fetchImpl: async () => {
        throw transportError;
      },
    }),
    transportError,
  );

  assert.doesNotMatch(
    JSON.stringify(logs),
    /gentle habits|summaryWindowDays|private transport detail|test-key/,
  );
});
```

- [ ] **Step 2: Run the proxy tests and verify the expected failure**

Run: `node --test server/wellness-note-proxy.test.mjs`

Expected: FAIL because the wellness-question validator and OpenAI request function do not exist and `/wellness-question` returns 404 policy.

- [ ] **Step 3: Add the independent question validator and route policy**

In `server/wellness-note-proxy.mjs`, export:

```js
export const WELLNESS_QUESTION_PATH = '/wellness-question';
export const MAX_QUESTION_CHARS = 500;
export const MAX_ANSWER_CHARS = 1600;

export const wellnessQuestionInstructions = [
  'Answer one gastrointestinal wellness or bowel-pattern question.',
  'Use the supplied summary only when it is relevant.',
  'Be concise, calm, non-judgmental, and educational.',
  'Do not diagnose, prescribe, recommend medication, give dosage instructions, or make treatment claims.',
  'Do not present the answer as a substitute for a clinician.',
  'Encourage clinician discussion for concerning patterns and urgent professional help for potentially urgent wording.',
  'If the question is unrelated or cannot be answered safely, state that limitation briefly.',
].join(' ');

export function validateWellnessQuestionPayload(value) {
  if (!isPlainRecord(value)) {
    return { ok: false, status: 400, error: 'Expected a JSON object.' };
  }

  if (hasForbiddenRawDataKeys(value)) {
    return {
      ok: false,
      status: 400,
      error: 'Raw history, notes, dates, profile, or notification data is not allowed.',
    };
  }

  const keys = Object.keys(value);

  for (const key of keys) {
    if (key !== 'question' && key !== 'summary') {
      return { ok: false, status: 400, error: `Unexpected field: ${key}` };
    }
  }

  if (typeof value.question !== 'string') {
    return { ok: false, status: 400, error: 'question must be a string.' };
  }

  const question = value.question.trim();

  if (!question || question.length > MAX_QUESTION_CHARS) {
    return {
      ok: false,
      status: 400,
      error: `question must be 1-${MAX_QUESTION_CHARS} characters.`,
    };
  }

  const summary = validateWellnessNotePayload(value.summary);

  if (!summary.ok) {
    return summary;
  }

  return {
    ok: true,
    payload: { question, summary: summary.payload },
  };
}
```

Replace `validateRequestPolicy` with the complete route-aware implementation:

```js
export function validateRequestPolicy({
  method,
  pathname,
  origin,
  authorization,
  body,
  bodyBytes,
  allowedOrigins,
  accessToken,
}) {
  const kind =
    pathname === WELLNESS_NOTE_PATH
      ? 'note'
      : pathname === WELLNESS_QUESTION_PATH
        ? 'question'
        : null;

  if (!kind) {
    return { ok: false, status: 404, error: 'Not found.' };
  }

  if (method !== 'POST') {
    return { ok: false, status: 405, error: 'Method not allowed.' };
  }

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return { ok: false, status: 403, error: 'Origin is not allowed.' };
  }

  if (!accessToken) {
    return {
      ok: false,
      status: 500,
      error: 'Proxy access token is not configured.',
    };
  }

  if (authorization !== `Bearer ${accessToken}`) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  if (bodyBytes > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request body is too large.' };
  }

  const validation =
    kind === 'note'
      ? validateWellnessNotePayload(body)
      : validateWellnessQuestionPayload(body);

  return validation.ok ? { ...validation, kind } : validation;
}
```

- [ ] **Step 4: Add answer normalization and the OpenAI question request**

Refactor normalization without changing note behavior:

```js
function normalizeGeneratedText(value, maxLength) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.replace(/\s+/g, ' ').trim();

  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function normalizeGeneratedNote(note) {
  return normalizeGeneratedText(note, 280);
}
```

Add `requestOpenAiWellnessAnswer` using the same response parsing and
privacy-safe metadata helpers as the note request:

```js
export async function requestOpenAiWellnessAnswer({
  payload,
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
  logger = console,
  timeoutMs = 8000,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logger.info?.('wellness-question: requesting OpenAI', { model });

    let response;

    try {
      response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: 'none' },
          instructions: wellnessQuestionInstructions,
          input: `Question: ${payload.question}\nSummary: ${JSON.stringify(payload.summary)}`,
          max_output_tokens: 512,
          store: false,
        }),
        signal: controller.signal,
      });
    } catch (caught) {
      logger.error?.('wellness-question: OpenAI transport failed', {
        errorName:
          caught && typeof caught.name === 'string' ? caught.name : 'Error',
        model,
      });
      throw caught;
    }

    if (!response.ok) {
      const responseValue = await readOpenAiResponseJson(response);
      const providerError =
        isPlainRecord(responseValue) && isPlainRecord(responseValue.error)
          ? responseValue.error
          : {};

      logger.error?.('wellness-question: OpenAI rejected request', {
        errorCode: readString(providerError.code),
        errorType: readString(providerError.type),
        httpStatus: readNumber(response.status),
        model,
        requestId: response.headers?.get?.('x-request-id') ?? null,
      });
      throw new Error('OpenAI request failed.');
    }

    const responseValue = await readOpenAiResponseJson(response);
    const visibleText = extractOpenAiText(responseValue) ?? '';
    const answer = normalizeGeneratedText(visibleText, MAX_ANSWER_CHARS);
    const metadata = getOpenAiResponseMetadata(responseValue, model, visibleText);

    if (!answer) {
      logger.warn?.('wellness-question: OpenAI returned no usable answer', {
        hasVisibleText: metadata.hasVisibleText,
        incompleteReason: metadata.incompleteReason,
        model: metadata.model,
        outputTokens: metadata.outputTokens,
        reasoningTokens: metadata.reasoningTokens,
        responseId: metadata.responseId,
        status: metadata.status,
        visibleTextLength: metadata.visibleTextLength,
      });
      return null;
    }

    logger.info?.('wellness-question: generated answer', {
      model: metadata.model,
      outputTokens: metadata.outputTokens,
      reasoningTokens: metadata.reasoningTokens,
      responseId: metadata.responseId,
    });
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 5: Dispatch the validated route and return `{ answer }`**

After API-key validation in `handleProxyRequest`, branch before the existing
note call:

```js
  try {
    if (validation.kind === 'question') {
      const answer = await requestOpenAiWellnessAnswer({
        payload: validation.payload,
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
      });

      if (!answer) {
        sendJson(response, 502, { error: 'Unable to generate a safe answer.' }, headers);
        return;
      }

      sendJson(response, 200, { answer }, headers);
      return;
    }

    const note = await requestOpenAiWellnessNote({
      payload: validation.payload,
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
    });

    if (!note) {
      sendJson(response, 502, { error: 'Unable to generate a safe note.' }, headers);
      return;
    }

    sendJson(response, 200, { note }, headers);
  } catch {
    sendJson(
      response,
      502,
      {
        error:
          validation.kind === 'question'
            ? 'Unable to generate an answer.'
            : 'Unable to generate a note.',
      },
      headers,
    );
  }
```

- [ ] **Step 6: Run proxy and client regression tests**

Run: `node --test server/wellness-note-proxy.test.mjs`

Expected: PASS, including all original note tests and the new question tests.

Run: `npx jest src/__tests__/llmWellnessQuestions.test.ts src/__tests__/llmWellnessNotes.test.ts --runInBand`

Expected: PASS.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 7: Commit the proxy route**

```bash
git add server/wellness-note-proxy.mjs server/wellness-note-proxy.test.mjs
git commit -m "Add wellness question proxy route"
```

---

### Task 4: Build And Verify The Flow Better Experience

**Files:**
- Modify: `App.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Create: `src/__tests__/flowBetterScreen.test.ts`
- Test: `src/__tests__/navigation.test.ts`
- Test: `src/__tests__/llmWellnessQuestions.test.ts`

**Interfaces:**
- Consumes: `primaryTabs`, `flowBetterTab`, `resolveAccessibleTab`, `requestLlmWellnessNote`, `requestLlmWellnessAnswer`, `buildLlmWellnessNotePayload`, `Profile`, `TrendSummary`, and `expo-linear-gradient`.
- Produces: the dynamic two-row navigation, exported `TodayScreen` and `FlowBetterScreen` components, renamed settings copy, ephemeral latest-answer state, and responsive Pro+ UI.

- [ ] **Step 1: Add the direct render-test dependency**

Run:

```bash
npm install --save-dev react-test-renderer@19.2.3 @types/react-test-renderer
```

Expected: `package.json` and `package-lock.json` list compatible React 19 test-renderer packages.

- [ ] **Step 2: Write the failing screen ownership test**

Export `TodayScreen` only after this test has failed. Create the complete
`src/__tests__/flowBetterScreen.test.ts` below:

```ts
import { createElement } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FlowBetterScreen, TodayScreen } from '../../App';
import type { Profile, TrendSummary } from '../types';

const profile: Profile = {
  id: 'local-profile',
  displayName: 'Jairo',
  timezone: 'America/New_York',
  checkInTime: '20:00',
  remindersEnabled: true,
  privateNotifications: true,
  privacyLockEnabled: false,
  llmWellnessNotesEnabled: true,
  llmWellnessNoteEndpoint: '',
  llmWellnessNoteAccessToken: '',
  dailyOpenLoveShownDate: null,
  createdAt: '2026-07-10T12:00:00.000Z',
  updatedAt: '2026-07-10T12:00:00.000Z',
};

const trends: TrendSummary = {
  yesLast7: 2,
  yesLast30: 10,
  missedLast7: 1,
  missedLast30: 4,
  daysSinceLastYes: 2,
  checkInRateLast7: 86,
  bowelMovementDaysLast30: 10,
  averagePerWeekLast30: 2.3,
  currentGapDays: 2,
  longestGapDays: 4,
  gapCount2Plus: 2,
  completedDaysLast30: 26,
  checkInRateLast30: 87,
  bristolDistribution: [],
  mostCommonBristolType: null,
  hardOrLumpyDays: 3,
  looseOrWateryDays: 1,
  symptomCounts: {
    straining: 2,
    pain: 1,
    bloating: 4,
    incompleteEvacuation: 2,
  },
  symptomBurdenDays: 6,
  laxativeUseDays: 2,
  noteDays: 1,
  detailDays: 12,
  weeklyFrequency: [],
  rolling7: [],
  intervals: [],
};

function renderedText(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) => node.props.children)
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

describe('Flow Better screen', () => {
  it('moves the wellness note out of Today', async () => {
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(TodayScreen, {
          entry: null,
          includeTodayAsMissed: false,
          onLog: async () => undefined,
        }),
      );
    });

    expect(renderedText(renderer)).not.toContain('Gentle wellness note');
  });

  it('renders both Flow Better sections', async () => {
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(FlowBetterScreen, {
          localDate: '2026-07-16',
          profile,
          trends,
        }),
      );
    });

    const copy = renderedText(renderer);
    expect(copy).toContain('Gentle wellness note');
    expect(copy).toContain('Ask about your flow');
  });
});
```

- [ ] **Step 3: Run the focused test and verify the expected failure**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts --runInBand`

Expected: FAIL because `FlowBetterScreen` is not exported and Today still owns the wellness-note panel.

- [ ] **Step 4: Install the SDK-compatible gradient component**

Run: `npx expo install expo-linear-gradient`

Expected: `expo-linear-gradient` is added at the Expo SDK 57-compatible version documented as `~57.0.1`.

- [ ] **Step 5: Replace the one-row tab map with the approved two-row navigation**

In `App.tsx`:

```ts
import { LinearGradient } from 'expo-linear-gradient';
import {
  flowBetterTab,
  primaryTabs,
  resolveAccessibleTab,
} from './src/lib/navigation';
```

Remove the local `tabs` constant. Add an access guard near the other app-level
effects:

```ts
useEffect(() => {
  setActiveTab((current) =>
    resolveAccessibleTab(current, Boolean(profile?.llmWellnessNotesEnabled)),
  );
}, [profile?.llmWellnessNotesEnabled]);
```

Replace the header title expression with:

```ts
const appTitle =
  activeTab === 'trends'
    ? 'Statistics'
    : activeTab === 'flow-better'
      ? 'Flow Better'
      : 'Daily Flow';
```

Then render `<Text style={styles.appName}>{appTitle}</Text>` in the existing
header.

Render the navigation as:

```tsx
<View style={styles.tabs} accessibilityRole="tablist">
  <View style={styles.primaryTabRow}>
    {primaryTabs.map((tab) => (
      <Pressable
        key={tab.key}
        accessibilityLabel={`Open ${tab.label} tab`}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === tab.key }}
        onPress={() => setActiveTab(tab.key)}
        style={({ pressed }) => [
          styles.tabButton,
          pressed && styles.pressedControl,
          activeTab === tab.key && styles.activeTabButton,
        ]}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === tab.key && styles.activeTabText,
          ]}
        >
          {tab.label}
        </Text>
      </Pressable>
    ))}
  </View>

  {profile.llmWellnessNotesEnabled ? (
    <LinearGradient
      colors={[palette.rose, palette.purple, palette.blue, palette.green]}
      end={{ x: 1, y: 0 }}
      start={{ x: 0, y: 0 }}
      style={styles.flowBetterTabOutline}
    >
      <Pressable
        accessibilityLabel={`Open ${flowBetterTab.label} tab`}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === flowBetterTab.key }}
        onPress={() => setActiveTab(flowBetterTab.key)}
        style={({ pressed }) => [
          styles.flowBetterTabButton,
          pressed && styles.pressedControl,
          activeTab === flowBetterTab.key && styles.activeFlowBetterTabButton,
        ]}
      >
        <Text
          style={[
            styles.flowBetterTabText,
            activeTab === flowBetterTab.key && styles.activeTabText,
          ]}
        >
          {flowBetterTab.label}
        </Text>
      </Pressable>
    </LinearGradient>
  ) : null}
</View>
```

Use stable responsive styles:

```ts
tabs: {
  backgroundColor: 'rgba(255,255,255,0.72)',
  borderColor: palette.border,
  borderRadius: 24,
  borderWidth: 1,
  gap: 8,
  marginBottom: 14,
  padding: 5,
  ...cardShadow,
},
primaryTabRow: {
  flexDirection: 'row',
},
flowBetterTabOutline: {
  borderRadius: 20,
  padding: 3,
  width: '100%',
},
flowBetterTabButton: {
  alignItems: 'center',
  backgroundColor: palette.surface,
  borderRadius: 17,
  justifyContent: 'center',
  minHeight: 50,
  paddingHorizontal: 12,
},
activeFlowBetterTabButton: {
  backgroundColor: palette.purple,
},
flowBetterTabText: {
  color: palette.purple,
  fontSize: 17,
  fontWeight: '900',
  textAlign: 'center',
},
```

- [ ] **Step 6: Move the note state into `FlowBetterScreen` and add question state**

Add the question-helper import:

```ts
import {
  MAX_WELLNESS_QUESTION_CHARS,
  requestLlmWellnessAnswer,
} from './src/lib/llmWellnessQuestions';
```

Change `function TodayScreen` to `export function TodayScreen`. Remove the
`localDate`, `profile`, and `trends` entries from both its destructured props
and prop type, leaving this exact contract:

```ts
{
  entry: DailyEntry | null;
  includeTodayAsMissed: boolean;
  onLog: (input: DailyEntryInput) => Promise<void>;
}
```

Delete `wellnessNoteState`, the wellness-note `useEffect`, the derived
`wellnessNote` constant, and the final `styles.wellnessPanel` block from Today.
Leave every check-in state field, validator, save handler, and hero-panel JSX
unchanged.

Export `FlowBetterScreen` before `TodayScreen` and begin it with the complete
note and question state flow:

```ts
export function FlowBetterScreen({
  localDate,
  profile,
  trends,
}: {
  localDate: string;
  profile: Profile;
  trends: TrendSummary;
}) {
  const [wellnessNoteState, setWellnessNoteState] =
    useState<WellnessNoteDisplayState>(() =>
      getInitialWellnessNoteDisplayState(profile),
    );
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initialState = getInitialWellnessNoteDisplayState(profile);

    setWellnessNoteState(initialState);

    if (initialState.status === 'fallback') {
      return () => {
        cancelled = true;
      };
    }

    requestLlmWellnessNote(
      profile,
      buildLlmWellnessNotePayload(trends),
    ).then((note) => {
      if (!cancelled) {
        setWellnessNoteState(resolveWellnessNoteDisplayState(note));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    localDate,
    profile.llmWellnessNoteAccessToken,
    profile.llmWellnessNoteEndpoint,
    profile.llmWellnessNotesEnabled,
    trends,
  ]);

  const wellnessNote =
    wellnessNoteState.status === 'generated'
      ? wellnessNoteState.note
      : wellnessNoteState.status === 'fallback'
        ? getFallbackWellnessNote(localDate)
        : null;

  async function handleAskQuestion() {
  if (!question.trim()) {
    setQuestionError('Enter a question first.');
    return;
  }

  setAsking(true);
  setAnswer('');
  setQuestionError('');

  try {
    const result = await requestLlmWellnessAnswer(
      profile,
      question,
      buildLlmWellnessNotePayload(trends),
    );

    if (result.ok) {
      setAnswer(result.answer);
      return;
    }

    setQuestionError(
      result.reason === 'not-configured'
        ? 'Add your Pro+ endpoint and access code in Settings.'
        : result.reason === 'invalid-question'
          ? 'Keep your question between 1 and 500 characters.'
          : 'Your question could not be answered right now. Please try again.',
    );
  } finally {
    setAsking(false);
  }
  }
```

Render the two sections without nesting cards:

```tsx
return (
  <View>
    <View style={styles.wellnessPanel}>
      <Text style={styles.panelTitle}>Gentle wellness note</Text>
      <View style={styles.wellnessNoteContent}>
        {wellnessNoteState.status === 'loading' ? (
          <View
            accessibilityLabel="Preparing gentle wellness note"
            accessibilityRole="progressbar"
            style={styles.wellnessNoteLoading}
          >
            <ActivityIndicator color={palette.green} size="small" />
            <Text style={styles.bodyText}>Preparing your note...</Text>
          </View>
        ) : (
          <Text style={styles.bodyText}>{wellnessNote}</Text>
        )}
      </View>
    </View>

    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Ask about your flow</Text>
      <LabeledInput
        label="Question"
        value={question}
        placeholder="What would you like to know?"
        maxLength={MAX_WELLNESS_QUESTION_CHARS}
        multiline
        onChangeText={(value) => {
          setQuestion(value);
          setQuestionError('');
        }}
      />
      <PrimaryButton
        label={asking ? 'Asking...' : 'Ask'}
        disabled={asking}
        onPress={handleAskQuestion}
      />

      {asking ? (
        <View
          accessibilityLabel="Preparing wellness answer"
          accessibilityRole="progressbar"
          style={styles.wellnessAnswerStatus}
        >
          <ActivityIndicator color={palette.green} size="small" />
          <Text style={styles.bodyText}>Preparing your answer...</Text>
        </View>
      ) : null}

      {questionError ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {questionError}
        </Text>
      ) : null}

      {answer ? (
        <View accessibilityLiveRegion="polite" style={styles.wellnessAnswer}>
          <Text style={styles.sectionLabel}>Answer</Text>
          <Text style={styles.bodyText}>{answer}</Text>
        </View>
      ) : null}
    </View>
  </View>
);
```

Add these styles. The answer remains an unframed region within the section,
not another card:

```ts
wellnessAnswerStatus: {
  alignItems: 'center',
  borderTopColor: palette.border,
  borderTopWidth: 1,
  flexDirection: 'row',
  gap: 10,
  marginTop: 16,
  paddingTop: 16,
},
wellnessAnswer: {
  borderTopColor: palette.border,
  borderTopWidth: 1,
  marginTop: 16,
  paddingTop: 16,
},
```

- [ ] **Step 7: Wire the screen and update Pro+ copy**

Render the new screen in the app scroll view:

```tsx
{activeTab === 'flow-better' ? (
  <FlowBetterScreen localDate={today} profile={profile} trends={trends} />
) : null}
```

Update the Today call to pass only `entry`, `includeTodayAsMissed`, and
`onLog`. In Settings, use the exact toggle copy `Daily Flow Pro+` and keep the
endpoint placeholder as `https://your-ngrok-domain/wellness-note`.

Replace the sensitive-data paragraph with:

```tsx
<Text style={styles.bodyText}>
  Data is stored locally on this device. Private reminders hide bowel movement
  wording from notification text. Daily Flow Pro+ sends summary counts and any
  question you choose to submit to your configured proxy.
</Text>
```

- [ ] **Step 8: Update README prototype instructions**

Add this subsection under `Development Notes`:

```md
### Daily Flow Pro+

The local `Daily Flow Pro+` setting reveals the second-row `Flow better ✨`
tab. That screen contains the generated daily note and a one-question-at-a-time
wellness form. A submitted question is sent with compact 30-day summary counts
and is not saved by the app or proxy.

The app derives `/wellness-question` from the configured `/wellness-note` URL,
so the same proxy host and access code serve both routes. Restart the local
proxy after pulling changes that add the question route.
```

- [ ] **Step 9: Run focused and full automated verification**

Run: `npx jest src/__tests__/flowBetterScreen.test.ts src/__tests__/navigation.test.ts src/__tests__/llmWellnessQuestions.test.ts --runInBand`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: all Jest and Node proxy tests pass with zero failures.

Run: `npm run predeploy`

Expected: Expo SDK 57 bundles the web app successfully into `dist`.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 10: Perform phone and desktop UI verification**

Use the running Expo web app at `http://localhost:8081/` and verify at a phone
viewport near 390 by 844 and a desktop viewport near 1280 by 900:

1. With Daily Flow Pro+ off, only the four primary tabs are present and Today
   has no wellness-note panel.
2. Turn Daily Flow Pro+ on and save; `Flow better ✨` appears centered on its
   own full-width second row.
3. Confirm the inactive control has the coral-purple-blue-green outline,
   white interior, centered purple label, stable height, and no overlap.
4. Select it; confirm the active purple interior and white label remain inside
   the gradient outline and the header reads `Flow Better`.
5. With endpoint and access code configured, confirm the note loader appears
   before the generated note and fallback appears if the proxy is unavailable.
6. Submit one question; confirm the loading state prevents duplicate submits,
   the answer appears, and a second submission replaces the prior answer.
7. Reload; confirm the question answer is gone.
8. Stop the proxy; confirm the typed question stays and the generic retry copy
   appears without exposing provider details.
9. Check keyboard dismissal, multiline input sizing, text wrapping, and no
   overlapping controls.

- [ ] **Step 11: Commit the Flow Better experience**

```bash
git add App.tsx package.json package-lock.json README.md src/__tests__/flowBetterScreen.test.ts
git commit -m "Add Daily Flow Pro experience"
```

---

### Task 5: Final Privacy And Regression Audit

**Files:**
- Review: `App.tsx`
- Review: `src/lib/llmWellnessNotes.ts`
- Review: `src/lib/llmWellnessQuestions.ts`
- Review: `server/wellness-note-proxy.mjs`
- Review: `src/storage/database.ts`
- Review: `src/storage/database.web.ts`
- Review: all changed tests and documentation

**Interfaces:**
- Consumes: the completed implementation and its commits.
- Produces: evidence that Flow Better satisfies the approved design without expanding persisted or transmitted data.

- [ ] **Step 1: Audit transmitted and persisted fields**

Run:

```bash
rg -n "question|answer|WellnessQuestion" App.tsx src server
```

Expected: question and answer content appears only in component state, the
typed client request, and provider input. It must not appear in storage schemas,
profile writes, notification records, or logger metadata.

Run:

```bash
rg -n "llmWellnessNotesEnabled|llm_wellness_notes_enabled" src/storage App.tsx
```

Expected: no new storage column or migration; the existing boolean remains the
prototype access flag.

- [ ] **Step 2: Run the final clean verification set**

Run:

```bash
npm run typecheck
npm test
npm run predeploy
git diff --check
git status --short --branch
```

Expected: typecheck, all tests, and Expo export pass; diff check is clean; the
working tree contains only intentional plan-tracking changes, if any.

- [ ] **Step 3: Review the branch diff against the approved spec**

Run:

```bash
git diff origin/codex/llm-wellness-notes...HEAD -- App.tsx package.json package-lock.json README.md src server
```

Confirm every approved behavior is represented and there is no account,
database, RAG, billing, analytics, or unrelated refactor work.

- [ ] **Step 4: Record final verification without adding another code change**

Summarize the exact passing test counts, typecheck result, export result, manual
viewports checked, and any real-OpenAI manual test that could not be run due to
missing local credentials. Do not claim the real provider call was tested
unless it was actually observed.
