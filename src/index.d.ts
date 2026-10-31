export type ChoiceValue = string | boolean;
export interface ChoiceQuestion {
  name?: string;
  type: 'choice';
  instructions: string;
  choices: readonly { readonly value: ChoiceValue; readonly description: string }[];
}
export interface PredicateQuestion {
  name?: string;
  type: 'predicate';
  instructions: string;
}
export interface ScoreQuestion {
  name?: string;
  type: 'score';
  instructions: string;
  levels: readonly { readonly label: string; readonly description: string }[];
}
export type Question = ChoiceQuestion | PredicateQuestion | ScoreQuestion;
export type ContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_video'; video_url: string };
export type Input = string | { role: 'user' | 'assistant' | 'system'; content: string | ContentPart[] }[];
export interface Usage {
  input_tokens: number | null;
  output_tokens: number | null;
  [key: string]: unknown;
}
export interface ChoiceAnswer {
  name: string;
  type: 'choice';
  choice: ChoiceValue;
  confidence: number;
  probabilities: { value: ChoiceValue; probability: number }[];
}
export interface PredicateAnswer {
  name: string;
  type: 'predicate';
  probability: number;
}
export interface ScoreAnswer {
  name: string;
  type: 'score';
  score: number;
  confidence: number;
  probabilities: { label: string; value: number; probability: number }[];
}
export interface DecisionResponse {
  model: string;
  answers: (ChoiceAnswer | PredicateAnswer | ScoreAnswer)[];
  usage: Usage;
  internal_usage?: { compute_tokens: number };
}
export type SystemOneQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> | Map<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };
export interface NoulAnswer {
  type: 'noul';
  noul: number;
}
export interface SystemOneChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface SystemOneScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
  /** Level index to criterion text. */
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}
export type SystemOneAnswer = NoulAnswer | SystemOneChoiceAnswer | SystemOneScoreAnswer;
export interface SystemOneResponse {
  model: string;
  model_id?: string;
  revision?: string;
  answers: Record<string, SystemOneAnswer>;
  usage: Usage;
  internal_usage?: { compute_tokens: number };
}
export interface RequestOptions {
  model?: string;
  temperature?: number;
  execution?: 'shared_state' | 'question';
  /** Cancels an HTTP request; local inference ignores it. */
  signal?: AbortSignal;
  /** Milliseconds for each HTTP attempt, overriding the client's timeout. */
  timeout?: number;
  /** Total wall-clock budget, including retries, in milliseconds (HTTP only). */
  totalTimeout?: number;
}
export interface RemoteOptions {
  apiKey?: string;
  model?: string;
  timeout?: number;
  /** Total wall-clock budget, including retries, in milliseconds (HTTP only). */
  totalTimeout?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
  onEvent?: (event: RequestEvent) => void;
}
export class Valen {
  static local(model: string, options?: LocalOptions): Promise<Valen>;
  static remote(baseUrl: string, options?: RemoteOptions): Valen;
  decisions<const Q extends readonly Question[]>(request: { input: Input; questions: Q } & RequestOptions): Promise<TypedDecisionResponse<Q>>;
  systemOne<const Q extends Record<string, SystemOneQuestion>>(
    state: string | Record<string, unknown>,
    questions: Q,
    options?: RequestOptions
  ): Promise<TypedSystemOneResponse<Q>>;
  systemOne(state: string | Record<string, unknown>, questions: Map<string, SystemOneQuestion>, options?: RequestOptions): Promise<SystemOneResponse>;
  system_one<const Q extends Record<string, SystemOneQuestion>>(
    state: string | Record<string, unknown>,
    questions: Q,
    options?: RequestOptions
  ): Promise<TypedSystemOneResponse<Q>>;
  system_one(state: string | Record<string, unknown>, questions: Map<string, SystemOneQuestion>, options?: RequestOptions): Promise<SystemOneResponse>;
  predict(request: { input: Input; questions: Question[] }, options?: RequestOptions): Promise<DecisionResponse>;
  predict(
    request: { state: string | Record<string, unknown>; questions: Record<string, SystemOneQuestion> },
    options?: RequestOptions
  ): Promise<SystemOneResponse>;
  predict(request: Record<string, unknown>, options?: RequestOptions): Promise<Record<string, unknown>>;
  warmup(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  readonly info: Record<string, unknown>;
  close(): Promise<void>;
}
export const VERSION: string;
export class ValenAPIError extends Error {
  constructor(message: string, statusCode?: number, requestId?: string | null, options?: { cause?: unknown; code?: string; model?: string; field?: string; retryable?: boolean });
  code: string;
  model?: string;
  field?: string;
  retryable: boolean;
  statusCode?: number;
  requestId?: string | null;
}
export function choice<const C extends Record<string, string>>(instructions: string, criteria: C): { type: 'choice'; instructions: string; criteria: C };
export function choice(instructions: string, criteria: Map<string, string>): Extract<SystemOneQuestion, { type: 'choice' }>;
export function predicate(instructions: string): Extract<SystemOneQuestion, { type: 'noul' }>;
export function score(instructions: string, criteria: string[]): Extract<SystemOneQuestion, { type: 'score' }>;

export interface LocalOptions {
  device?: 'cpu' | 'wasm' | 'webgpu';
  onEvent?: (event: RequestEvent) => void;
  variant?: string;
  revision?: string;
  cacheDir?: string;
  localFilesOnly?: boolean;
  token?: string;
  modelName?: string;
  numThreads?: number;
  execution?: 'shared_state' | 'question';
  mediaKwargs?: Record<string, unknown>;
  wasmPaths?: string;
  pillowWasmUrl?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  videoTimeout?: number;
  maxVideoDecodeBytes?: number;
  verify?: boolean;
  downloadTimeout?: number;
}

export type AnswerFor<Q> = Q extends { type: 'noul' } ? NoulAnswer :
  Q extends { type: 'score' } ? SystemOneScoreAnswer :
  Q extends { type: 'choice'; criteria: infer C } ? Omit<SystemOneChoiceAnswer, 'choice' | 'probabilities'> & {
    choice: C extends Map<string, string> ? string : Extract<keyof C, string>;
    probabilities: Record<C extends Map<string, string> ? string : Extract<keyof C, string>, number>;
  } : SystemOneAnswer;
export type TypedSystemOneResponse<Q> = Omit<SystemOneResponse, 'answers'> & { answers: { [K in keyof Q]: AnswerFor<Q[K]> } };
export interface RequestEvent {
  event: 'start' | 'attempt' | 'retry' | 'complete' | 'error' | 'load_start' | 'load_complete' | 'graph_load_start' | 'graph_load_complete' | 'download_start' | 'download_complete';
  backend?: string;
  variant?: string;
  graph?: string;
  asset?: string;
  model?: string;
  attempt?: number;
  attempts?: number;
  elapsed?: number;
  delay?: number;
  code?: string;
  statusCode?: number;
  requestId?: string | null;
  usage?: Usage;
}
export class ValenResponseError extends ValenAPIError {
  constructor(message: string, options?: { statusCode?: number; requestId?: string; field?: string; model?: string; cause?: unknown });
}
export class ValenTimeoutError extends ValenAPIError { constructor(message?: string); }

export type DecisionAnswerFor<Q> = Q extends { type: 'predicate' } ? PredicateAnswer :
  Q extends { type: 'score' } ? ScoreAnswer : Q extends { type: 'choice'; choices: readonly (infer C)[] } ?
  Omit<ChoiceAnswer, 'choice' | 'probabilities'> & {
    choice: C extends { value: infer V extends ChoiceValue } ? V : ChoiceValue;
    probabilities: { value: C extends { value: infer V extends ChoiceValue } ? V : ChoiceValue; probability: number }[];
  } : ChoiceAnswer | PredicateAnswer | ScoreAnswer;
export type TypedDecisionResponse<Q extends readonly Question[]> = Omit<DecisionResponse, 'answers'> & {
  answers: { -readonly [I in keyof Q]: DecisionAnswerFor<Q[I]> };
};

export class ValenInputError extends TypeError {
  constructor(message: string, field?: string);
  code: 'invalid_input';
  field?: string;
  retryable: false;
}
