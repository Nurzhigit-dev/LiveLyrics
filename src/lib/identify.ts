import type { Track } from '../types';

/**
 * Asks our own server what is playing.
 *
 * The browser posts raw WAV bytes and gets a track back. It holds no API key
 * and knows nothing about the recogniser — all of that lives server-side in
 * server/identify.mjs, so a visitor can just press Listen.
 */

export type IdentifyErrorKind =
  | 'nomatch'
  | 'auth'
  | 'quota'
  | 'network'
  | 'unconfigured'
  | 'unknown';

export class IdentifyError extends Error {
  readonly kind: IdentifyErrorKind;

  constructor(message: string, kind: IdentifyErrorKind) {
    super(message);
    this.name = 'IdentifyError';
    this.kind = kind;
  }
}

interface ApiResponse {
  kind?: string;
  message?: string;
  track?: Track;
}

export async function identify(sample: Blob, timeoutMs = 20000): Promise<Track> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let payload: ApiResponse;
  try {
    const res = await fetch('api/identify', {
      method: 'POST',
      // Raw body rather than multipart: nothing on the server has to parse it.
      headers: { 'Content-Type': 'application/octet-stream' },
      body: sample,
      signal: controller.signal,
    });
    payload = (await res.json()) as ApiResponse;
  } catch {
    throw new IdentifyError(
      'Could not reach the server. Check your connection and try again.',
      'network',
    );
  } finally {
    clearTimeout(timer);
  }

  if (payload.kind !== 'ok' || !payload.track) {
    throw new IdentifyError(
      payload.message ?? 'Recognition failed.',
      (payload.kind as IdentifyErrorKind) ?? 'unknown',
    );
  }

  return payload.track;
}
