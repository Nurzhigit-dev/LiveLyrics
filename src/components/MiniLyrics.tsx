import { memo, useCallback, useRef } from 'react';
import type { LyricLine, Track } from '../types';
import { useWordLight } from '../hooks/useWordLight';
import './MiniLyrics.css';

interface Props {
  track: Track | null;
  lines: LyricLine[];
  /** How long each line is actually sung for — see computeSungSpans. */
  spans?: number[];
  activeIndex: number;
  /** Progress through the song, 0..1, for the hairline. */
  progress: number;
  /** Reads the exact song position without triggering a render. */
  getPosition: () => number;
  paused: boolean;
  onTogglePause: () => void;
}

/** Nearest line with words, searching in `step` direction from `from`. */
function sung(lines: LyricLine[], from: number, step: number): LyricLine | undefined {
  for (let i = from; i >= 0 && i < lines.length; i += step) {
    if (lines[i]?.text) return lines[i];
  }
  return undefined;
}

/**
 * The lyrics, in the floating window.
 *
 * Deliberately not a smaller copy of the main view. That one is a reel of the
 * whole song, positioned by measurement and glided by transform — all of which
 * costs layout, and all of which is wasted in a window four lines tall that
 * someone is glancing at out of the corner of their eye.
 *
 * So: three lines, swapped by React, no measuring and no reel. The one before
 * for context, the one being sung, the one coming. The heaviest thing on
 * screen is the line you want, which is the only thing this window is for.
 *
 * It does keep the word-by-word light, because that is the one piece of motion
 * that earns its place here: it tells you *where in the line* the singer is,
 * which is precisely what you lose by not being able to see the reel move.
 */
export const MiniLyrics = memo(function MiniLyrics({
  track, lines, spans, activeIndex, progress, getPosition, paused, onTogglePause,
}: Props) {
  const nowRef = useRef<HTMLParagraphElement>(null);
  const getEl = useCallback(() => nowRef.current, []);

  const current = activeIndex >= 0 ? lines[activeIndex] : undefined;
  const previous = activeIndex > 0 ? sung(lines, activeIndex - 1, -1) : undefined;
  const next = sung(lines, activeIndex + 1, 1);
  const words = current?.text ? current.text.split(/\s+/) : [];

  useWordLight({ getEl, lines, spans, activeIndex, getPosition, enabled: words.length > 0 });

  return (
    <div className="mini">
      <header className="mini__bar">
        {/* Empty, and exactly as wide as the button opposite it. That is what
            centres the track name in the WINDOW rather than in the space left
            over beside the button. */}
        <span className="mini__spacer" aria-hidden="true" />

        <span className="mini__track">
          <span className="mini__dot" aria-hidden="true" data-paused={paused || undefined} />
          {track ? (
            <>
              <span className="mini__title">{track.title}</span>
              <span className="mini__artist">{track.artist}</span>
            </>
          ) : (
            <span className="mini__artist">Nothing playing</span>
          )}
        </span>

        <button
          type="button"
          className="mini__play"
          onClick={onTogglePause}
          aria-label={paused ? 'Resume' : 'Pause'}
          data-paused={paused || undefined}
        >
          {paused ? (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          )}
        </button>
      </header>

      <div className="mini__lines">
        <p className="mini__line mini__line--past">{previous?.text ?? ''}</p>

        {/*
          Keyed on the text so a line change replaces the element and the
          entrance restarts. Nothing here is measured or transformed, so a swap
          costs a paint and no layout of anything else.
        */}
        {words.length > 0 ? (
          <p
            key={current!.text}
            ref={nowRef}
            className="mini__line mini__line--now"
            data-words={words.length}
          >
            {words.map((word, i) => (
              <span key={`${i}-${word}`} className="mini__word" style={{ '--i': i } as React.CSSProperties}>
                {word}{i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        ) : lines.length === 0 ? (
          <p className="mini__line mini__line--now mini__line--quiet">Waiting for a song</p>
        ) : (
          /* An instrumental gap, shown the way the main view shows it, so the
             window reads as between-lines rather than as broken. */
          <p className="mini__rest" aria-hidden="true"><span /><span /><span /></p>
        )}

        <p className="mini__line mini__line--next">{next?.text ?? ''}</p>
      </div>

      <div
        className="mini__progress"
        role="progressbar"
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
});
