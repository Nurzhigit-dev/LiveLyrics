import type { StudyLang } from '../hooks/useStudy';
import './SyncControls.css';

/**
 * One press shifts the lyrics a quarter of a second.
 *
 * This was half a second, which was too coarse to land on a beat — and worse,
 * a nudge often produced no visible change at all, because the highlight only
 * moves when the clock crosses a line boundary. Press twice, see nothing, and
 * you reasonably conclude the button is broken. The word-by-word fill on the
 * active line is what actually fixed that: now every nudge moves something
 * immediately, whether or not a line change is due.
 */
export const NUDGE_STEP = 0.25;

interface Props {
  nudge: number;
  synced: boolean;
  paused: boolean;
  picking: boolean;
  busy: boolean;
  /** Which language the lyrics are being read in, or null for off. */
  studyLang: StudyLang;
  onNudge: (delta: number) => void;
  onTogglePause: () => void;
  onPick: () => void;
  onCancelPick: () => void;
  onRelisten: () => void;
  onReset: () => void;
  onCycleStudy: () => void;
}

/**
 * Off, Russian, Kazakh — one button rather than a toggle and a menu beside it.
 *
 * A second control for the language would be two things to find in a bar that
 * already has five, to choose between two options one of which is the obvious
 * default. Cycling costs one extra press to reach Kazakh and none to reach
 * Russian, and the button always says which one it is on.
 */
const STUDY_LABEL: Record<string, string> = { ru: 'RU', kk: 'KK' };

export function SyncControls({
  nudge, synced, paused, picking, busy, studyLang,
  onNudge, onTogglePause, onPick, onCancelPick, onRelisten, onReset, onCycleStudy,
}: Props) {
  const offset = nudge === 0 ? '0.00' : `${nudge > 0 ? '+' : '−'}${Math.abs(nudge).toFixed(2)}`;

  // While picking a line, the bar says what to do and offers the way out.
  // Leaving the other controls there would just be noise at that moment.
  if (picking) {
    return (
      <div className="sync sync--picking">
        <span className="sync__hint">
          Tap the line playing now
          <span className="sync__keys"> — or ↑ ↓ and Enter</span>
        </span>
        <button type="button" className="sync__action sync__action--quiet" onClick={onCancelPick}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="sync">
      {synced && (
        <button
          type="button"
          className="sync__icon"
          onClick={onTogglePause}
          aria-label={paused ? 'Resume' : 'Pause'}
          title={paused ? 'Resume (space)' : 'Pause (space)'}
          data-active={paused || undefined}
        >
          {paused ? <PlayGlyph /> : <PauseGlyph />}
        </button>
      )}

      {synced && (
        <button
          type="button"
          className="sync__icon sync__icon--wide"
          onClick={onPick}
          title="Scroll the lyrics and pick the line that's playing"
        >
          <LinesGlyph />
          <span className="sync__icon-label">Find line</span>
        </button>
      )}

      <button
        type="button"
        className="sync__icon sync__icon--wide sync__icon--lang"
        onClick={onCycleStudy}
        data-active={studyLang ? true : undefined}
        aria-label={
          studyLang === 'ru' ? 'Reading in Russian. Switch to Kazakh'
          : studyLang === 'kk' ? 'Reading in Kazakh. Turn translation off'
          : 'Show the lyrics in Russian or Kazakh, and look words up'
        }
        title={
          studyLang
            ? 'Tap a word for its meaning. Press again to change language'
            : 'Translate the lyrics, and tap any word for its meaning'
        }
      >
        <GlobeGlyph />
        <span className="sync__icon-label">{studyLang ? STUDY_LABEL[studyLang] : 'Translate'}</span>
      </button>

      {synced && (
        <div className="sync__group" role="group" aria-label="Adjust lyric timing">
          <button
            type="button"
            className="sync__step"
            onClick={() => onNudge(-NUDGE_STEP)}
            aria-label="Lyrics a quarter second earlier"
          >
            <Chevron dir="back" />
          </button>

          <span className="sync__readout">
            {/* aria-live announces the new offset, which the chevrons alone
                could never convey to a screen reader. */}
            <span className="readout sync__value" aria-live="polite" data-offset={nudge !== 0 || undefined}>
              {offset}
            </span>
            <span className="sync__unit" aria-hidden="true">sync</span>
          </span>

          <button
            type="button"
            className="sync__step"
            onClick={() => onNudge(NUDGE_STEP)}
            aria-label="Lyrics a quarter second later"
          >
            <Chevron dir="forward" />
          </button>
        </div>
      )}

      <button type="button" className="sync__action" onClick={onRelisten} disabled={busy}>
        {busy ? 'Listening' : 'Again'}
      </button>

      <button type="button" className="sync__action sync__action--quiet" onClick={onReset}>
        Done
      </button>
    </div>
  );
}

function Chevron({ dir }: { dir: 'back' | 'forward' }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'back' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

/** A globe, for reading the song in another language. */
function GlobeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.3 2.4 3.4 5.3 3.4 8.5S14.3 18.1 12 20.5c-2.3-2.4-3.4-5.3-3.4-8.5S9.7 5.9 12 3.5z" />
    </svg>
  );
}

/** Lines with a pointer at one of them: "choose a line". */
function LinesGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 18h16" opacity="0.45" />
      <path d="M4 12h10" />
      <path d="M17 9.5l3 2.5-3 2.5" />
    </svg>
  );
}
