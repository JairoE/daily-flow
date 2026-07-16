import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_BODY_BYTES,
  parseAllowedOrigins,
  requestOpenAiWellnessNote,
  validateRequestPolicy,
} from './wellness-note-proxy.mjs';

const allowedOrigins = parseAllowedOrigins('https://jairoe.github.io');
const accessToken = 'secret-token';
const payload = {
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

function validate(overrides = {}) {
  return validateRequestPolicy({
    method: 'POST',
    pathname: '/wellness-note',
    origin: 'https://jairoe.github.io',
    authorization: `Bearer ${accessToken}`,
    body: payload,
    bodyBytes: JSON.stringify(payload).length,
    allowedOrigins,
    accessToken,
    ...overrides,
  });
}

test('accepts the summaries-only proxy payload', () => {
  assert.equal(validate().ok, true);
});

test('rejects missing and wrong bearer tokens', () => {
  assert.equal(validate({ authorization: '' }).status, 401);
  assert.equal(validate({ authorization: 'Bearer nope' }).status, 401);
});

test('rejects disallowed origins', () => {
  assert.equal(validate({ origin: 'https://example.com' }).status, 403);
});

test('rejects oversized bodies', () => {
  assert.equal(validate({ bodyBytes: MAX_BODY_BYTES + 1 }).status, 413);
});

test('rejects raw-data-shaped payloads', () => {
  assert.equal(validate({ body: { ...payload, entries: [] } }).status, 400);
  assert.equal(validate({ body: { ...payload, localDate: '2026-07-10' } }).status, 400);
  assert.equal(validate({ body: { ...payload, laxativeNote: 'private note' } }).status, 400);
});

test('returns a normalized note from a mocked OpenAI response', async () => {
  const logs = [];
  const note = await requestOpenAiWellnessNote({
    payload,
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
      assert.equal(requestBody.max_output_tokens, 256);
      assert.equal(requestBody.store, false);
      assert.match(requestBody.input, /summaryWindowDays/);
      assert.doesNotMatch(requestBody.input, /localDate|laxativeNote|entries/);

      return {
        ok: true,
        json: async () => ({
          output_text:
            'Keep tracking these patterns gently and bring notable changes to a clinician conversation.',
        }),
      };
    },
  });

  assert.equal(
    note,
    'Keep tracking these patterns gently and bring notable changes to a clinician conversation.',
  );
  assert.deepEqual(logs, [
    {
      level: 'info',
      message: 'wellness-note: requesting OpenAI',
      metadata: { model: 'test-model' },
    },
    {
      level: 'info',
      message: 'wellness-note: generated note',
      metadata: {
        model: 'test-model',
        outputTokens: null,
        reasoningTokens: null,
        responseId: null,
      },
    },
  ]);
});

test('logs privacy-safe metadata when OpenAI returns no visible note', async () => {
  const logs = [];
  const note = await requestOpenAiWellnessNote({
    payload,
    apiKey: 'test-key',
    model: 'gpt-5.6',
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
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        id: 'resp_test',
        model: 'gpt-5.6-sol',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output_text: '',
        usage: {
          output_tokens: 90,
          output_tokens_details: { reasoning_tokens: 90 },
        },
      }),
    }),
  });

  assert.equal(note, null);
  assert.deepEqual(logs, [
    {
      level: 'info',
      message: 'wellness-note: requesting OpenAI',
      metadata: { model: 'gpt-5.6' },
    },
    {
      level: 'warn',
      message: 'wellness-note: OpenAI returned no usable note',
      metadata: {
        hasVisibleText: false,
        incompleteReason: 'max_output_tokens',
        model: 'gpt-5.6-sol',
        outputTokens: 90,
        reasoningTokens: 90,
        responseId: 'resp_test',
        status: 'incomplete',
        visibleTextLength: 0,
      },
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(logs),
    /summaryWindowDays|bowelMovementDaysLast30|authorization|test-key/,
  );
});

test('logs privacy-safe metadata when OpenAI rejects the request', async () => {
  const logs = [];

  await assert.rejects(
    requestOpenAiWellnessNote({
      payload,
      apiKey: 'test-key',
      model: 'gpt-5.6',
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
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        headers: {
          get(name) {
            return name === 'x-request-id' ? 'req_test' : null;
          },
        },
        json: async () => ({
          error: {
            code: 'invalid_api_key',
            message: 'This provider message must not be logged.',
            type: 'invalid_request_error',
          },
        }),
      }),
    }),
    /OpenAI request failed/,
  );

  assert.deepEqual(logs, [
    {
      level: 'info',
      message: 'wellness-note: requesting OpenAI',
      metadata: { model: 'gpt-5.6' },
    },
    {
      level: 'error',
      message: 'wellness-note: OpenAI rejected request',
      metadata: {
        errorCode: 'invalid_api_key',
        errorType: 'invalid_request_error',
        httpStatus: 401,
        model: 'gpt-5.6',
        requestId: 'req_test',
      },
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(logs),
    /provider message|summaryWindowDays|authorization|test-key/,
  );
});

test('logs privacy-safe metadata when the OpenAI request cannot complete', async () => {
  const logs = [];
  const transportError = new Error('This transport message must not be logged.');
  transportError.name = 'AbortError';

  await assert.rejects(
    requestOpenAiWellnessNote({
      payload,
      apiKey: 'test-key',
      model: 'gpt-5.6',
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

  assert.deepEqual(logs, [
    {
      level: 'info',
      message: 'wellness-note: requesting OpenAI',
      metadata: { model: 'gpt-5.6' },
    },
    {
      level: 'error',
      message: 'wellness-note: OpenAI transport failed',
      metadata: {
        errorName: 'AbortError',
        model: 'gpt-5.6',
      },
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(logs),
    /transport message|summaryWindowDays|authorization|test-key/,
  );
});
