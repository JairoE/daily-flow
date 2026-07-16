import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ALLOWED_ORIGINS =
  'https://jairoe.github.io,http://localhost:8081,http://127.0.0.1:8081';
export const DEFAULT_MODEL = 'gpt-5.6';
export const DEFAULT_PORT = 8787;
export const MAX_BODY_BYTES = 4096;
export const MAX_QUESTION_CHARS = 500;
export const MAX_ANSWER_CHARS = 1600;
export const WELLNESS_NOTE_PATH = '/wellness-note';
export const WELLNESS_QUESTION_PATH = '/wellness-question';

const requiredSummaryKeys = [
  'summaryWindowDays',
  'bowelMovementDaysLast30',
  'averagePerWeekLast30',
  'currentGapDays',
  'longestGapDays',
  'hardOrLumpyDays',
  'looseOrWateryDays',
  'symptomBurdenDays',
  'laxativeUseDays',
  'checkInRateLast30',
  'detailDays',
];

const requiredSummaryKeySet = new Set(requiredSummaryKeys);

const forbiddenRawDataKeys = new Set([
  'checkedinat',
  'createdat',
  'dailyentries',
  'displayname',
  'entries',
  'historydays',
  'id',
  'laxativenote',
  'localdate',
  'notificationrecords',
  'profile',
  'timezone',
  'updatedat',
]);

export const wellnessNoteInstructions = [
  'You write one gentle wellness note for a bowel movement tracking app.',
  'Use the provided summary counts only.',
  'Do not diagnose, treat, prescribe, recommend medication, or give dosage instructions.',
  'Do not mention exact dates, private data, or that you are an AI.',
  'Use calm, non-judgmental language and clinician-discussion framing when patterns seem noteworthy.',
  'Return one sentence, at most 32 words.',
].join(' ');

export const wellnessQuestionInstructions = [
  'Answer one gastrointestinal wellness or bowel-pattern question.',
  'Use the supplied summary only when it is relevant.',
  'Be concise, calm, non-judgmental, and educational.',
  'Do not diagnose, prescribe, recommend medication, give dosage instructions, or make treatment claims.',
  'Do not present the answer as a substitute for a clinician.',
  'Encourage clinician discussion for concerning patterns and urgent professional help for potentially urgent wording.',
  'If the question is unrelated or cannot be answered safely, state that limitation briefly.',
].join(' ');

export function parseAllowedOrigins(
  value = DEFAULT_ALLOWED_ORIGINS,
) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return Boolean(origin && allowedOrigins.includes(origin));
}

function isPlainRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasForbiddenRawDataKeys(value) {
  const stack = [value];

  while (stack.length > 0) {
    const current = stack.pop();

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    if (!isPlainRecord(current)) {
      continue;
    }

    for (const [key, child] of Object.entries(current)) {
      if (forbiddenRawDataKeys.has(key.toLowerCase())) {
        return true;
      }

      stack.push(child);
    }
  }

  return false;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateWellnessNotePayload(value) {
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
    if (!requiredSummaryKeySet.has(key)) {
      return { ok: false, status: 400, error: `Unexpected field: ${key}` };
    }
  }

  for (const key of requiredSummaryKeys) {
    if (!(key in value)) {
      return { ok: false, status: 400, error: `Missing field: ${key}` };
    }
  }

  if (value.summaryWindowDays !== 30) {
    return {
      ok: false,
      status: 400,
      error: 'summaryWindowDays must be 30.',
    };
  }

  for (const key of requiredSummaryKeys) {
    if (key === 'summaryWindowDays' || key === 'currentGapDays') {
      continue;
    }

    if (!isNonNegativeNumber(value[key])) {
      return { ok: false, status: 400, error: `${key} must be a number.` };
    }
  }

  if (
    value.currentGapDays !== null &&
    !isNonNegativeNumber(value.currentGapDays)
  ) {
    return {
      ok: false,
      status: 400,
      error: 'currentGapDays must be a number or null.',
    };
  }

  return {
    ok: true,
    payload: Object.fromEntries(
      requiredSummaryKeys.map((key) => [key, value[key]]),
    ),
  };
}

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

  for (const key of Object.keys(value)) {
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
    return { ok: false, status: 500, error: 'Proxy access token is not configured.' };
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

function corsHeaders(origin, allowedOrigins) {
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    Vary: 'Origin',
  };
}

function sendJson(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function sendEmpty(response, statusCode, headers = {}) {
  response.writeHead(statusCode, headers);
  response.end();
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;

    request.on('data', (chunk) => {
      byteLength += chunk.length;

      if (byteLength > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => {
      resolve({
        text: Buffer.concat(chunks).toString('utf8'),
        byteLength,
      });
    });

    request.on('error', reject);
  });
}

export function extractOpenAiText(value) {
  if (!isPlainRecord(value)) {
    return null;
  }

  if (typeof value.output_text === 'string') {
    return value.output_text.trim();
  }

  if (!Array.isArray(value.output)) {
    return null;
  }

  for (const item of value.output) {
    if (!isPlainRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!isPlainRecord(content)) {
        continue;
      }

      if (typeof content.text === 'string') {
        return content.text.trim();
      }
    }
  }

  return null;
}

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

