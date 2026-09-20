import { useEffect, useRef } from 'react';
import type { WordCard as Card } from '../hooks/useStudy';
import { languageName, type TargetLang } from '../lib/translate';
import './WordCard.css';

interface Props {
  card: Card;
  /** The language it was translated into, so the card can say so. */
  to: TargetLang;
  onClose: () => void;
  /** Start the lyrics again from the line this word came from. */
  onSeekToLine?: () => void;
}

/**
 * One word, opened from the lyrics.
 *
 * It takes its own space in the column rather than floating over the lyrics.
 * A panel that covers the bottom of the screen is the usual way to do this,
 * and it is the wrong way here: the thing you want to read while looking a
 * word up is the line it came from, and that is exactly what a floating panel
 * sits on top of.
 *
 * Three answers, in the order they are useful:
 *   the translation, which is what was asked for;
 *   the other senses, because a song rarely wants a word's first meaning;
 *   the English definition, which is the part that actually teaches rather
 *   than just swaps one word for another.
 */
export function WordCard({ card, to, onClose, onSeekToLine }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Moving focus into the card is what makes it reachable from the keyboard
  // at all — and what makes Escape, handled at the window level, obviously
  // apply to this and not to whatever was focused before.
  useEffect(() => {
    closeRef.current?.focus();
  }, [card.word]);

  return (
    <section className="wordcard" aria-label={`Meaning of ${card.word}`}>
      <div className="wordcard__inner">
        <header className="wordcard__head">
          <h2 className="wordcard__word">{card.word}</h2>
          <span className="label wordcard__lang">{languageName(to)}</span>
          <button
            ref={closeRef}
            type="button"
            className="wordcard__close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {card.error ? (
          <p className="wordcard__error">{card.error}</p>
        ) : (
          <>
            <p className="wordcard__primary" lang={to} aria-live="polite">
              {card.entry?.primary ?? (card.loading ? 'Looking it up…' : '—')}
            </p>

            {/* Every other meaning the dictionary knows. A song almost never
                wants the first one, so these are the useful part. */}
            {card.entry?.senses.map((sense) => (
              <p className="wordcard__sense" key={sense.pos ?? sense.meanings[0]}>
                {sense.pos && <span className="label wordcard__pos">{sense.pos}</span>}
                <span lang={to}>{sense.meanings.join(' · ')}</span>
              </p>
            ))}

            {card.definitions?.map((def, i) => (
              <p className="wordcard__define" key={`${def.partOfSpeech}-${i}`} lang="en">
                {def.partOfSpeech && <span className="label wordcard__pos">{def.partOfSpeech}</span>}
                {/* Named, because the definition is of the base word: the
                    answer to "hid" is the entry for "hide", and saying which
                    is half of what makes it a lesson rather than a lookup. */}
                {def.lemma && <strong className="wordcard__lemma">{def.lemma}</strong>}
                {def.sense}
                {def.example && <em className="wordcard__example">{def.example}</em>}
              </p>
            ))}
          </>
        )}

        {/* The line it came from. Without this the card is a word with no
            song attached, and the meaning of a word in a lyric is mostly the
            company it keeps. */}
        <footer className="wordcard__foot">
          <p className="wordcard__line">
            <span className="wordcard__source">{card.line}</span>
            {card.lineTranslation && (
              <span className="wordcard__source wordcard__source--second" lang={to}>
                {card.lineTranslation}
              </span>
            )}
          </p>

          {onSeekToLine && (
            /* Studying makes words the tap target, so tapping a line to
               re-anchor the sync is no longer available out there. It is
               offered here instead, on the line you are already looking at. */
            <button type="button" className="wordcard__seek" onClick={onSeekToLine}>
              Play from here
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}
