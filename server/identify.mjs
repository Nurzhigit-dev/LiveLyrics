/**
 * Server-side track identification, shared by every host.
 *
 * This exists so that visitors never have to supply an API key. The secret
 * lives in a server environment variable, is read in the server process, and
 * never reaches the browser or the build output.
 *
 * Every platform adapter (the Vercel function, the Netlify function and the
 * dev-server middleware) is a thin shell around `respondToIdentify` and
 * `respondToHealth` below: they only differ in how they read a request body
 * and write a response, never in what they decide.
 *
 * Runs on plain Node 18+ and on edge runtimes alike: it only uses fetch,
 * FormData, Blob and Web Crypto, all of which are global in both.
 */

const ENDPOINT = '/v1/identify';

/** Hard ceiling so a client can't push an unbounded upload through us. */
export const MAX_BYTES = 2 * 1024 * 1024;

/** Anything smaller than this can't hold a usable second of audio. */
const MIN_BYTES = 1000;

/** How many of the recogniser's candidate matches are passed on. */
const MAX_CANDIDATES = 4;

/* ------------------------------------------------------------ configuration */

/**
 * Text that only ever appears in a value someone forgot to replace — the
 * `<your access key>` style of placeholder, or a copy that dragged its quotes
 * along with it. Real ACRCloud values never contain any of these.
 */
