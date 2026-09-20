/**
 * English definitions from Wiktionary, for the word card.
 *
 * A translation tells you what a word means *here*; a definition tells you
 * what it means anywhere, which is the part that actually teaches the
 * language. Wiktionary's REST API is free, needs no key, is open to the
 * browser, and is run by the Wikimedia Foundation rather than by someone's
 * side project, so it is the one piece of this feature unlikely to disappear.
 *
 * It is always best-effort. The word card shows the translation as soon as it
 * has one; a definition is added underneath if and when it arrives.
 */

const BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition';

const TIMEOUT_MS = 7000;

export interface Definition {
  /** 'Noun', 'Verb', … as Wiktionary files it. */
  partOfSpeech: string;
  /** One sentence, plain text. */
  sense: string;
  /** A usage example, when there is one. */
  example?: string;
  /** Set when this defines the base word rather than the one that was tapped:
   *  tapping "hid" is answered with "hide", and the card says so. */
  lemma?: string;
}

/**
 * Wiktionary returns definitions as HTML fragments full of wiki links.
 *
 * They are reduced to plain text rather than rendered: this is text fetched
 * from a third party and handed to the UI, and the UI must never be asked to
 * trust it. React escapes what it renders anyway, so stripping here is about
 * legibility — but the two together mean no markup from this response can
 * reach the page under any circumstances.
 */
function toText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

interface WiktionaryEntry {
  partOfSpeech?: string;
  language?: string;
  definitions?: Array<{ definition?: string; examples?: string[] }>;
}

/** How many senses are worth showing before the card becomes an essay.
 *  Two, because the translations above them already carry several meanings
 *  each — these are here to explain the word, not to catalogue it. */
const MAX_SENSES = 2;

/** How many to read before choosing those two. */
const GATHER = 10;

/**
 * "simple past of hide", "plural of sheet" — an entry that only forwards.
 *
 * Songs are full of inflected words, and for every one of them Wiktionary's
 * own entry says nothing except which word to look at instead. Left alone,
 * tapping "hid" answered "simple past of hide" and stopped there, which is
 * the one thing a reader who tapped it already suspected. So when an entry
 * opens by pointing somewhere else, the pointer is followed.
 */
const FORM_OF =
  /^[a-z- ]*?\b(?:simple past|past participle|present participle|gerund|plural|singular|comparative|superlative|inflection|alternative (?:form|spelling)|third-person singular[a-z- ]*)\s+(?:and [a-z- ]+\s+)?of\s+([\p{L}'’-]+)/iu;

/**
 * Definitions for one English word, or an empty list when there are none.
 *
 * Never throws for an ordinary miss: a word not being in Wiktionary — a name,
 * a piece of slang, a word sung as it is spoken — is completely normal in a
 * song, and is not something to report as an error.
 */
export async function defineWord(word: string, signal?: AbortSignal): Promise<Definition[]> {
  const senses = await fetchDefinitions(word, signal);

  // The FIRST sense decides. A word whose entry opens with a real definition
  // is a word in its own right, however many inflected readings follow it
  // ("borrowed" is an adjective before it is a past tense); one that opens by
  // forwarding is an inflected form and nothing else.
  const first = senses[0];
  const lemma = first ? FORM_OF.exec(first.sense)?.[1]?.toLowerCase() : undefined;
  if (!lemma || lemma === word.trim().toLowerCase()) return senses.slice(0, MAX_SENSES);

  // One hop only. Two words pointing at each other would otherwise be a loop,
  // and a second redirect never carries information the first one didn't.
  const base = await fetchDefinitions(lemma, signal);
  if (base.length === 0) return senses.slice(0, MAX_SENSES);

  /* Keep the part of speech the pointer came from. "wished" forwards from the
     verb, but Wiktionary files the noun "wish" first, so without this the
     answer to a past-tense verb was a definition of a noun. */
  const wanted = first?.partOfSpeech;
  const ranked = wanted
    ? [...base].sort((a, b) => Number(b.partOfSpeech === wanted) - Number(a.partOfSpeech === wanted))
    : base;

  return ranked.slice(0, MAX_SENSES).map((d) => ({ ...d, lemma }));
}

async function fetchDefinitions(word: string, signal?: AbortSignal): Promise<Definition[]> {
  const term = word.trim().toLowerCase();
  if (!term) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(term)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as Record<string, WiktionaryEntry[]>;
    // Keyed by language code; only the English section is wanted, and a word
    // that exists solely in another language is not an English word.
    const entries = Array.isArray(data.en) ? data.en : [];

    const out: Definition[] = [];
    for (const entry of entries) {
      if (entry.language && entry.language !== 'English') continue;
      for (const sense of entry.definitions ?? []) {
        const text = toText(sense.definition ?? '');
        // Wiktionary carries bare form-of stubs and empty shells; neither
        // teaches anything on a card this small.
        if (text.length < 3) continue;
        out.push({
          partOfSpeech: entry.partOfSpeech ?? '',
          sense: text,
          example: sense.examples?.length ? toText(sense.examples[0]) : undefined,
        });
        if (out.length >= GATHER) return out;
      }
    }
    return out;
  } catch {
    // Offline, blocked, timed out. The card simply shows no definition.
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
