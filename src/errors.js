/** Stable error metadata shared by HTTP and response validation. */
export class ValenAPIError extends Error {
  constructor(message, statusCode, requestId, options = {}) {
    super(message, options);
    this.name = 'ValenAPIError';
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.code = options.code ?? (statusCode ? 'http_error' : 'request_error');
    this.model = options.model;
    this.field = options.field;
    this.retryable = options.retryable ?? [429, 502, 503, 504].includes(statusCode);
  }
}
export class ValenResponseError extends ValenAPIError {
  constructor(message, options = {}) {
    super(message, options.statusCode, options.requestId, { ...options, code: 'invalid_response', retryable: false });
    this.name = 'ValenResponseError';
  }
}
export class ValenTimeoutError extends ValenAPIError {
  constructor(message = 'Valen total timeout exceeded') {
    super(message, undefined, undefined, { code: 'timeout', retryable: false });
    this.name = 'ValenTimeoutError';
  }
}
export class ValenInputError extends TypeError {
  constructor(message, field) {
    super(message);
    this.name = 'ValenInputError';
    this.code = 'invalid_input';
    this.field = field;
    this.retryable = false;
  }
}
