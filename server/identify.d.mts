/**
 * Types for identify.mjs.
 *
 * The implementation is plain JavaScript so it can be dropped into a
 * serverless runtime with no build step, but it is imported by
 * vite.config.ts — which is type-checked — so it needs a declaration.
 */

type Env = Record<string, string | undefined>;

export interface AcrCredentials {
  host: string;
  accessKey: string;
  accessSecret: string;
}

export interface ConfigReport {
  credentials: AcrCredentials | null;
  problems: string[];
  warnings: string[];
  host: string | null;
  accessKeyLength: number;
  accessSecretLength: number;
}

export interface IdentifiedTrack {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  /** Seconds into the song at the START of the submitted sample. */
  offset: number;
  score?: number;
  titleVariants: string[];
  artistVariants: string[];
}

export type IdentifyResult =
  | { ok: true; track: IdentifiedTrack; candidates: IdentifiedTrack[] }
  | { ok: false; kind: string; message: string };

export interface HttpDecision {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export const MAX_BYTES: number;

export function inspectConfig(env?: Env): ConfigReport;
export function readCredentials(env?: Env): AcrCredentials | null;

export function identify(
  audio: ArrayBuffer | Uint8Array,
  credentials: AcrCredentials,
  timeoutMs?: number,
): Promise<IdentifyResult>;

export function methodNotAllowed(allow: string): HttpDecision;
export function bodyFailure(err: unknown): HttpDecision;
export function respondToIdentify(
  audio: ArrayBuffer | Uint8Array,
  env?: Env,
  options?: { setupHint?: string },
): Promise<HttpDecision>;
export function respondToHealth(env?: Env): HttpDecision;