function readString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getOpenAiResponseMetadata(value, fallbackModel, visibleText) {
  const response = isPlainRecord(value) ? value : {};
  const incompleteDetails = isPlainRecord(response.incomplete_details)
    ? response.incomplete_details
    : {};
  const usage = isPlainRecord(response.usage) ? response.usage : {};
  const outputTokenDetails = isPlainRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : {};

  return {
    responseId: readString(response.id),
    model: readString(response.model) ?? fallbackModel,
    status: readString(response.status),
    incompleteReason: readString(incompleteDetails.reason),
    outputTokens: readNumber(usage.output_tokens),
    reasoningTokens: readNumber(outputTokenDetails.reasoning_tokens),
    hasVisibleText: visibleText.length > 0,
    visibleTextLength: visibleText.length,
  };
}

async function readOpenAiResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function requestOpenAiWellnessNote({
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
    logger.info?.('wellness-note: requesting OpenAI', { model });

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
          instructions: wellnessNoteInstructions,
          input: `Create the note from this summary only: ${JSON.stringify(payload)}`,
          max_output_tokens: 256,
          store: false,
        }),
        signal: controller.signal,
      });
    } catch (caught) {
      logger.error?.('wellness-note: OpenAI transport failed', {
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

      logger.error?.('wellness-note: OpenAI rejected request', {
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
    const note = normalizeGeneratedNote(visibleText);
    const metadata = getOpenAiResponseMetadata(
      responseValue,
      model,
      visibleText,
    );

    if (!note) {
      logger.warn?.('wellness-note: OpenAI returned no usable note', {
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

    logger.info?.('wellness-note: generated note', {
      model: metadata.model,
      outputTokens: metadata.outputTokens,
      reasoningTokens: metadata.reasoningTokens,
      responseId: metadata.responseId,
    });

    return note;
  } finally {
    clearTimeout(timeout);
  }
}

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
    const metadata = getOpenAiResponseMetadata(
      responseValue,
      model,
      visibleText,
    );

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

export async function handleProxyRequest(
  request,
  response,
  env = process.env,
  dependencies = {},
) {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const origin = request.headers.origin ?? '';
  const headers = corsHeaders(origin, allowedOrigins);
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin, allowedOrigins)) {
      sendJson(response, 403, { error: 'Origin is not allowed.' });
      return;
    }

    sendEmpty(response, 204, headers);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  let body;

  try {
    const raw = await readRequestBody(request);
    body = {
      value: raw.text ? JSON.parse(raw.text) : null,
      byteLength: raw.byteLength,
    };
  } catch (caught) {
    const status = caught && typeof caught.status === 'number' ? caught.status : 400;
    sendJson(response, status, { error: 'Invalid request body.' }, headers);
    return;
  }

  const validation = validateRequestPolicy({
    method: request.method,
    pathname: url.pathname,
    origin,
    authorization: request.headers.authorization ?? '',
    body: body.value,
    bodyBytes: body.byteLength,
    allowedOrigins,
    accessToken: env.LLM_PROXY_ACCESS_TOKEN ?? '',
  });

  if (!validation.ok) {
    sendJson(response, validation.status, { error: validation.error }, headers);
    return;
  }

  if (!env.OPENAI_API_KEY) {
    sendJson(response, 500, { error: 'OpenAI API key is not configured.' }, headers);
    return;
  }

  try {
    if (validation.kind === 'question') {
      const answer = await requestOpenAiWellnessAnswer({
        payload: validation.payload,
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        fetchImpl: dependencies.fetchImpl,
        logger: dependencies.logger,
      });

      if (!answer) {
        sendJson(
          response,
          502,
          { error: 'Unable to generate a safe answer.' },
          headers,
        );
        return;
      }

      sendJson(response, 200, { answer }, headers);
      return;
    }

    const note = await requestOpenAiWellnessNote({
      payload: validation.payload,
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      fetchImpl: dependencies.fetchImpl,
      logger: dependencies.logger,
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
}

export function createServer(env = process.env, dependencies = {}) {
  return http.createServer((request, response) => {
    handleProxyRequest(request, response, env, dependencies).catch(() => {
      sendJson(response, 500, { error: 'Unexpected proxy error.' });
    });
  });
}

export function startServer(env = process.env) {
  if (!env.OPENAI_API_KEY || !env.LLM_PROXY_ACCESS_TOKEN) {
    console.error(
      'Set OPENAI_API_KEY and LLM_PROXY_ACCESS_TOKEN before starting the wellness note proxy.',
    );
    process.exitCode = 1;
    return null;
  }

  const port = Number(env.PORT || DEFAULT_PORT);
  const server = createServer(env);

  server.listen(port, () => {
    console.log(`Wellness note proxy listening on http://localhost:${port}`);
  });

  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
