import type { Track } from '../types';

/**
 * Client for ACRCloud's audio identification API.
 *
 * The important part for this app is `play_offset_ms`: ACRCloud doesn't just
 * say *which* song it heard, it says *where in the song* the sample came from.
 * That single number is what makes syncing lyrics to a room possible at all —
 * without it we would know the track but have no idea where the needle is.
 */

export interface Credentials {
  /** e.g. identify-eu-west-1.acrcloud.com — no protocol, no trailing slash. */
  host: string;
  accessKey: string;
  accessSecret: string;
}

export type IdentifyErrorKind = 'nomatch' | 'auth' | 'quota' | 'network' | 'unknown';

export class IdentifyError extends Error {
  /* Assigned in the body rather than as a constructor parameter property:
     this project builds with `erasableSyntaxOnly`, which bans the shorthand
     because it is TypeScript syntax that emits real runtime code. */
  readonly kind: IdentifyErrorKind;

  constructor(message: string, kind: IdentifyErrorKind) {
    super(message);
    this.name = 'IdentifyError';
    this.kind = kind;
  }
}

/** Base64-encodes an ArrayBuffer. Safe here: an HMAC-SHA1 digest is 20 bytes. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Builds the request signature ACRCloud expects.
 *
 * The string to sign is a fixed, newline-joined recipe of the request's own
 * properties. Signing it with the secret proves we hold the secret without
 * ever transmitting it, and including the timestamp stops an intercepted
 * request being replayed later.
 *
 * Uses the browser's built-in Web Crypto, so there is no crypto dependency to
 * install. Note it requires a secure context — https, or localhost in dev.
 */
async function sign(
  creds: Credentials,
  timestamp: number,
  endpoint: string,
): Promise<string> {
  const stringToSign = [
    'POST',
    endpoint,
    creds.accessKey,
    'audio',
    '1', // signature_version
    String(timestamp),
  ].join('\n');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(creds.accessSecret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  return toBase64(digest);
}

/** Maps ACRCloud's numeric status codes onto something worth showing a human. */
function describeStatus(code: number, msg: string): IdentifyError {
  switch (code) {
    case 1001:
      return new IdentifyError('Heard the audio, but matched nothing.', 'nomatch');
    case 2004:
      return new IdentifyError(
        "Couldn't read the audio — try moving closer to the speaker.",
        'nomatch',
      );
    case 2005:
      return new IdentifyError('The recording timed out before it finished.', 'network');
    case 3001:
      return new IdentifyError('That access key was rejected. Check your keys.', 'auth');
    case 3002:
      return new IdentifyError('The request was malformed.', 'unknown');
    case 3003:
    case 3015:
      return new IdentifyError(
        "You've used up this month's free recognitions.",
        'quota',
      );
    case 3006:
    case 3014:
      // Verified against the live API: a wrong secret comes back as 3014, not
      // 3001, so it has to be handled or the user is told nothing useful.
      return new IdentifyError(
        'The signature was rejected — usually a mistyped secret key.',
        'auth',
      );
    default:
      return new IdentifyError(msg || `ACRCloud error ${code}.`, 'unknown');
  }
}

/** The subset of ACRCloud's response this app reads. */
interface AcrResponse {
  status?: { code?: number; msg?: string };
  metadata?: {
    music?: Array<{
      title?: string;
      artists?: Array<{ name?: string }>;
      album?: { name?: string };
      duration_ms?: number;
      play_offset_ms?: number;
      score?: number;
    }>;
  };
}

/**
 * Sends a recorded sample and returns the matched track.
 *
 * `offset` on the result is measured from the START of the sample we sent,
 * which is why the caller must remember when recording began — that timestamp
 * plus this offset is the anchor the whole lyric clock hangs off.
 */
export async function identify(
  creds: Credentials,
  sample: Blob,
  timeoutMs = 15000,
): Promise<Track> {
  const endpoint = '/v1/identify';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(creds, timestamp, endpoint);

  const form = new FormData();
  form.append('sample', sample, 'sample.wav');
  form.append('sample_bytes', String(sample.size));
  form.append('access_key', creds.accessKey);
  form.append('data_type', 'audio');
  form.append('signature_version', '1');
  form.append('signature', signature);
  form.append('timestamp', String(timestamp));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let payload: AcrResponse;
  try {
    const res = await fetch(`https://${creds.host}${endpoint}`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    payload = (await res.json()) as AcrResponse;
  } catch {
    throw new IdentifyError(
      "Couldn't reach ACRCloud. Check your connection and that the host is right.",
      'network',
    );
  } finally {
    clearTimeout(timer);
  }

  const code = payload.status?.code ?? -1;
  if (code !== 0) throw describeStatus(code, payload.status?.msg ?? '');

  const music = payload.metadata?.music?.[0];
  if (!music?.title) {
    throw new IdentifyError('Matched something, but it had no track details.', 'nomatch');
  }

  return {
    title: music.title,
    artist: music.artists?.map((a) => a.name).filter(Boolean).join(', ') || 'Unknown artist',
    album: music.album?.name,
    duration: music.duration_ms ? music.duration_ms / 1000 : undefined,
    offset: music.play_offset_ms ? music.play_offset_ms / 1000 : 0,
  };
}
