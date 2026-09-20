import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { defineWord, type Definition } from '../lib/dictionary';
import {
  cleanWord,
  lookupWord,
  pickPair,
  translateLines,
  TranslateError,
  type Lang,
  type TargetLang,
  type WordEntry,
} from '../lib/translate';

/**
 * The study layer: a second language under every line, and a word you can tap.
 *
 * It is a separate hook from useLiveLyrics on purpose. Nothing here touches
 * the microphone, the clock or the recogniser, and nothing here can break
 * them: if every translation in the song fails, the lyrics carry on exactly
 * as they did before. That separation is also what keeps the engine's
 * ref-based rules intact — this hook is ordinary React state, because none of
 * it is read from an asynchronous callback registered minutes earlier.
 *
 * Both pieces of state carry the `scope` they were fetched for, and anything
 * fetched for a different scope is simply not handed out. That is what makes
 * changing song or language instant: nothing has to be cleared, so there is
 * no frame in which the previous song's translations are still on screen
 * under the new song's words.
 */

/** Off, or the language the listener is reading in. */
export type StudyLang = TargetLang | null;

const STORE = 'livelyrics.study.lang';

/** Off → Russian → Kazakh → off. One button, no menu. */
const CYCLE: StudyLang[] = [null, 'ru', 'kk'];

function loadLang(): StudyLang {
  try {
    const saved = localStorage.getItem(STORE);
    return saved === 'ru' || saved === 'kk' ? saved : null;
  } catch {
    return null;
  }
}

function saveLang(lang: StudyLang) {
  try {
    if (lang) localStorage.setItem(STORE, lang);
    else localStorage.removeItem(STORE);
  } catch {
    // Private window, or storage disabled. The choice just won't be remembered.
  }
}

export interface WordCard {
  /** The word as it was tapped, cleaned of the line's punctuation. */
  word: string;
  /** The line it came from, and that line's translation, as context. */
  line: string;
  /** Its index, so the card can offer to play the song from there. */
  lineIndex: number;
  lineTranslation?: string;
  entry?: WordEntry;
  definitions?: Definition[];
  loading: boolean;
  error?: string;
}

export type StudyStatus = 'off' | 'loading' | 'ready' | 'error';

/** Which song, in which direction. A new object means everything is stale. */
type Scope = { from: Lang; to: Lang };

interface Translated {
  scope: Scope;
  map: ReadonlyMap<string, string>;
  error: string | null;
}

const EMPTY: ReadonlyMap<string, string> = new Map();

export function useStudy(lines: LyricLine[]) {
  const [lang, setLang] = useState<StudyLang>(loadLang);
  const [result, setResult] = useState<Translated | null>(null);
  const [card, setCard] = useState<{ scope: Scope; data: WordCard } | null>(null);

  const cardRef = useRef<AbortController | null>(null);

  const texts = useMemo(
    () => [...new Set(lines.map((l) => l.text.trim()).filter(Boolean))],
    [lines],
  );

  /**
   * Which way the translation runs, and the identity everything hangs off.
   *
   * The direction is decided from the lyrics themselves rather than from the
   * setting, so a Russian song opened with Russian selected shows English
   * instead of translating the words into the language they are already in.
   */
  const pair = useMemo<Scope | null>(() => {
    if (!lang) return null;
    const sample = texts.slice(0, 6).join(' ');
    return sample ? pickPair(sample, lang) : null;
  }, [lang, texts]);

  /* Translate the whole song at once.
   *
   * Lines are batched, so this is one or two requests rather than forty, and
   * translating everything up front means scrolling ahead — or opening the
   * line picker — shows translated text immediately instead of a trail of
   * placeholders filling in behind the reader. */
  useEffect(() => {
    if (!pair || texts.length === 0) return;

    const controller = new AbortController();
    const settle = (map: ReadonlyMap<string, string>, error: string | null) => {
      if (!controller.signal.aborted) setResult({ scope: pair, map, error });
    };

    translateLines(texts, pair.from, pair.to, controller.signal)
      .then((map) => settle(map, null))
      .catch((err: unknown) => {
        if (err instanceof DOMException) return;
        settle(
          EMPTY,
          err instanceof TranslateError && err.kind === 'quota'
            ? 'The free translator has hit its limit for today. It resets tomorrow.'
            : 'Couldn’t reach the translator. Check your connection and try again.',
        );
      });

    return () => controller.abort();
  }, [pair, texts]);

  useEffect(() => () => cardRef.current?.abort(), []);

  // Anything fetched for another song or another language is not this one's.
  const current = result && result.scope === pair ? result : null;
  const translations = current?.map ?? EMPTY;
  const visibleCard = card && card.scope === pair ? card.data : null;

  const status: StudyStatus =
    !pair ? 'off'
    : texts.length === 0 ? 'ready'
    : !current ? 'loading'
    : current.error ? 'error'
    : 'ready';

  const translationFor = useCallback(
    (text: string) => translations.get(text.trim()),
    [translations],
  );

  /** Look one word up. The translation lands first; the definition follows. */
  const openWord = useCallback(
    (raw: string, line: string, lineIndex: number) => {
      if (!pair) return;
      const word = cleanWord(raw);
      if (!word) return;

      cardRef.current?.abort();
      const controller = new AbortController();
      cardRef.current = controller;
      const { signal } = controller;

      /** Only ever updates the card that is still open on this same word. */
      const amend = (patch: Partial<WordCard>) =>
        setCard((prev) =>
          prev && prev.data.word === word ? { ...prev, data: { ...prev.data, ...patch } } : prev,
        );

      setCard({
        scope: pair,
        data: { word, line, lineIndex, lineTranslation: translations.get(line.trim()), loading: true },
      });

      // Two independent requests. The definition is a bonus, so it is never
      // allowed to hold up or fail the translation.
      void defineWord(word, signal).then((definitions) => {
        if (!signal.aborted && definitions.length) amend({ definitions });
      });

      lookupWord(word, pair.from, pair.to, signal)
        .then((entry) => {
          if (!signal.aborted) amend({ entry, loading: false });
        })
        .catch((err: unknown) => {
          if (signal.aborted || err instanceof DOMException) return;
          amend({
            loading: false,
            error:
              err instanceof TranslateError && err.kind === 'quota'
                ? 'Out of translations for today.'
                : 'Couldn’t look that word up.',
          });
        });
    },
    [pair, translations],
  );

  const closeWord = useCallback(() => {
    cardRef.current?.abort();
    setCard(null);
  }, []);

  const cycleLang = useCallback(() => {
    setLang((prev) => {
      const next = CYCLE[(CYCLE.indexOf(prev) + 1) % CYCLE.length];
      saveLang(next);
      return next;
    });
  }, []);

  return {
    lang,
    /** True while the listener is reading in a second language. */
    on: lang !== null,
    /** Which way the translation runs, for labelling the UI honestly. */
    pair,
    status,
    error: current?.error ?? null,
    translationFor,
    card: visibleCard,
    openWord,
    closeWord,
    cycleLang,
  };
}
