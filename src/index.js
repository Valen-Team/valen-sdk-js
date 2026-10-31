/** Decision interfaces over the Valen HTTP API. */
export const VERSION = '0.3.0';

import { ValenAPIError, ValenTimeoutError, ValenResponseError } from './errors.js';
import { validateResponse, responseMetadata, validateRequest } from './validation.js';
export { ValenAPIError, ValenResponseError, ValenTimeoutError, ValenInputError } from './errors.js';

import { emit } from './events.js';
const positive = (value, name) => {
  if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 2147483647))
    throw new TypeError(`${name} must be a positive integer no greater than 2147483647`);
  return value;
};
export class Valen {
  constructor(backend) {
    this.backend = backend;
    this.closed = false;
  }
  static remote(baseUrl, options = {}) {
    return new Valen(new HTTPBackend(baseUrl, options));
  }
  static async local(model, options = {}) {
    const { LocalBackend } = await import('./local.js');
    return new Valen(await LocalBackend.create(model, options));
  }
  async predict(request, options = {}) {
    if (this.closed) throw new Error('Valen client is closed');
    if (!request || typeof request !== 'object' || Array.isArray(request))
      throw new Error('Request must be an object');
    const body = request.request ?? request;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Request must be an object');
    // signal and timeout control the call; every other option is a request field.
    const { signal, timeout, totalTimeout, ...fields } = { ...body, ...options };
    return this.backend.predict(fields, 'input' in body ? 'decisions' : 'system_one', { signal, timeout, totalTimeout });
  }
  async decisions(request) {
    validateRequest(request);
    return validateResponse(request, await this.predict(request));
  }
  async systemOne(state, questions, options = {}) {
    validateRequest({state, questions});
    return validateResponse({ state, questions }, await this.predict({ state, questions }, options));
  }
  async system_one(state, questions, options = {}) {
    return this.systemOne(state, questions, options);
  }
  async warmup(request) { return this.predict(request); }
  get info() { return this.backend.info ?? { backend: 'http' }; }
  async close() {
    if (!this.closing) {
      this.closed = true;
      this.closing = Promise.resolve().then(() => this.backend.close());
    }
    await this.closing;
  }
}

// Resolves after ms, or rejects at once with the reason when the caller's signal aborts.
const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const cleanup = () => signal?.removeEventListener('abort', abort);
  const abort = () => { clearTimeout(timer); cleanup(); reject(signal.reason); };
  const timer = setTimeout(() => { cleanup(); resolve(); }, Math.min(ms, 2147483647));
  signal?.addEventListener('abort', abort, { once: true });
});
const retryDelay = (attempt, response) => {
  const header = response?.headers.get('retry-after');
  if (header) {
    const numeric = Number(header);
    const delay = Number.isFinite(numeric) ? numeric*1000 : Date.parse(header)-Date.now();
    if (Number.isFinite(delay)) return Math.max(0, delay);
  }
  return Math.random()*Math.min(250*2**attempt, 2000);
};

class HTTPBackend {
  constructor(
    baseUrl,
    { apiKey, model, timeout = 120000, maxRetries = 2, totalTimeout, onEvent, fetch: fetch_ = globalThis.fetch } = {}
  ) {
    if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('maxRetries must be nonnegative');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    positive(timeout, 'timeout');
    positive(totalTimeout, 'totalTimeout');
    this.options = { apiKey, model, timeout, totalTimeout, onEvent, maxRetries, fetch_ };
  }
  async predict(body, protocol, { signal: callerSignal, timeout: requestTimeout, totalTimeout: requestTotal } = {}) {
    const { apiKey, model, timeout, totalTimeout, onEvent, maxRetries, fetch_ } = this.options;
    const budget = positive(requestTotal ?? totalTimeout, 'totalTimeout');
    positive(requestTimeout ?? timeout, 'timeout');
    const started = performance.now();
    const deadline = budget == null ? undefined : AbortSignal.timeout(budget);
    const signal = callerSignal && deadline ? AbortSignal.any([callerSignal, deadline]) : callerSignal ?? deadline;
    emit(onEvent, { event: 'start', backend: 'http', model: body.model ?? model });
    try {
      const payload = JSON.stringify({ ...(model ? { model } : {}), ...body }, (_key, value) => {
        if (value instanceof Map)
          throw new Error(
            'HTTP requests require JSON objects; use Decisions candidate arrays to preserve numeric label order'
          );
        return value;
      });
      for (let attempt = 0; ; ++attempt) {
        let response;
        try {
          response = await fetch_(`${this.baseUrl}/${protocol === 'system_one' ? 'systemone' : protocol}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Browsers set their own User-Agent.
              ...(globalThis.process?.versions?.node ? { 'User-Agent': `valen-sdk-js/${VERSION}` } : {}),
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: payload,
            signal: signal
              ? AbortSignal.any([AbortSignal.timeout(requestTimeout ?? timeout), signal])
              : AbortSignal.timeout(requestTimeout ?? timeout),
          });
        } catch (error) {
          if (signal?.aborted) throw signal.reason;
          emit(onEvent, { event: 'attempt', attempt: attempt+1, code: error.name ?? 'network_error' });
          if (attempt >= maxRetries)
            throw new ValenAPIError('Unable to reach Valen service', undefined, undefined, { cause: error, code: error.name === 'TimeoutError' ? 'timeout' : 'network_error', model: body.model ?? model, retryable: true });
          const delay = retryDelay(attempt);
          emit(onEvent, { event: 'retry', attempt: attempt+1, delay });
          await wait(delay, signal);
          continue;
        }
        emit(onEvent, { event: 'attempt', attempt: attempt+1, statusCode: response.status, requestId: response.headers.get('x-request-id') ?? response.headers.get('x-llm-proxy-request-id') });
        if ([429, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
          await response.body?.cancel();
          const delay = retryDelay(attempt, response);
          emit(onEvent, { event: 'retry', attempt: attempt+1, delay });
          await wait(delay, signal);
          continue;
        }
        const text = await response.text();
        // Self-hosted servers send x-request-id; the hosted APIs send x-llm-proxy-request-id.
        const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-llm-proxy-request-id');
        let result;
        try {
          result = JSON.parse(text);
        } catch (error) {
          if (response.ok) throw new ValenResponseError('Valen returned a non-JSON success response', { statusCode: response.status, requestId, cause: error });
          throw new ValenAPIError(
            `Valen returned HTTP ${response.status} without JSON: ${text.slice(0, 200)}`,
            response.status,
            requestId,
            { cause: error }
          );
        }
        const detail = result?.error ?? result?.detail ?? 'Valen request failed';
        if (!response.ok)
          throw new ValenAPIError(
            typeof detail === 'string' ? detail : (detail.message ?? JSON.stringify(detail)),
            response.status,
            requestId
          );
        if (signal?.aborted) throw signal.reason;
        if (result && typeof result === 'object') responseMetadata.set(result, { statusCode: response.status, requestId });
        emit(onEvent, { event: 'complete', attempts: attempt+1, elapsed: performance.now()-started, model: result?.model, usage: result?.usage });
        return result;
      }
    } catch (error) {
      const failure = callerSignal?.aborted ? callerSignal.reason : deadline?.aborted ? new ValenTimeoutError() : error;
      emit(onEvent, { event: 'error', code: callerSignal?.aborted ? 'cancelled' : failure.code ?? 'request_error', elapsed: performance.now()-started });
      throw failure;
    }
  }
  async close() {}
}

export const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
export const predicate = (instructions) => ({ type: 'noul', instructions });
export const score = (instructions, criteria) => ({ type: 'score', instructions, criteria });
