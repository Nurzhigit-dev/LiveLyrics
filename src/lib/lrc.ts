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
