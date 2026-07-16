import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  MAX_BODY_BYTES,
  createServer,
  parseAllowedOrigins,
  requestOpenAiWellnessAnswer,
  requestOpenAiWellnessNote,
  validateRequestPolicy,
  validateWellnessQuestionPayload,
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
const questionPayload = {
  question: 'What gentle habits may support regularity?',
  summary: payload,
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

test('accepts only a bounded question and valid summary', () => {
  assert.equal(validateWellnessQuestionPayload(questionPayload).ok, true);
  assert.equal(
    validateWellnessQuestionPayload({
      ...questionPayload,
      question: '   ',
    }).status,
    400,
  );
  assert.equal(
    validateWellnessQuestionPayload({
      ...questionPayload,
      question: 'x'.repeat(501),
    }).status,
    400,
  );
  assert.equal(
    validateWellnessQuestionPayload({
      ...questionPayload,
      entries: [],
    }).status,
    400,
  );
  assert.equal(
    validateWellnessQuestionPayload({
      ...questionPayload,
      extra: true,
    }).status,
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
  assert.equal(validateRequestPolicy(base).kind, 'question');
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
      assert.doesNotMatch(
        requestBody.input,
        /localDate|laxativeNote|entries/,
      );

      return {
        ok: true,
        json: async () => ({
          output_text:
            'Gradual fiber, enough fluids, and regular movement may support regularity.',
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

function postJson(server, pathname, body) {
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected a listening TCP server.');
  }

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: address.port,
        path: pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Origin: 'https://jairoe.github.io',
        },
      },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        });
      },
    );

    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}

test('serves a wellness answer through the local HTTP route', async (context) => {
  const logs = [];
  const server = createServer(
    {
      ALLOWED_ORIGINS: 'https://jairoe.github.io',
      LLM_PROXY_ACCESS_TOKEN: accessToken,
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'test-model',
    },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ output_text: 'A gentle mocked answer.' }),
      }),
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
    },
  );

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());

  const response = await postJson(
    server,
    '/wellness-question',
    questionPayload,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { answer: 'A gentle mocked answer.' });
  assert.doesNotMatch(
    JSON.stringify(logs),
    /gentle habits|mocked answer|summaryWindowDays|test-key/,
  );
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
