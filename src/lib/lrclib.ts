import {
  cleanTitle,
  hasCyrillic,
  primaryArtist,
  similarity,
  swapScript,
  titleSimilarity,
  uniqueNames,
} from './translit';

/**
 * Client for LRCLIB (https://lrclib.net) — a community lyric database.
 *
 * Chosen because it is the one piece of this app that is free with no strings:
 * no API key, no account, no quota, and it serves time-synced LRC directly.
 * It is also CORS-open, so the browser can talk to it without a proxy.
 */

const BASE = 'https://lrclib.net/api';

/** The shape LRCLIB returns for a single record. */
export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** What we're looking for, with every spelling of it we know about. */
export interface LyricTarget {
  /** Most likely first. */
  titles: string[];
  artists: string[];
  album?: string;
  /** Track length in seconds, when the identifier reported one. */
  duration?: number;
}

export type LyricsErrorKind = 'notfound' | 'instrumental' | 'unsynced' | 'network';

/** Thrown for anything the caller should surface as a user-facing message. */
export class LyricsError extends Error {
  /* Assigned in the body, not as a constructor parameter property — this
     project builds with `erasableSyntaxOnly`, which bans that shorthand. */
  readonly kind: LyricsErrorKind;

  constructor(message: string, kind: LyricsErrorKind) {
    super(message);
    this.name = 'LyricsError';
    this.kind = kind;
  }
}

/** A result this good from the first round is taken without searching further. */
const GOOD_ENOUGH = 0.8;

/** Longest we'll wait when LRCLIB asks us to slow down. */
const MAX_BACKOFF_MS = 3000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    }, { once: true });
  });

/**
 * One request, with a timeout and a single polite retry when throttled.
 *
 * The retry matters more than it looks. LRCLIB rate-limits bursts, and a
 * lookup fires several searches at once. Without it, a throttled search
 * quietly contributed no results — and a song whose lyrics were sitting right
 * there got reported as having none.
 */
