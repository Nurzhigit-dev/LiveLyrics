import { memo } from 'react';
import { TARGET_LABEL, TARGETS, languageName, type TargetLang } from '../lib/translate';
import './Controls.css';

/**
 * The three groups of controls, and where each one lives.
 *
 * They used to be a single row of six in the bottom-right corner: pause, find
 * line, translate, a stepper, again, done. Six controls in one cluster means
 * reading all six every time you want one of them, and nothing in the row
 * said which were about the song playing now and which would end the session.
 *
 * Now they are split by what they are for, and put where that kind of thing
 * belongs:
 *
 *   SessionActions  top bar     — starting over and finishing. Rarely wanted,
 *                                 never wanted by accident, so: out of the way.
 *   PlayControl     bottom mid  — the one control you reach for while
 *                                 listening, alone and centred so it can be
 *                                 hit without looking.
 *   ReadingTools    bottom end  — the two things that change how the lyrics
 *                                 read: the timeline, and the language.
 *
 * The fine timing stepper left this bar entirely. It lives in the timeline
 * now, next to the coarse correction it belongs with.
 */

/* --- Top bar: the session ------------------------------------------------- */

interface SessionProps {
  busy: boolean;
  /** False where the browser has no floating-window API. */
  canPopOut: boolean;
  /** True while the floating window is open. */
  poppedOut: boolean;
  onPopOut: () => void;
  onRelisten: () => void;
  onReset: () => void;
}

export const SessionActions = memo(function SessionActions({
  busy, canPopOut, poppedOut, onPopOut, onRelisten, onReset,
}: SessionProps) {
  return (
    <div className="session">
      {/* A window-level action, so it sits with the other two rather than in
          the bar of things that change how the lyrics read. */}
      {canPopOut && (
        <button
          type="button"
          className="session__btn"
          onClick={onPopOut}
          data-active={poppedOut || undefined}
          title={
            poppedOut
              ? 'Close the floating lyrics window'
              : 'Put the lyrics in a small window that stays on top of everything else'
          }
        >
          <PopOutGlyph />
          <span className="session__label">{poppedOut ? 'Close' : 'Pop out'}</span>
        </button>
      )}

      <button
        type="button"
        className="session__btn"
        onClick={onRelisten}
        disabled={busy}
        title="Listen again and re-identify what is playing"
      >
        <ListenGlyph />
        <span className="session__label">{busy ? 'Listening' : 'Again'}</span>
      </button>

      <button
        type="button"
        className="session__btn session__btn--quiet"
        onClick={onReset}
        title="Stop and start over"
      >
        <CloseGlyph />
        <span className="session__label">Done</span>
      </button>
    </div>
  );
});

/* --- Bottom, centre: playback --------------------------------------------- */

interface PlayProps {
  paused: boolean;
  onToggle: () => void;
}

/**
 * Deliberately the only thing in the middle of the bar, and deliberately
 * round and larger than everything else. It is the control wanted most often
 * and the one most often wanted without looking at the screen.
 */
export const PlayControl = memo(function PlayControl({ paused, onToggle }: PlayProps) {
  return (
    <button
      type="button"
      className="playctl"
      onClick={onToggle}
      aria-label={paused ? 'Resume' : 'Pause'}
      title={paused ? 'Resume (space)' : 'Pause (space)'}
      data-paused={paused || undefined}
    >
      {paused ? <PlayGlyph /> : <PauseGlyph />}
    </button>
  );
});

/* --- Bottom, end: how the lyrics read ------------------------------------- */

interface ToolsProps {
  /** False for unsynced lyrics: there is no clock to move. */
  canAdjust: boolean;
  adjusting: boolean;
  onAdjust: () => void;
  studyOn: boolean;
  /** The language being read in. */
  target: TargetLang;
  /** The song's own language, when a translator has told us. */
  detected: string | null;
  onToggleStudy: () => void;
  onSetTarget: (lang: TargetLang) => void;
}

export const ReadingTools = memo(function ReadingTools({
  canAdjust, adjusting, onAdjust, studyOn, target, detected, onToggleStudy, onSetTarget,
}: ToolsProps) {
  return (
    <div className="tools">
      {canAdjust && (
        <button
          type="button"
          className="tools__btn"
          onClick={onAdjust}
          data-active={adjusting || undefined}
          title="The lyrics are out of step — drag the song to where it really is"
        >
          <TimelineGlyph />
          <span className="tools__label">Adjust</span>
        </button>
      )}

      <button
        type="button"
        className="tools__btn"
        onClick={onToggleStudy}
        data-active={studyOn || undefined}
        aria-pressed={studyOn}
        title={
          studyOn
            ? 'Hide the translation'
            : 'Read the lyrics in another language, and tap any word for its meaning'
        }
      >
        <GlobeGlyph />
        <span className="tools__label">Translate</span>
      </button>

      {/*
        The language sits beside the switch rather than inside it. Cycling
        through off, Russian and Kazakh on one button meant the only way to
        find out what the next press would do was to press it — and it hid
        which language was on behind a lit icon. Two named options, one of
        which is always visibly chosen, answers both at a glance.
      */}
      {studyOn && (
        <div className="seg" role="group" aria-label="Read the lyrics in">
          {TARGETS.map((lang) => {
            // No point offering to translate a song into the language it is
            // already written in — and saying so is more use than a dead
            // button that quietly does nothing.
            const isSource = detected === lang;
            return (
              <button
                key={lang}
                type="button"
                className="seg__opt"
                onClick={() => onSetTarget(lang)}
                disabled={isSource}
                aria-pressed={target === lang}
                data-on={target === lang || undefined}
                title={
                  isSource
                    ? `This song is already in ${languageName(lang)}`
                    : `Read it in ${languageName(lang)}`
                }
              >
                {TARGET_LABEL[lang]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* --- Glyphs --------------------------------------------------------------- */

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

/** A track with a handle on it: the timeline. */
function TimelineGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 12h5" opacity="0.5" />
      <path d="M14 12h7" opacity="0.5" />
      <circle cx="11" cy="12" r="3" fill="currentColor" stroke="none" />
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

/** A pane lifting out of a larger one. */
function PopOutGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h4" opacity="0.55" />
      <rect x="12" y="12" width="9" height="7" rx="1.6" />
    </svg>
  );
}

/** Sound arriving at a point: listen again. */
function ListenGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 10v4" />
      <path d="M9 7v10" />
      <path d="M13 9v6" />
      <path d="M17 6v12" opacity="0.5" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
