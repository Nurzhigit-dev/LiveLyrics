import type { LyricLine } from '../types';

/**
 * Parser for the LRC lyric format.
 *
 * An LRC file is plain text where each line is prefixed with one or more
 * timestamps:
 *
 *   [ti:Song Title]
 *   [offset:-300]
 *   [00:12.35]first line
 *   [00:16.02][01:44.10]a line that recurs in the chorus
 *
 * Timestamps are [minutes:seconds.hundredths]. A line can carry several of
 * them when the same words repeat, so one source line can produce several
 * entries in the output.
 */

/** Matches a single [mm:ss.xx] tag. The fractional part is optional. */
const TIME_TAG = /\[(\d{1,4}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;

/** Matches metadata tags like [ar:...] that carry no timing. */
const META_TAG = /^\[([a-z_]+):(.*)\]$/i;

export interface ParsedLrc {
  lines: LyricLine[];
  /** Global shift in seconds declared by an [offset:] tag, already applied. */
  offset: number;
  /** Any [ti:] / [ar:] style tags found, keyed lowercase. */
  meta: Record<string, string>;
}

/**
 * Turns LRC text into a time-sorted list of lines.
 *
 * Returns an empty list rather than throwing if the input isn't valid LRC —
 * a malformed lyric file should degrade to "no lyrics", never crash the app.
 */
export function parseLrc(source: string): ParsedLrc {
  const lines: LyricLine[] = [];
  const meta: Record<string, string> = {};
  let offset = 0;

  if (!source) return { lines, offset, meta };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // Collect every timestamp on this line before touching the text.
    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      // A 2-digit fraction is hundredths, a 3-digit one is thousandths, so
      // divide by 10^(number of digits) rather than assuming either.
      const fracRaw = match[3] ?? '';
      const fraction = fracRaw ? Number(fracRaw) / 10 ** fracRaw.length : 0;
      times.push(minutes * 60 + seconds + fraction);
    }

    if (times.length === 0) {
      // No timestamps: this is either a metadata tag or junk.
      const m = META_TAG.exec(line);
      if (m) {
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'offset') {
          // Spec: a positive offset means the lyrics should appear EARLIER,
          // so it gets subtracted from every timestamp below.
          const ms = Number(value);
          if (Number.isFinite(ms)) offset = ms / 1000;
        } else {
          meta[key] = value;
        }
      }
      continue;
    }

    // Whatever follows the last timestamp is the lyric text itself.
    const text = line.slice(line.lastIndexOf(']') + 1).trim();
    for (const time of times) lines.push({ time, text });
  }

  // Apply the global offset, clamp away negatives, then order by time.
  // LRC files are usually sorted already, but repeated-chorus timestamps
  // are appended out of order by the loop above.
  for (const line of lines) line.time = Math.max(0, line.time - offset);
  lines.sort((a, b) => a.time - b.time);

  return { lines, offset, meta };
}

/**
 * Index of the line that should be highlighted at `time` seconds.
 * Returns -1 when the song hasn't reached the first line yet.
 *
 * Binary search rather than a linear scan: this is called on every animation
 * frame and a long song can carry several hundred lines.
 */
export function findActiveIndex(lines: LyricLine[], time: number): number {
  if (lines.length === 0 || time < lines[0].time) return -1;

  let low = 0;
  let high = lines.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** Assumed length of the final line, which has no following timestamp. */
const LAST_LINE_SECONDS = 4;

/** A typical sung pace, used until a song has enough lines to measure its own. */
const DEFAULT_SECONDS_PER_CHAR = 0.11;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How long each line is actually SUNG for, in seconds.
 *
 * LRC only records when a line starts. The obvious assumption — that a line
 * lasts until the next one begins — is badly wrong whenever an instrumental
 * break follows it: the word-by-word highlight would crawl across the whole
 * break, lighting words up long after they had been sung. That was a large
 * part of the lyrics feeling "a little off" even when the line timing was
 * right.
 *
 * Instead this learns each song's own pace. For lines that run straight into
 * the next, the gap IS the sung length, which gives a seconds-per-character
 * rate. The median of those rates is the tempo of this particular song — quick
 * for rap, slow for a ballad — and each line's sung length is estimated from
 * its own character count at that pace, never running past the real gap.
 */
export function computeSungSpans(lines: LyricLine[]): number[] {
  const gaps = lines.map((line, i) =>
    Math.max(0.2, (lines[i + 1]?.time ?? line.time + LAST_LINE_SECONDS) - line.time),
  );
  const chars = lines.map((line) => line.text.replace(/\s+/g, '').length);

  // Median resists the minority of lines that are followed by a break.
  const rates = lines
    .map((_, i) => (chars[i] >= 6 && gaps[i] > 0.4 && gaps[i] < 12 ? gaps[i] / chars[i] : NaN))
    .filter(Number.isFinite);
  const perChar = rates.length >= 4 ? median(rates) : DEFAULT_SECONDS_PER_CHAR;

  return lines.map((_, i) => {
    if (!chars[i]) return gaps[i];                       // an instrumental marker
    const estimate = Math.max(0.6, chars[i] * perChar * 1.12);
    return Math.min(gaps[i] * 0.94, estimate);
  });
}
