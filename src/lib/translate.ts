import { hasCyrillic } from './translit';

/**
 * Translation for the study view: whole lyric lines, and single words.
 *
 * Both providers are called straight from the browser, never through this
 * app's own server. That is deliberate. These services meter by IP address,
 * so a proxy would pool every visitor into one bucket and the first person to
 * open the site would spend the day's allowance for everybody. Called from
 * the page, each visitor spends only their own — and, as with the rest of the
 * app, nobody needs an account or a key.
 *
 *   1. Google's `translate_a` endpoint. Best quality, no practical limit, and
 *      for a single word it returns a real dictionary: parts of speech with
 *      several senses each. It is undocumented, so it may change or start
 *      refusing requests one day, which is exactly why there is a second one.
 *   2. MyMemory, which is documented and has a published free tier, but meters
 *      at roughly 5,000 characters a day per address and knows nothing about
 *      parts of speech.
 *
 * Everything translated is cached in the browser, so a chorus costs one
 * translation however many times it comes round, and a song you play again
 * tomorrow costs nothing at all.
 */

export type Lang = 'en' | 'ru' | 'kk';

/** What the listener asked for. English is the language being studied. */
export type TargetLang = 'ru' | 'kk';

export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  ru: 'Русский',
  kk: 'Qazaqşa',
};

export type TranslateErrorKind = 'quota' | 'network';

export class TranslateError extends Error {
  readonly kind: TranslateErrorKind;

  constructor(message: string, kind: TranslateErrorKind) {
    super(message);
    this.name = 'TranslateError';
    this.kind = kind;
  }
}

/** One part of speech, with the senses listed under it. */
export interface WordSense {
  /** 'noun', 'verb', … as the dictionary reports it. Absent when unknown. */
  pos?: string;
  /** Meanings, best first. */
  meanings: string[];
}

export interface WordEntry {
  word: string;
  /** The single best translation — always present. */
  primary: string;
  /** Grouped senses, when the provider knows any. */
  senses: WordSense[];
}

/**
 * Letters Kazakh has and Russian does not.
 *
 * Knowing the lyrics are Cyrillic is not enough — it says which alphabet, not
 * which language, and sending a Kazakh song to a Russian translator does not
 * fail, it transliterates. "Күте тұр мені" came back as "Go to the menu",
 * confidently and completely wrong. These nine letters settle it: none of them
 * exists in Russian, and Kazakh can barely write a line without one.
 */
const KAZAKH_ONLY = /[әғқңөұүһі]/i;

/** The language the lyrics are in, as far as the alphabet can tell. */
function detectSource(sample: string): Lang {
  if (KAZAKH_ONLY.test(sample)) return 'kk';
  return hasCyrillic(sample) ? 'ru' : 'en';
}

/**
 * Which way round to translate.
 *
 * The feature exists to make English songs readable, so English goes to
 * whichever language was picked. Pointing it at a song already in that
 * language would otherwise translate it into itself, so those go to English
 * instead — and a Kazakh song read in Russian, or the other way round, is a
 * real pair worth keeping rather than a case to fall back from.
 */
export function pickPair(sample: string, target: TargetLang): { from: Lang; to: Lang } {
  const from = detectSource(sample);
  if (from === 'en') return { from, to: target };
  return { from, to: from === target ? 'en' : target };
}

/* --------------------------------------------------------------------------
 * Cache
 *
 * Held in memory for the session and mirrored to localStorage, so the words of
 * a song you played yesterday cost nothing today. Every access is wrapped:
 * storage is unavailable in a private window and throws when full, and a
 * translation failing to be remembered must never break the page.
 * ----------------------------------------------------------------------- */

const LINE_STORE = 'livelyrics.translations.v2';
const WORD_STORE = 'livelyrics.words.v2';
/** Enough for a few hundred songs; beyond this the oldest entries are dropped. */
const MAX_ENTRIES = 1500;

function loadStore<T>(key: string): Map<string, T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Map(parsed as Array<[string, T]>) : new Map();
  } catch {
    return new Map();
  }
}

