import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { formatTime } from '../lib/time';
import { NUDGE_STEP } from '../lib/calibration';
import './SyncBar.css';

interface Props {
  /** Length of the song in seconds. */
  duration: number;
  /** Where the clock is — the live position, or the drag while dragging. */
  position: number;
  /** Every line's timestamp, drawn as marks along the track. */
  lines: LyricLine[];
  /** The persistent fine correction, and the way to change it. */
  nudge: number;
  onNudge: (delta: number) => void;
  /** Called continuously while dragging. */
  onScrub: (seconds: number) => void;
  /** Called when the drag ends: this position is where the song is now. */
  onCommit: () => void;
  onClose: () => void;
}

/** One arrow press on the track. Shift makes it five. */
const STEP_SECONDS = 1;
const BIG_STEP_SECONDS = 5;

/** Past this many lines the marks stop being information and become texture. */
const MAX_TICKS = 140;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A drag smaller than this was a tap, and not worth reporting as a move. */
const MOVE_FLOOR = 0.2;

/** How far the last drag moved the song, in words rather than a signed number. */
function describeMove(seconds: number): string {
  const size = Math.abs(seconds).toFixed(1);
  return `moved ${size}s ${seconds < 0 ? 'earlier' : 'later'}`;
}

/* Marks never change while a song is on screen, so they are their own
   memoised component — otherwise a hundred of them would be reconciled on
   every frame of a drag. */
const Ticks = memo(function Ticks({ lines, duration }: { lines: LyricLine[]; duration: number }) {
  const marks = useMemo(() => {
    const timed = lines.filter((l) => l.text && l.time > 0);
    if (timed.length === 0 || timed.length > MAX_TICKS || duration <= 0) return [];
    return timed.map((l) => (l.time / duration) * 100);
  }, [lines, duration]);

  return (
    <span className="syncbar__ticks" aria-hidden="true">
      {marks.map((pct, i) => (
        <span key={i} className="syncbar__tick" style={{ insetInlineStart: `${pct}%` }} />
      ))}
    </span>
  );
});

/**
 * The timeline.
 *
 * This replaced a list of lines you tapped one of. Tapping a line was precise
 * but it was also a leap: you had to read the list, find the words you could
 * hear, and commit — and if you were out by a verse you scrolled, hunted, and
 * tried again. Dragging is the ordinary gesture for "the song is further
 * along than you think", and because the clock is held at the dragged
 * position, the lyrics *behind* this bar move with it. So you do not read
 * timecodes at all: you drag until the line on screen is the one in the room,
 * and let go.
 */
export function SyncBar({
  duration, position, lines, nudge, onNudge, onScrub, onCommit, onClose,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  /*
   * Where the drag started, and how far the last one carried the song.
   *
   * Measured per drag, not from when the panel opened. The first version
   * compared against the position at open, which meant the readout climbed on
   * its own — the song keeps playing while the panel is up, so after twenty
   * seconds of doing nothing it claimed the lyrics had been moved twenty
   * seconds. What anyone wants to know is how far the correction they just
   * made actually went.
   */
  const dragFrom = useRef(0);
  const [moved, setMoved] = useState<number | null>(null);

  const secondsAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return clamp01((clientX - rect.left) / rect.width) * duration;
    },
    [duration],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Capture, so a drag that wanders off the bar — or off the window —
      // keeps being this bar's drag and still ends in a pointerup here.
      event.currentTarget.setPointerCapture(event.pointerId);
      dragFrom.current = position;
      setDragging(true);
      onScrub(secondsAt(event.clientX));
    },
    [onScrub, secondsAt, position],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onScrub(secondsAt(event.clientX));
    },
    [dragging, onScrub, secondsAt],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setMoved(position - dragFrom.current);
      onCommit();
    },
    [dragging, onCommit, position],
  );

  /** Arrows move the song itself; the stepper beside it moves the correction. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? BIG_STEP_SECONDS : STEP_SECONDS;
      let next: number | null = null;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = position - step;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = position + step;
      else if (event.key === 'PageDown') next = position - BIG_STEP_SECONDS * 2;
      else if (event.key === 'PageUp') next = position + BIG_STEP_SECONDS * 2;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = duration;
      else return;

      event.preventDefault();
      const to = Math.min(duration, Math.max(0, next));
      onScrub(to);
      setMoved(to - position);
      // Committed on each press rather than on release: from a keyboard there
      // is no release, and holding the key would otherwise freeze the clock.
      onCommit();
    },
    [position, duration, onScrub, onCommit],
  );

  const pct = duration > 0 ? clamp01(position / duration) * 100 : 0;

  return (
    <section className="syncbar" aria-label="Move the lyrics to where the song is">
      <header className="syncbar__head">
        <p className="syncbar__hint">
          Drag until the words on screen are the ones you can hear
        </p>
        <button type="button" className="syncbar__done" onClick={onClose}>Done</button>
      </header>

      <div className="syncbar__row">
        <span className="readout syncbar__time" aria-hidden="true">{formatTime(position)}</span>

        <div
          ref={trackRef}
          className="syncbar__track"
          data-dragging={dragging || undefined}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          <span className="syncbar__rail" aria-hidden="true" />
          <span className="syncbar__fill" style={{ inlineSize: `${pct}%` }} aria-hidden="true" />
          {/* Over the fill, not under it. Beneath, every mark in the part of
              the song already played was hidden — which is half the bar, and
              the half you are usually dragging back into. */}
          <Ticks lines={lines} duration={duration} />
          <span className="syncbar__handle" style={{ insetInlineStart: `${pct}%` }} aria-hidden="true" />
        </div>

        <span className="readout syncbar__time syncbar__time--end" aria-hidden="true">
          {formatTime(duration)}
        </span>
      </div>

      <footer className="syncbar__foot">
        <span
          className="label syncbar__delta"
          data-moved={(moved !== null && Math.abs(moved) >= MOVE_FLOOR) || undefined}
          aria-live="polite"
        >
          {/* Empty until something has actually been moved. The instruction
              is already at the top of the panel, and repeating it here only
              earned an ellipsis on a phone. */}
          {moved !== null && Math.abs(moved) >= MOVE_FLOOR ? describeMove(moved) : ''}
        </span>

        {/* The fine, persistent correction. It lives here rather than in the
            transport bar because it is the same job as the track above it —
            one coarse and for this song, one small and for this device. */}
        <div className="syncbar__fine" role="group" aria-label="Fine timing correction">
          <button
            type="button"
            className="syncbar__step"
            onClick={() => onNudge(-NUDGE_STEP)}
            aria-label="Lyrics a quarter second earlier"
          >
            <Chevron dir="back" />
          </button>
          <span className="syncbar__readout">
            <span className="readout syncbar__value" aria-live="polite" data-offset={nudge !== 0 || undefined}>
              {nudge === 0 ? '0.00' : `${nudge > 0 ? '+' : '−'}${Math.abs(nudge).toFixed(2)}`}
            </span>
            <span className="syncbar__unit" aria-hidden="true">fine</span>
          </span>
          <button
            type="button"
            className="syncbar__step"
            onClick={() => onNudge(NUDGE_STEP)}
            aria-label="Lyrics a quarter second later"
          >
            <Chevron dir="forward" />
          </button>
        </div>
      </footer>
    </section>
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
