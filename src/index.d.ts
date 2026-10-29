export type ChoiceValue = string | boolean;
export interface ChoiceQuestion {
  name?: string;
  type: 'choice';
  instructions: string;
  choices: { value: ChoiceValue; description: string }[];
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
  levels: { label: string; description: string }[];
}
export type Question = ChoiceQuestion | PredicateQuestion | ScoreQuestion;
export type ContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_video'; video_url: string };
export type Input = string | { role: 'user' | 'assistant' | 'system'; content: string | ContentPart[] }[];
export interface Usage {
  input_tokens: number;
  output_tokens: number;
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
}
export interface RemoteOptions {
  apiKey?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
}
export class Valen {
  static local(model: string, options?: LocalOptions): Promise<Valen>;
  static remote(baseUrl: string, options?: RemoteOptions): Valen;
  decisions(request: { input: Input; questions: Question[] } & RequestOptions): Promise<DecisionResponse>;
  systemOne(
    state: string | Record<string, unknown>,
    questions: Record<string, SystemOneQuestion> | Map<string, SystemOneQuestion>,
    options?: RequestOptions
  ): Promise<SystemOneResponse>;
  system_one(
    state: string | Record<string, unknown>,
    questions: Record<string, SystemOneQuestion> | Map<string, SystemOneQuestion>,
    options?: RequestOptions
  ): Promise<SystemOneResponse>;
  predict(request: { input: Input; questions: Question[] }, options?: RequestOptions): Promise<DecisionResponse>;
  predict(
    request: { state: string | Record<string, unknown>; questions: Record<string, SystemOneQuestion> },
    options?: RequestOptions
  ): Promise<SystemOneResponse>;
  predict(request: Record<string, unknown>, options?: RequestOptions): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}
export const VERSION: string;
export class ValenAPIError extends Error {
  constructor(message: string, statusCode?: number, requestId?: string | null, options?: { cause?: unknown });
  statusCode?: number;
  requestId?: string | null;
}
export function choice(
  instructions: string,
  criteria: Record<string, string> | Map<string, string>
): SystemOneQuestion;
export function predicate(instructions: string): SystemOneQuestion;
export function score(instructions: string, criteria: string[]): SystemOneQuestion;

export interface LocalOptions {
  device?: 'cpu' | 'wasm' | 'webgpu';
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
