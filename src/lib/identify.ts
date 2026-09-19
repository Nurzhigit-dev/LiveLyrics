import type { Identification, Track } from '../types';

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
  candidates?: Track[];
}

export async function identify(
  sample: Blob,
  signal?: AbortSignal,
  timeoutMs = 20000,
): Promise<Identification> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

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
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new IdentifyError(
      'Could not reach the server. Check your connection and try again.',
      'network',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (payload.kind !== 'ok' || !payload.track) {
    throw new IdentifyError(
      payload.message ?? 'Recognition failed.',
      (payload.kind as IdentifyErrorKind) ?? 'unknown',
    );
  }

  // An older deployment may not send candidates; the top match is always one.
  const candidates = payload.candidates?.length ? payload.candidates : [payload.track];
  return { track: payload.track, candidates };
}
