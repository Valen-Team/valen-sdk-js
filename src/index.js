/** Decision interfaces over the Valen HTTP API. */
export const VERSION = '0.2.1';

export class ValenAPIError extends Error {
  constructor(message, statusCode, requestId, options) {
    super(message, options);
    this.name = 'ValenAPIError';
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

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
    const { signal, timeout, ...fields } = { ...body, ...options };
    return this.backend.predict(fields, 'input' in body ? 'decisions' : 'system_one', { signal, timeout });
  }
  async decisions(request) {
    return this.predict(request);
  }
  async systemOne(state, questions, options = {}) {
    return this.predict({ state, questions }, options);
  }
  async system_one(state, questions, options = {}) {
    return this.systemOne(state, questions, options);
  }
  async close() {
    this.closed = true;
    await this.backend.close();
  }
}

// Resolves after ms, or rejects at once with the reason when the caller's signal aborts.
const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

class HTTPBackend {
  constructor(
    baseUrl,
    { apiKey, model, timeout = 120000, maxRetries = 2, fetch: fetch_ = globalThis.fetch } = {}
  ) {
    if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('maxRetries must be nonnegative');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.options = { apiKey, model, timeout, maxRetries, fetch_ };
  }
  async predict(body, protocol, { signal, timeout: requestTimeout } = {}) {
    const { apiKey, model, timeout, maxRetries, fetch_ } = this.options;
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
        if (attempt >= maxRetries)
          throw new ValenAPIError('Unable to reach Valen service', undefined, undefined, { cause: error });
        await wait(Math.min(250 * 2 ** attempt, 2000), signal);
        continue;
      }
      if ([429, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
        await response.body?.cancel();
        await wait(Math.min(250 * 2 ** attempt, 2000), signal);
        continue;
      }
      const text = await response.text();
      // Self-hosted servers send x-request-id; the hosted APIs send x-llm-proxy-request-id.
      const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-llm-proxy-request-id');
      let result;
      try {
        result = JSON.parse(text);
      } catch (error) {
        throw new ValenAPIError(
          `Valen returned HTTP ${response.status} without JSON: ${text.slice(0, 200)}`,
          response.status,
          requestId,
          { cause: error }
        );
      }
      const detail = result.error ?? result.detail ?? 'Valen request failed';
      if (!response.ok)
        throw new ValenAPIError(
          typeof detail === 'string' ? detail : (detail.message ?? JSON.stringify(detail)),
          response.status,
          requestId
        );
      return result;
    }
  }
  async close() {}
}

export const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
export const predicate = (instructions) => ({ type: 'noul', instructions });
export const score = (instructions, criteria) => ({ type: 'score', instructions, criteria });
