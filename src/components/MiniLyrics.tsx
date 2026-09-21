import { memo } from 'react';
import type { LyricLine, Track } from '../types';
import type { TargetLang } from '../lib/translate';
import './MiniLyrics.css';

interface Props {
  track: Track | null;
  lines: LyricLine[];
  activeIndex: number;
  /** Progress through the song, 0..1, for the hairline. */
  progress: number;
  paused: boolean;
  onTogglePause: () => void;
  /** The active line's translation, when the study view is on. */
  translation?: string;
  translationLang?: TargetLang;
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
 */
export const MiniLyrics = memo(function MiniLyrics({
  track, lines, activeIndex, progress, paused, onTogglePause, translation, translationLang,
}: Props) {
  const current = activeIndex >= 0 ? lines[activeIndex] : undefined;
  const previous = activeIndex > 0 ? sung(lines, activeIndex - 1, -1) : undefined;
  const next = sung(lines, activeIndex + 1, 1);

  return (
    <div className="mini">
      <header className="mini__bar">
        <span className="mini__track">
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
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          )}
        </button>
      </header>

      <div className="mini__lines">
        <p className="mini__line mini__line--past">{previous?.text ?? ''}</p>

        {/* Keyed on the text so a line change replaces the element and the
            fade restarts. Nothing here is measured or transformed, so a swap
            costs a paint and no layout of anything else. */}
        <p key={current?.text ?? activeIndex} className="mini__line mini__line--now">
          {current?.text ?? (lines.length ? '' : 'No lyrics yet')}
        </p>

        {translation && (
          <p className="mini__translation" lang={translationLang}>{translation}</p>
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
