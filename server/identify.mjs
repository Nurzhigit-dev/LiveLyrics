/**
 * Server-side track identification.
 *
 * This exists so that visitors never have to supply an API key. The secret
 * lives in a server environment variable, is read in the server process, and
 * never reaches the browser or the build output.
 *
 * (An earlier version had each user paste their own keys into the page. That
 * kept the secret out of the repo, but it made the site unusable for anyone
 * who hadn't signed up for ACRCloud — which is everyone.)
 *
 * Runs on plain Node 18+ and on edge runtimes alike: it only uses fetch,
 * FormData, Blob and Web Crypto, all of which are global in both.
 */

const ENDPOINT = '/v1/identify';

/** Reads the credentials the host platform injected. */
export function readCredentials(env = process.env) {
  const host = (env.ACR_HOST ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const accessKey = (env.ACR_ACCESS_KEY ?? '').trim();
  const accessSecret = (env.ACR_ACCESS_SECRET ?? '').trim();
  if (!host || !accessKey || !accessSecret) return null;
  return { host, accessKey, accessSecret };
}

/**
 * Builds ACRCloud's request signature.
 *
 * The string to sign is a fixed newline-joined recipe of the request's own
 * properties. Signing it proves we hold the secret without transmitting it,
 * and the timestamp stops an intercepted request being replayed later.
 */
async function sign({ accessKey, accessSecret }, timestamp) {
  const stringToSign = ['POST', ENDPOINT, accessKey, 'audio', '1', String(timestamp)].join('\n');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(accessSecret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** ACRCloud status codes worth explaining differently to a human. */
function describe(code, msg) {
  switch (code) {
    case 1001: return { kind: 'nomatch', message: 'Heard the audio, but matched nothing.' };
    case 2004: return { kind: 'nomatch', message: "Couldn't read the audio — try moving closer to the speaker." };
    case 2005: return { kind: 'network', message: 'The recording timed out before it finished.' };
    case 3001: return { kind: 'auth', message: 'The server key was rejected.' };
    case 3003:
    case 3015: return { kind: 'quota', message: "This month's free recognitions are used up." };
    case 3006:
    case 3014: return { kind: 'auth', message: 'The server signature was rejected.' };
    default:   return { kind: 'unknown', message: msg || `Recogniser error ${code}.` };
  }
}

/**
 * Sends a WAV sample to ACRCloud and returns a normalised track.
 *
 * `offset` is the position in the song that the START of the sample came from.
 * It is the number the whole lyric clock hangs off.
 *
 * @param {ArrayBuffer|Uint8Array} audio raw WAV bytes
 * @returns {Promise<{ok: true, track: object} | {ok: false, kind: string, message: string}>}
 */
export async function identify(audio, credentials, timeoutMs = 15000) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(credentials, timestamp);

  const form = new FormData();
  form.append('sample', new Blob([audio], { type: 'audio/wav' }), 'sample.wav');
  form.append('sample_bytes', String(audio.byteLength ?? audio.length));
  form.append('access_key', credentials.accessKey);
  form.append('data_type', 'audio');
  form.append('signature_version', '1');
  form.append('signature', signature);
  form.append('timestamp', String(timestamp));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let payload;
  try {
    const res = await fetch(`https://${credentials.host}${ENDPOINT}`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    payload = await res.json();
  } catch {
    return { ok: false, kind: 'network', message: 'Could not reach the recogniser.' };
  } finally {
    clearTimeout(timer);
  }

  const code = payload?.status?.code ?? -1;
  if (code !== 0) return { ok: false, ...describe(code, payload?.status?.msg) };

  const music = payload?.metadata?.music?.[0];
  if (!music?.title) {
    return { ok: false, kind: 'nomatch', message: 'Matched something with no track details.' };
  }

  /*
   * Work out where the song was when RECORDING STARTED.
   *
   * play_offset_ms alone is not that. The recogniser reports which slice of
   * the submitted sample it actually matched (sample_begin_time_offset_ms)
   * and where that slice sits in the reference (db_begin_time_offset_ms). If
   * the first few seconds of the recording were too noisy to use, the match
   * begins partway through the sample — and treating its position as the
   * position at t=0 pushes the lyrics ahead by however much was skipped.
   *
   * Subtracting the sample-side offset converts it back to "position at the
   * start of the recording", which is what the clock is anchored to.
   */
  const dbBegin = Number(music.db_begin_time_offset_ms);
  const sampleBegin = Number(music.sample_begin_time_offset_ms);
  const playOffset = Number(music.play_offset_ms);

  let offsetMs;
  if (Number.isFinite(dbBegin) && Number.isFinite(sampleBegin)) {
    offsetMs = dbBegin - sampleBegin;
  } else if (Number.isFinite(playOffset) && Number.isFinite(sampleBegin)) {
    offsetMs = playOffset - sampleBegin;
  } else {
    offsetMs = Number.isFinite(playOffset) ? playOffset : 0;
  }

  const durationSec = music.duration_ms ? music.duration_ms / 1000 : undefined;
  let offset = Math.max(0, offsetMs / 1000);

  // A match that claims to sit past the end of the track is not a usable
  // position. Fall back to the start rather than dropping the listener into
  // a spot the song never reaches.
  if (durationSec && offset > durationSec) offset = 0;

  return {
    ok: true,
    track: {
      title: music.title,
      artist: music.artists?.map((a) => a.name).filter(Boolean).join(', ') || 'Unknown artist',
      album: music.album?.name ?? undefined,
      duration: durationSec,
      offset,
      /** How confident the recogniser was, 0-100. Surfaced so the UI can warn. */
      score: Number.isFinite(Number(music.score)) ? Number(music.score) : undefined,
    },
  };
}