function makeStore<T>(key: string) {
  const map = loadStore<T>(key);
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Batched, because a whole song is cached line by line in one burst and
  // serialising after each one would stringify the entire store 40 times.
  const flush = () => {
    timer = null;
    try {
      // Map keeps insertion order, so the tail is what was used most recently.
      const entries = [...map.entries()].slice(-MAX_ENTRIES);
      localStorage.setItem(key, JSON.stringify(entries));
    } catch {
      // Full, or storage is blocked. The in-memory cache still works.
    }
  };

  return {
    get: (k: string) => map.get(k),
    has: (k: string) => map.has(k),
    set: (k: string, v: T) => {
      map.set(k, v);
      if (!timer) timer = setTimeout(flush, 1200);
    },
  };
}

let lineCache: ReturnType<typeof makeStore<string>> | null = null;
let wordCache: ReturnType<typeof makeStore<WordEntry>> | null = null;

const lines = () => (lineCache ??= makeStore<string>(LINE_STORE));
const words = () => (wordCache ??= makeStore<WordEntry>(WORD_STORE));

/** Cache key. The pair is part of it: the same line has two translations. */
const keyFor = (from: Lang, to: Lang, text: string) => `${from}>${to}\u0000${text}`;

/* --------------------------------------------------------------------------
 * Requests
 * ----------------------------------------------------------------------- */

const TIMEOUT_MS = 9000;

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new TranslateError(`Translator returned ${res.status}.`, 'network');
    return await res.json();
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (err instanceof TranslateError) throw err;
    throw new TranslateError('Could not reach the translator.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* ---- provider 1: translate_a -------------------------------------------- */

const GTX = 'https://translate.googleapis.com/translate_a/single';

/** `dt=t` asks for the translation; `dt=bd` adds the dictionary for a word. */
function gtxUrl(text: string, from: Lang, to: Lang, dictionary: boolean): string {
  const dt = dictionary ? 'dt=t&dt=bd' : 'dt=t';
  return `${GTX}?client=gtx&sl=${from}&tl=${to}&${dt}&q=${encodeURIComponent(text)}`;
}

/**
 * The response is positional, untyped JSON. `data[0]` is the translation split
 * into sentence-sized chunks, which are concatenated back together —
 * importantly, keeping the newlines that separate one lyric line from the next.
 */
function gtxText(data: unknown): string {
  const chunks = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
  return chunks
    .map((c) => (Array.isArray(c) && typeof c[0] === 'string' ? c[0] : ''))
    .join('')
    .trim();
}

/** `data[1]` is the dictionary: one entry per part of speech. */
function gtxSenses(data: unknown): WordSense[] {
  const entries = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  const out: WordSense[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry)) continue;
    const pos = typeof entry[0] === 'string' ? entry[0] : undefined;
    const meanings = (Array.isArray(entry[1]) ? entry[1] : [])
      .filter((m): m is string => typeof m === 'string')
      .slice(0, 5);
    if (meanings.length) out.push({ pos, meanings });
  }
  return out.slice(0, 4);
}

/* ---- provider 2: MyMemory ------------------------------------------------ */

const MYMEMORY = 'https://api.mymemory.translated.net/get';

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  quotaFinished?: boolean;
}

