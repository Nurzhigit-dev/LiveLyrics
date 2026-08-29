/**
 * Types for identify.mjs.
 *
 * The implementation is plain JavaScript so it can be dropped into a
 * serverless runtime with no build step, but it is imported by
 * vite.config.ts — which is type-checked — so it needs a declaration.
 */

export interface AcrCredentials {
  host: string;
  accessKey: string;
  accessSecret: string;
}

export interface IdentifiedTrack {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  /** Seconds into the song that the START of the sample came from. */
  offset: number;
}

export type IdentifyResult =
  | { ok: true; track: IdentifiedTrack }
  | { ok: false; kind: string; message: string };

export function readCredentials(env?: Record<string, string | undefined>): AcrCredentials | null;

export function identify(
  audio: ArrayBuffer | Uint8Array,
  credentials: AcrCredentials,
  timeoutMs?: number,
): Promise<IdentifyResult>;
