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

export interface LyricQuery {
  track: string;
  artist: string;
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

/**
 * Aborts a fetch that hangs. Without this a dead network leaves the app stuck
 * in its "fetching" phase forever with no way back.
 */
async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new LyricsError(`LRCLIB returned ${res.status}.`, 'network');
    return await res.json();
  } catch (err) {
    if (err instanceof LyricsError) throw err;
    // AbortError, DNS failure, offline, CORS — all the same to the user.
    throw new LyricsError('Could not reach the lyrics database.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `/get` endpoint wants an exact artist+track match and optionally a
 * duration, which it uses to disambiguate between different releases of the
 * same song. It is the most accurate route, so it is tried first.
 */
async function getExact(q: LyricQuery): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({
    track_name: q.track,
    artist_name: q.artist,
  });
  if (q.album) params.set('album_name', q.album);
  if (q.duration && Number.isFinite(q.duration)) {
    params.set('duration', String(Math.round(q.duration)));
  }
  const data = await getJson(`${BASE}/get?${params}`);
  return (data as LrclibRecord | null) ?? null;
}

/**
 * Falls back to a fuzzy search. Results are ranked so that anything with
 * synced lyrics wins, then by how close the duration is to the track we
 * actually heard — that is what separates a 3-minute radio edit from a
 * 7-minute album version of the same title.
 */
async function search(q: LyricQuery): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({
    track_name: q.track,
    artist_name: q.artist,
  });
  const data = await getJson(`${BASE}/search?${params}`);
  const results = Array.isArray(data) ? (data as LrclibRecord[]) : [];
  if (results.length === 0) return null;

  const scored = results
    .map((r) => {
      let score = 0;
      if (r.syncedLyrics) score += 1000; // synced beats everything else
      if (q.duration && r.duration) {
        // Penalise by how many seconds off the length is, capped so a wildly
        // wrong duration can still lose to a synced result.
        score -= Math.min(500, Math.abs(r.duration - q.duration) * 20);
      }
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0].r;
}

/**
 * Finds the best lyric record for a track.
 *
 * Throws a LyricsError describing exactly which way it failed, so the UI can
 * say "this song is instrumental" instead of a generic "something went wrong".
 */
export async function fetchLyrics(q: LyricQuery): Promise<LrclibRecord> {
  const record = (await getExact(q)) ?? (await search(q));

  if (!record) {
    throw new LyricsError('No lyrics filed for this track yet.', 'notfound');
  }
  if (record.instrumental) {
    throw new LyricsError('This track is marked instrumental.', 'instrumental');
  }
  if (!record.syncedLyrics && !record.plainLyrics) {
    throw new LyricsError('The entry exists but has no lyrics attached.', 'notfound');
  }
  return record;
}