async function viaMyMemory(text: string, from: Lang, to: Lang, signal?: AbortSignal): Promise<string> {
  const url = `${MYMEMORY}?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const data = (await getJson(url, signal)) as MyMemoryResponse;
  const out = data.responseData?.translatedText ?? '';

  // The daily allowance is reported in the translated text itself rather than
  // as an error, so it has to be recognised here or it would be shown to the
  // listener as though it were the translation.
  if (data.quotaFinished || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) {
    throw new TranslateError('The free translation allowance for today is used up.', 'quota');
  }
  if (Number(data.responseStatus) !== 200 || !out) {
    throw new TranslateError('The translator had nothing to say for that.', 'network');
  }
  return out.trim();
}

/* --------------------------------------------------------------------------
 * Lines
 * ----------------------------------------------------------------------- */

/**
 * Lines are sent together, joined by newlines, and come back the same way.
 *
 * A whole song is one or two requests instead of forty, which is the
 * difference between the study view being instant and it trickling in. The
 * count is checked on the way back: a translator is free to merge two
 * sentences into one, and a silent off-by-one would put every remaining line
 * against the wrong words. If the shape doesn't survive the round trip the
 * batch is redone one line at a time, which always lines up.
 */
const BATCH_CHARS = 900;
const BATCH_LINES = 20;

function chunk(texts: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const text of texts) {
    if (current.length && (size + text.length > BATCH_CHARS || current.length >= BATCH_LINES)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += text.length + 1;
  }
  if (current.length) out.push(current);
  return out;
}

async function batchViaGtx(batch: string[], from: Lang, to: Lang, signal?: AbortSignal) {
  const data = await getJson(gtxUrl(batch.join('\n'), from, to, false), signal);
  const parts = gtxText(data).split('\n').map((s) => s.trim());
  return parts.length === batch.length ? parts : null;
}

/**
 * Translates a set of lines, returning a map from the original text.
 *
 * Keyed by text rather than by index on purpose: a chorus that comes round
 * four times is one entry, translated once.
 */
export async function translateLines(
  texts: string[],
  from: Lang,
  to: Lang,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (from === to) return out;

  const wanted: string[] = [];
  for (const text of texts) {
    const clean = text.trim();
    if (!clean || out.has(clean) || wanted.includes(clean)) continue;
    const cached = lines().get(keyFor(from, to, clean));
    if (cached !== undefined) out.set(clean, cached);
    else wanted.push(clean);
  }
  if (wanted.length === 0) return out;

  const remember = (source: string, translated: string) => {
    // A translator that hands back the input unchanged has told us nothing;
    // caching that would hide a good translation from a later attempt.
    const value = translated && translated !== source ? translated : '';
    if (value) {
      out.set(source, value);
      lines().set(keyFor(from, to, source), value);
    }
  };

  let quota: TranslateError | null = null;

  for (const batch of chunk(wanted)) {
    let done = false;
    try {
      const parts = await batchViaGtx(batch, from, to, signal);
      if (parts) {
        batch.forEach((source, i) => remember(source, parts[i]));
        done = true;
      }
    } catch (err) {
      if (err instanceof DOMException) throw err;
    }

    // Either the batch failed outright, or it came back a different shape.
    // One line at a time is slower but cannot be misaligned.
    if (done) continue;
    for (const source of batch) {
      try {
        const data = await getJson(gtxUrl(source, from, to, false), signal);
        remember(source, gtxText(data));
      } catch (first) {
        if (first instanceof DOMException) throw first;
        try {
          remember(source, await viaMyMemory(source, from, to, signal));
        } catch (second) {
          if (second instanceof DOMException) throw second;
          if (second instanceof TranslateError && second.kind === 'quota') {
            // Nothing else will succeed today; stop spending requests on it.
            quota = second;
            break;
          }
        }
      }
    }
    if (quota) break;
  }

  // Only a complete failure is worth reporting. A batch that produced some
  // lines is more useful on screen than an error instead of all of them.
  if (out.size === 0 && quota) throw quota;
  if (out.size === 0) throw new TranslateError('Could not reach the translator.', 'network');
  return out;
}

/* --------------------------------------------------------------------------
 * Words
 * ----------------------------------------------------------------------- */

/**
 * Strips the punctuation a lyric line carries so the word can be looked up.
 * Inner apostrophes and hyphens stay: "don't" and "self-made" are one word.
 */
export function cleanWord(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim();
}

/** One word, with as much of a dictionary entry as the provider will give. */
export async function lookupWord(
  raw: string,
  from: Lang,
  to: Lang,
  signal?: AbortSignal,
): Promise<WordEntry> {
  const word = cleanWord(raw);
  if (!word) throw new TranslateError('There is no word there to look up.', 'network');

  const key = keyFor(from, to, `\u0001${word.toLowerCase()}`);
  const cached = words().get(key);
  if (cached) return cached;

  let entry: WordEntry | null = null;
  try {
    const data = await getJson(gtxUrl(word, from, to, true), signal);
    const primary = gtxText(data);
    if (primary) entry = { word, primary, senses: gtxSenses(data) };
  } catch (err) {
    if (err instanceof DOMException) throw err;
  }

  if (!entry) {
    // No dictionary from this one, but a translation is most of the value.
    entry = { word, primary: await viaMyMemory(word, from, to, signal), senses: [] };
  }

  words().set(key, entry);
  return entry;
}
