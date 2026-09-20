import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { defineWord, type Definition } from '../lib/dictionary';
import {
  cleanWord,
  lookupWord,
  otherTarget,
  translateLines,
  TranslateError,
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
 * Both pieces of state carry the song and language they were fetched for, and
 * anything fetched for a different one is simply not handed out. That is what
 * makes changing song or language instant: nothing has to be cleared, so
 * there is no frame in which the previous song's translations are still on
 * screen under the new song's words.
 */

const ON_KEY = 'livelyrics.study.on';
const TARGET_KEY = 'livelyrics.study.target';

function load<T>(key: string, ok: (v: string) => T | null, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : ok(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
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

interface Translated {
  /** What this was fetched for. Anything else is another song's answer. */
  forTexts: string[];
  forTarget: TargetLang;
  /** The language actually used, which differs when the song is already in
   *  the one that was asked for. */
  to: TargetLang;
  map: ReadonlyMap<string, string>;
  /** The language the translator decided the song is in. */
  detected: string | null;
  error: string | null;
}

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * Lines translated before the rest of the song, so the band under the lyrics
 * fills in almost at once rather than after the whole track has come back.
 */
const PRIORITY_LINES = 4;

export function useStudy(lyricLines: LyricLine[], activeIndex = 0) {
  const [on, setOn] = useState(() => load(ON_KEY, (v) => v === '1', false));
  const [target, setTargetState] = useState<TargetLang>(() =>
    load<TargetLang>(TARGET_KEY, (v) => (v === 'ru' || v === 'en' ? v : null), 'ru'),
  );
  const [result, setResult] = useState<Translated | null>(null);
  const [card, setCard] = useState<{ forTexts: string[]; to: TargetLang; data: WordCard } | null>(null);

  const cardRef = useRef<AbortController | null>(null);

  const texts = useMemo(
    () => [...new Set(lyricLines.map((l) => l.text.trim()).filter(Boolean))],
    [lyricLines],
  );

  /*
   * Where the song is, readable by the translate effect without being one of
   * its dependencies. It only matters at the instant the effect starts — which
   * line to fetch first — and listing it as a dependency would restart the
   * whole translation every time the song moved on a line.
   */
  const activeRef = useRef(activeIndex);
  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);

  /*
   * Translate the song, nearest line first, and show each batch as it lands.
   *
   * The order matters more than it sounds. Translating from the top and
   * waiting for all of it meant pressing Translate and watching nothing happen
   * for a second or two — and if the song was halfway through, the line you
   * were actually on was in the last batch to arrive. Now a handful of lines
   * starting at the current one go first, in a request small enough to come
   * back almost at once, and the rest of the song streams in behind them.
   */
  useEffect(() => {
    if (!on || texts.length === 0) return;

    const controller = new AbortController();
    const { signal } = controller;

    // The song's own lines, read from where it is now, wrapping at the end.
    const from = Math.max(0, Math.min(activeRef.current, lyricLines.length - 1));
    const ordered = [...new Set([
      ...lyricLines.slice(from).map((l) => l.text.trim()),
      ...lyricLines.slice(0, from).map((l) => l.text.trim()),
    ].filter(Boolean))];

    const run = async (): Promise<Translated> => {
      const publish = (map: ReadonlyMap<string, string>, detected: string | null, to: TargetLang) => {
        if (!signal.aborted) setResult({ forTexts: texts, forTarget: target, to, map, detected, error: null });
      };

      let to = target;
      let head = await translateLines(ordered.slice(0, PRIORITY_LINES), to, signal);

      // The song turned out to be written in the language it was going to be
      // translated into. Rather than showing a screen of nothing, read it in
      // the other one — which, with two targets, needs no choosing. Caught on
      // the first few lines, so nothing is fetched twice in the wrong language.
      if (head.detected === to) {
        to = otherTarget(to);
        head = await translateLines(ordered.slice(0, PRIORITY_LINES), to, signal);
      }
      publish(head.map, head.detected, to);

      const all = await translateLines(ordered, to, signal, (partial, detected) =>
        publish(partial, detected ?? head.detected, to),
      );
      return { forTexts: texts, forTarget: target, to, map: all.map, detected: all.detected ?? head.detected, error: null };
    };

    run()
      .then((next) => {
        if (!signal.aborted) setResult(next);
      })
      .catch((err: unknown) => {
        if (signal.aborted || err instanceof DOMException) return;
        setResult({
          forTexts: texts,
          forTarget: target,
          to: target,
          map: EMPTY,
          detected: null,
          error:
            err instanceof TranslateError && err.kind === 'quota'
              ? 'The free translator has hit its limit for today. It resets tomorrow.'
              : 'Couldn’t reach the translator. Check your connection and try again.',
        });
      });

    return () => controller.abort();
    // `lyricLines` is what `texts` is derived from, so the two always change
    // together — it is read here only to put the song back in its own order.
  }, [on, texts, target, lyricLines]);

  useEffect(() => () => cardRef.current?.abort(), []);

  // Anything fetched for another song or another choice is not this one's.
  const current = result && result.forTexts === texts && result.forTarget === target ? result : null;
  const translations = current?.map ?? EMPTY;

  /** The language actually on screen — see the note in the effect above. */
  const effective: TargetLang = current?.to ?? target;
  /** The song's own language, once a translator has told us. */
  const detected = current?.detected ?? null;

  const status: StudyStatus =
    !on ? 'off'
    : texts.length === 0 ? 'ready'
    : !current ? 'loading'
    : current.error ? 'error'
    : 'ready';

  const visibleCard =
    card && card.forTexts === texts && card.to === effective ? card.data : null;

  const translationFor = useCallback(
    (text: string) => translations.get(text.trim()),
    [translations],
  );

  /** Look one word up. The translation lands first; the definition follows. */
  const openWord = useCallback(
    (raw: string, line: string, lineIndex: number) => {
      if (!on) return;
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
        forTexts: texts,
        to: effective,
        data: { word, line, lineIndex, lineTranslation: translations.get(line.trim()), loading: true },
      });

      // Two independent requests. The definition is a bonus, so it is never
      // allowed to hold up or fail the translation.
      void defineWord(word, signal).then((definitions) => {
        if (!signal.aborted && definitions.length) amend({ definitions });
      });

      lookupWord(word, effective, signal)
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
    [on, effective, texts, translations],
  );

  const closeWord = useCallback(() => {
    cardRef.current?.abort();
    setCard(null);
  }, []);

  const toggle = useCallback(() => {
    setOn((prev) => {
      save(ON_KEY, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  /** Choosing a language also turns the view on, which is what tapping it means. */
  const setTarget = useCallback((next: TargetLang) => {
    save(TARGET_KEY, next);
    setTargetState(next);
    setOn(true);
    save(ON_KEY, '1');
  }, []);

  return {
    on,
    /** What the control should show as chosen. */
    target: effective,
    /** The song's own language, so the control can rule that option out. */
    detected,
    status,
    error: current?.error ?? null,
    translationFor,
    card: visibleCard,
    openWord,
    closeWord,
    toggle,
    setTarget,
  };
}