const PLACEHOLDER = /[<>"'`]|\byour[-_ ]|^(x{3,}|changeme|todo|none|null|undefined|placeholder)$/i;

/**
 * Reads the credentials the host injected and checks they are plausible.
 *
 * `problems` are fatal: the request is refused before it reaches ACRCloud, with
 * a message naming exactly what is wrong. `warnings` are only reported by the
 * health check — an unusual shape might still be a valid key, so it is not
 * worth blocking on.
 */
export function inspectConfig(env = process.env) {
  const host = (env.ACR_HOST ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const accessKey = (env.ACR_ACCESS_KEY ?? '').trim();
  const accessSecret = (env.ACR_ACCESS_SECRET ?? '').trim();

  const problems = [];
  const warnings = [];

  const missing = [
    ['ACR_HOST', host],
    ['ACR_ACCESS_KEY', accessKey],
    ['ACR_ACCESS_SECRET', accessSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) problems.push(`Missing ${missing.join(', ')}.`);

  for (const [name, value] of [
    ['ACR_HOST', host],
    ['ACR_ACCESS_KEY', accessKey],
    ['ACR_ACCESS_SECRET', accessSecret],
  ]) {
    if (!value) continue;
    if (PLACEHOLDER.test(value)) {
      problems.push(`${name} still holds placeholder text or quotes — paste the bare value from the ACRCloud console.`);
    } else if (/\s/.test(value)) {
      problems.push(`${name} contains a space, which a real value never does.`);
    }
  }

  if (host && !/^identify-[a-z0-9-]+\.acrcloud\.(com|cn)$/i.test(host)) {
    warnings.push('ACR_HOST does not look like a recognition host (expected e.g. identify-eu-west-1.acrcloud.com).');
  }
  if (accessKey && !/^[0-9a-f]{32}$/i.test(accessKey)) {
    warnings.push(`ACR_ACCESS_KEY is usually 32 hexadecimal characters; this one is ${accessKey.length} long.`);
  }
  if (accessSecret && accessSecret.length !== 40) {
    warnings.push(`ACR_ACCESS_SECRET is usually 40 characters; this one is ${accessSecret.length} long.`);
  }

  return {
    credentials: problems.length ? null : { host, accessKey, accessSecret },
    problems,
    warnings,
    host: host || null,
    accessKeyLength: accessKey.length,
    accessSecretLength: accessSecret.length,
  };
}

/** The credentials, or null when they are missing or obviously wrong. */
export function readCredentials(env = process.env) {
  return inspectConfig(env).credentials;
}

/* ---------------------------------------------------------------- recogniser */

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
 * A finite number, or null. `Number(null)` is 0, so a plain Number() check
 * would quietly turn a missing offset field into "the very start of the song".
 */
function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Length of a 16-bit PCM WAV in seconds, read from its header. */
function wavSeconds(audio) {
  try {
    const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
    if (bytes.length <= 44) return 0;
    const byteRate = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(28, true);
    return byteRate ? (bytes.length - 44) / byteRate : 0;
  } catch {
    return 0;
  }
}

/**
 * Where the song was at the START of the recording, in seconds.
 *
 * The recogniser reports which slice of the sample it matched and where that
 * slice sits in the reference track. The difference between the two is the
 * song position at the sample's first moment — which is exactly what the
 * lyric clock is anchored to.
 *
 * `play_offset_ms` is only a fallback, and it marks the END of the matched
 * audio (the "current position" from a live-monitoring point of view), not
 * the start. Treating it as the start puts the lyrics ahead by the length of
 * the recording.
 */
function startOffset(music, sampleSeconds, duration) {
  const dbBegin = num(music.db_begin_time_offset_ms);
  const sampleBegin = num(music.sample_begin_time_offset_ms);
  const sampleEnd = num(music.sample_end_time_offset_ms);
  const play = num(music.play_offset_ms);

  let ms;
  if (dbBegin !== null && sampleBegin !== null) ms = dbBegin - sampleBegin;
  else if (play !== null && sampleEnd !== null) ms = play - sampleEnd;
  else if (play !== null && sampleSeconds) ms = play - sampleSeconds * 1000;
  else ms = play ?? 0;

  const seconds = Math.max(0, ms / 1000);
  // A match claiming to sit past the end of the track isn't a usable position.
  return duration && seconds > duration ? 0 : seconds;
}

/** The alternative-language names the recogniser attaches, when it has them. */
function langNames(langs) {
  if (!Array.isArray(langs)) return [];
  return langs
    .map((l) => (typeof l?.name === 'string' ? l.name.trim() : ''))
    .filter(Boolean);
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * One recogniser result, normalised.
 *
 * The name variants matter more than they look. The recogniser and the lyric
 * database often write the same song differently — "Zemfira" against
 * "Земфира", a romanised Kazakh title against the Cyrillic original — and
 * ACRCloud frequently carries the other spelling in its `langs` fields. Passing
 * all of them on is what lets the lyric lookup find a match the primary title
 * alone would miss.
 */
function toCandidate(music, sampleSeconds) {
  const artists = unique((music.artists ?? []).map((a) => a?.name));
  const duration = num(music.duration_ms) !== null ? num(music.duration_ms) / 1000 : undefined;

  return {
    id: typeof music.acrid === 'string' ? music.acrid : undefined,
    title: music.title,
    artist: artists.join(', ') || 'Unknown artist',
    album: music.album?.name ?? undefined,
    duration,
    offset: startOffset(music, sampleSeconds, duration),
    score: num(music.score) ?? undefined,
    titleVariants: unique([music.title, ...langNames(music.langs)]),
    artistVariants: unique([
      artists[0],
      ...langNames(music.artists?.[0]?.langs),
      artists.join(', '),
      ...artists.slice(1),
    ]),
  };
}

/**
 * Sends a WAV sample to ACRCloud.
 *
 * Returns every candidate it offered (best first), not just the top one: the
 * extra entries are often the same recording listed under a different release
 * or in a different script, which the lyric lookup can use.
 *
 * @param {ArrayBuffer|Uint8Array} audio raw WAV bytes
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

  const sampleSeconds = wavSeconds(audio);
  const music = Array.isArray(payload?.metadata?.music) ? payload.metadata.music : [];
  const candidates = music
    .filter((m) => typeof m?.title === 'string' && m.title.trim())
    .slice(0, MAX_CANDIDATES)
    .map((m) => toCandidate(m, sampleSeconds));

  if (candidates.length === 0) {
    return { ok: false, kind: 'nomatch', message: 'Matched something with no track details.' };
  }

  return { ok: true, track: candidates[0], candidates };
}

/* ----------------------------------------------------------- HTTP decisions */

function reply(status, body, extraHeaders = {}) {
  return {
    status,
    body,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Never cache: a recognition is only true for the moment it was taken.
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  };
}

export function methodNotAllowed(allow) {
  return reply(405, { kind: 'unknown', message: `Use ${allow}.` }, { Allow: allow });
}

export function bodyFailure(err) {
  const tooLarge = err instanceof Error && err.message === 'too-large';
  return reply(tooLarge ? 413 : 400, {
    kind: 'unknown',
    message: tooLarge ? 'That recording was too large.' : 'Could not read the recording.',
  });
}

/**
 * Everything POST /api/identify decides, independent of the host.
 *
 * @param {Uint8Array|ArrayBuffer} audio the request body
 * @param {Record<string, string|undefined>} env where to read credentials from
 * @param {{ setupHint?: string }} [options] how to fix a missing config here
 */
export async function respondToIdentify(audio, env = process.env, options = {}) {
  const { credentials, problems } = inspectConfig(env);
  if (!credentials) {
    const hint =
      options.setupHint ??
      "Add them in the hosting dashboard's environment variables, then redeploy — a deployment only sees variables that existed when it was built.";
    return reply(503, { kind: 'unconfigured', message: `${problems.join(' ')} ${hint}` });
  }

  const size = audio?.byteLength ?? audio?.length ?? 0;
  if (size > MAX_BYTES) return bodyFailure(new Error('too-large'));
  if (size < MIN_BYTES) return reply(400, { kind: 'nomatch', message: 'That recording was empty.' });

  const result = await identify(audio, credentials);
  if (!result.ok) {
    // 200 for "no match": it is a normal outcome, not a transport failure.
    return reply(result.kind === 'nomatch' ? 200 : 502, { kind: result.kind, message: result.message });
  }
  return reply(200, { kind: 'ok', track: result.track, candidates: result.candidates });
}

/**
 * GET /api/health — is this deployment wired up?
 *
 * Reports only what is safe to show anyone: whether each variable is present,
 * its length, and the host (a public regional endpoint, not a secret). It
 * deliberately does NOT call ACRCloud, so hitting it repeatedly can't burn
 * through the monthly recognition quota.
 */
export function respondToHealth(env = process.env) {
  const report = inspectConfig(env);
  return reply(report.credentials ? 200 : 503, {
    configured: Boolean(report.credentials),
    problems: report.problems,
    warnings: report.warnings,
    host: report.host,
    accessKeyLength: report.accessKeyLength,
    accessSecretLength: report.accessSecretLength,
    // Which environment this deployment is — a variable set for "Production"
    // only is invisible to a Preview deployment, a very common mix-up.
    environment: env.VERCEL_ENV ?? env.CONTEXT ?? (env.NETLIFY ? 'netlify' : 'local'),
  });
}
