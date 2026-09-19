/**
 * Script conversion and fuzzy name matching.
 *
 * The recogniser and the lyric database regularly disagree about how a song's
 * name is WRITTEN, even when they agree completely on which song it is:
 *
 *   ACRCloud says "Zemfira — Iskala"   LRCLIB files it as "Земфира — Искала"
 *   ACRCloud says "Кайрат Нуртас"      LRCLIB files it as "Kairat Nurtas"
 *
 * An exact-string lookup misses every one of those, which made Russian and
 * Kazakh songs look unrecognised when they had in fact been identified fine.
 * This module lets the lookup search in the other script, and compare names
 * in a script-neutral form so the right result can be picked out.
 */

/** Cyrillic → Latin. Russian, plus the extra letters of Kazakh and Ukrainian. */
const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Kazakh
  ә: 'a', ғ: 'g', қ: 'k', ң: 'ng', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
  // Ukrainian / Belarusian, which turn up in the same catalogues
  є: 'ye', ї: 'yi', ґ: 'g', ў: 'u',
};

/**
 * Latin → Cyrillic, longest sequence first.
 *
 * Romanisation throws information away (the soft sign, for one), so this can
 * never be exact — "Olga" comes back as "Олга", not "Ольга". It only has to be
 * close enough to hit the database's search, and names built from plain
 * letters ("Zemfira", "Kino", "Leningrad", "Iskala") convert exactly.
 */
const LAT_TO_CYR: Array<[string, string]> = [
  ['shch', 'щ'], ['sch', 'щ'],
  ['yo', 'ё'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е'],
  ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['tz', 'ц'], ['ch', 'ч'], ['sh', 'ш'],
  ['iy', 'ий'], ['yy', 'ый'], ['ey', 'ей'], ['ay', 'ай'], ['oy', 'ой'], ['uy', 'уй'],
  ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'], ['f', 'ф'],
  ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'дж'], ['k', 'к'], ['l', 'л'],
  ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'],
  ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['w', 'в'], ['x', 'кс'],
  ['y', 'ы'], ['z', 'з'],
];

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[a-z]/i;

export function hasCyrillic(s: string): boolean {
  return CYRILLIC.test(s);
}

export function hasLatin(s: string): boolean {
  return LATIN.test(s);
}

/** Keeps the case of the source letter on its replacement. */
function withCase(source: string, replacement: string): string {
  if (!replacement || source === source.toLowerCase()) return replacement;
  return replacement[0].toUpperCase() + replacement.slice(1);
}

export function toLatin(s: string): string {
  let out = '';
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const mapped = CYR_TO_LAT[lower];
    out += mapped === undefined ? ch : withCase(ch, mapped);
  }
  return out;
}

export function toCyrillic(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [lat, cyr] of LAT_TO_CYR) {
      if (s.substr(i, lat.length).toLowerCase() === lat) {
        out += withCase(s[i], cyr);
        i += lat.length;
        matched = true;
        break;
      }
    }
    if (!matched) out += s[i++];
  }
  return out;
}

/** The same name in the other script, or null for mixed or script-less text. */
export function swapScript(s: string): string | null {
  const cyr = hasCyrillic(s);
  const lat = hasLatin(s);
  if (cyr && !lat) return toLatin(s);
  if (lat && !cyr) return toCyrillic(s);
  return null;
}

/**
 * Strips the decorations that vary between releases of the same recording:
 * "(feat. X)", "[Remastered 2011]", " - Radio Edit", and so on.
 *
 * Bracketed text is removed wholesale rather than by keyword because JS regex
 * word boundaries don't work on Cyrillic, and the Russian equivalents —
 * "(Ремикс)", "(Live Версия)" — would slip through a keyword list.
 */
export function cleanTitle(s: string): string {
  return s
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s+[-–—]\s+.*\b(remaster(ed)?|live|version|edit|mix|remix|mono|stereo|acoustic|radio|extended|instrumental|demo)\b.*$/i, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || s.trim();
}

/** "A, B", "A & B", "A feat. B", "A x B", "A и B" → "A". */
export function primaryArtist(s: string): string {
  const first = s.split(/\s*(?:,|&|;|\/|\s(?:feat\.?|ft\.?|featuring|x|with|и)\s)\s*/i)[0];
  return (first || s).trim();
}

/**
 * A script-neutral, punctuation-free form of a name for comparison.
 *
 * Also folds the spellings different romanisation schemes produce for the same
 * sound — "Tsoi" / "Tsoy" / "Coj", "Khleb" / "Hleb" — so they compare as close.
 */
export function loose(s: string): string {
  return toLatin(s.normalize('NFKC'))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/shch|sch/g, 'sh')
    .replace(/kh/g, 'h')
    .replace(/ts|tz/g, 'c')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/q/g, 'k')
    .replace(/y/g, 'i')
    .replace(/x/g, 'ks')
    .replace(/([a-z])\1+/g, '$1')
    .trim()
    .replace(/\s+/g, ' ');
}

function bigrams(s: string): Map<string, number> {
  const padded = ` ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < padded.length - 1; i++) {
    const key = padded.slice(i, i + 2);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * How alike two names are, 0..1, regardless of script or punctuation.
 *
 * Dice similarity over letter pairs, plus one special case: when every word of
 * the shorter name appears in the longer one ("Kairat Nurtas" inside "Kairat
 * Nurtas, Ali Okapov") that is scored as a strong match on its own.
 */
export function similarity(a: string, b: string): number {
  const x = loose(a);
  const y = loose(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const shortWords = short.split(' ');
  const longWords = new Set(long.split(' '));
  if (shortWords.join('').length >= 4 && shortWords.every((w) => longWords.has(w))) {
    return 0.85 + 0.15 * (short.length / long.length);
  }

  const A = bigrams(x);
  const B = bigrams(y);
  let overlap = 0;
  let total = 0;
  for (const [k, n] of A) {
    overlap += Math.min(n, B.get(k) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

/** Case-insensitive de-duplication that keeps the first spelling seen. */
export function uniqueNames(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