async function getJson(url: string, signal?: AbortSignal, timeoutMs = 8000): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (res.status === 404) return null;
      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        const hinted = Number(res.headers.get('Retry-After')) * 1000;
        await sleep(Math.min(MAX_BACKOFF_MS, hinted > 0 ? hinted : 900 + Math.random() * 600), signal);
        continue;
      }
      if (!res.ok) throw new LyricsError(`LRCLIB returned ${res.status}.`, 'network');
      return await res.json();
    } catch (err) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (err instanceof LyricsError) throw err;
      // Timeout, DNS failure, offline, CORS — all the same to the user.
      throw new LyricsError('Could not reach the lyrics database.', 'network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

/** The exact-signature endpoint. The most precise route when the names line up. */
async function getExact(
  track: string, artist: string, album: string | undefined, duration: number | undefined,
  signal?: AbortSignal,
): Promise<LrclibRecord[]> {
  const params = new URLSearchParams({ track_name: track, artist_name: artist });
  if (album) params.set('album_name', album);
  if (duration && Number.isFinite(duration)) params.set('duration', String(Math.round(duration)));
  const data = await getJson(`${BASE}/get?${params}`, signal);
  return data ? [data as LrclibRecord] : [];
}

type SearchParams = { q: string } | { track_name: string; artist_name: string };

async function search(params: SearchParams, signal?: AbortSignal): Promise<LrclibRecord[]> {
  const data = await getJson(`${BASE}/search?${new URLSearchParams(params)}`, signal);
  return Array.isArray(data) ? (data as LrclibRecord[]) : [];
}

/** Every spelling of the title worth comparing against: original, cleaned, other script. */
function titleForms(titles: string[]): string[] {
  const base = uniqueNames(titles.flatMap((t) => [t, cleanTitle(t)]));
  return uniqueNames([...base, ...base.map((t) => swapScript(cleanTitle(t)))]);
}

function artistForms(artists: string[]): string[] {
  const base = uniqueNames(artists.flatMap((a) => [primaryArtist(a), a]));
  return uniqueNames([...base, ...base.map((a) => swapScript(primaryArtist(a)))]);
}

/** A title has to be this close before a record is considered at all. */
const MIN_TITLE = 0.78;
/** And the performer has to match too, in whatever script. */
const MIN_ARTIST = 0.6;
/** Beyond this many seconds apart, it is a different recording. */
const MAX_DURATION_DRIFT = 10;

/**
 * How well one LRCLIB record fits what we heard, or -1 to reject it outright.
 *
 * The thresholds are deliberately strict. A search by title alone also returns
 * every other song with that title, and short common titles — "Любовь",
 * "Мама", "Ночь" — have dozens. An earlier version let one through whenever
 * its length happened to land within three seconds of ours, which is close to
 * a coin flip among pop songs, and produced confident lyrics for entirely the
 * wrong song. Now the performer has to match as well, in any script.
 *
 * Duration still carries weight, because it is what separates a radio edit
 * from an album version of the same song — and the wrong one's timings would
 * be off for the whole track.
 */
function score(r: LrclibRecord, titles: string[], artists: string[], duration?: number): number {
  const t = Math.max(0, ...titles.map((x) => titleSimilarity(r.trackName ?? '', x)));
  const a = Math.max(0, ...artists.map((x) => Math.max(
    similarity(r.artistName ?? '', x),
    similarity(primaryArtist(r.artistName ?? ''), x),
  )));
  const delta = duration && r.duration ? Math.abs(r.duration - duration) : null;

  if (t < MIN_TITLE || a < MIN_ARTIST) return -1;
  if (delta !== null && delta > MAX_DURATION_DRIFT) return -1;

  const d = delta === null ? 0.5 : delta <= 2 ? 1 : delta <= 5 ? 0.6 : 0.25;
  return 0.4 * t + 0.35 * a + 0.25 * d
    + (r.syncedLyrics ? 0.2 : 0)
    + (r.plainLyrics ? 0.02 : 0)
    - (r.instrumental ? 0.3 : 0);
}

function pickBest(pool: LrclibRecord[], titles: string[], artists: string[], duration?: number) {
  let best: { record: LrclibRecord; score: number } | null = null;
  const seen = new Set<number>();
  for (const record of pool) {
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    const s = score(record, titles, artists, duration);
    if (s >= 0 && (!best || s > best.score)) best = { record, score: s };
  }
  return best;
}

/** Runs requests together; a failed one simply contributes no results. */
async function gather(requests: Array<Promise<LrclibRecord[]>>) {
  const settled = await Promise.allSettled(requests);
  const records = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const aborted = settled.find(
    (s) => s.status === 'rejected' && s.reason instanceof DOMException && s.reason.name === 'AbortError',
  );
  if (aborted) throw (aborted as PromiseRejectedResult).reason;
  const allFailed = settled.length > 0 && settled.every((s) => s.status === 'rejected');
  return { records, allFailed };
}

/**
 * Finds the best lyric record for a track.
 *
 * Two rounds, so the common case stays cheap:
 *
 *  1. The exact signature plus a straight search under the names we were
 *     given. Most songs are settled here in one round trip.
 *  2. Only if that found nothing convincing: search again in the other
 *     script, by cleaned title alone, and by artist + title as free text.
 *     This is the round that finds Cyrillic-filed lyrics for a
 *     Latin-identified song, and vice versa.
 *
 * Throws a LyricsError describing exactly which way it failed, so the UI can
 * say "this song is instrumental" instead of a generic "something went wrong".
 */
export async function findLyrics(target: LyricTarget, signal?: AbortSignal): Promise<LrclibRecord> {
  const titles = titleForms(target.titles);
  const artists = artistForms(target.artists);
  if (titles.length === 0) throw new LyricsError('No lyrics filed for this track yet.', 'notfound');

  const title = titles[0];
  const artist = artists[0] ?? '';
  const cleaned = cleanTitle(title);

  // Round 1.
  const first = await gather([
    getExact(title, artist, target.album, target.duration, signal),
    search({ track_name: cleaned, artist_name: artist }, signal),
    search({ q: `${artist} ${cleaned}`.trim() }, signal),
  ]);

  let best = pickBest(first.records, titles, artists, target.duration);

  // Round 2, only when round 1 wasn't convincing.
  if (!best || best.score < GOOD_ENOUGH || !best.record.syncedLyrics) {
    const otherTitle = titles.find((t) => hasCyrillic(t) !== hasCyrillic(title));
    const otherArtist = artists.find((a) => hasCyrillic(a) !== hasCyrillic(artist));
    const plans: SearchParams[] = [{ q: cleaned }];
    if (otherTitle) {
      plans.push({ track_name: cleanTitle(otherTitle), artist_name: otherArtist ?? artist });
      plans.push({ q: cleanTitle(otherTitle) });
    }
    if (otherArtist) plans.push({ q: `${otherArtist} ${cleanTitle(otherTitle ?? title)}` });

    const second = await gather(plans.map((p) => search(p, signal)));
    best = pickBest([...first.records, ...second.records], titles, artists, target.duration);

    if (!best && first.allFailed && second.allFailed) {
      throw new LyricsError('Could not reach the lyrics database.', 'network');
    }
  }

  if (!best) throw new LyricsError('No lyrics filed for this track yet.', 'notfound');
  if (best.record.instrumental) throw new LyricsError('This track is marked instrumental.', 'instrumental');
  if (!best.record.syncedLyrics && !best.record.plainLyrics) {
    throw new LyricsError('The entry exists but has no lyrics attached.', 'notfound');
  }
  return best.record;
}
