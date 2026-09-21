import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { formatTime } from '../lib/time';
import { NUDGE_LIMIT, NUDGE_STEP } from '../lib/calibration';
import './SyncBar.css';

interface Props {
  /** Length of the song in seconds. */
  duration: number;
  /** Where the clock is — the live position, or the drag while dragging. */
  position: number;
  /** Every line's timestamp, drawn as marks along the jump track. */
  lines: LyricLine[];
  /** The persistent fine correction, and the two ways to change it. */
  nudge: number;
  onNudge: (delta: number) => void;
  onSetNudge: (value: number) => void;
  /** Called continuously while dragging the jump track. */
  onScrub: (seconds: number) => void;
  /** Called when that drag ends: this position is where the song is now. */
  onCommit: () => void;
  onClose: () => void;
}

/** Past this many lines the marks stop being information and become texture. */
const MAX_TICKS = 140;

/** Close enough to the middle to mean "none": lets you find zero by feel. */
const SNAP = 0.08;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

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
 * Putting the lyrics back in step, with two controls for two different jobs.
 *
 * The first version of this was one slider spanning the whole song, and it was
 * the wrong instrument. Almost every correction anyone actually needs is a
 * second or two — which, on a bar three minutes wide, is about ten pixels.
 * Asking someone to land a two-second fix by dragging ten pixels is asking
 * them to move a pin ten metres using a map of the world.
 *
 * So the control you reach for first spans ten seconds, not three minutes:
 * roughly a fiftieth of the travel per second, and the lyrics move under your
 * thumb as you drag. It also writes to the *persistent* correction rather than
 * to this song's anchor, which means two things — it is remembered for every
 * song after this one, and no background re-check can undo it, because those
 * only ever move the anchor.
 *
 * The whole-song bar is still here, one row down and half the height, for the
 * other job: being on completely the wrong part of the track because the
 * recogniser matched the wrong repeat of a chorus.
 */
export function SyncBar({
  duration, position, lines, nudge, onNudge, onSetNudge, onScrub, onCommit, onClose,
}: Props) {
  const fineRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<HTMLDivElement>(null);

  /*
   * Which track is being dragged, in a ref rather than state.
   *
   * The pointerup handler has to know a drag was in progress, and reading that
   * from state means reading whatever the last render captured. A quick tap
   * can outrun the re-render, and the handler would then skip the commit —
   * leaving the clock frozen at wherever the press landed.
   */
  const dragging = useRef<'fine' | 'jump' | null>(null);
  const [active, setActive] = useState<'fine' | 'jump' | null>(null);

  const ratioAt = (el: HTMLElement | null, clientX: number) => {
    const rect = el?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  };

  /* ---- fine: the persistent correction, ±NUDGE_LIMIT seconds ------------ */

  const fineAt = useCallback((clientX: number) => {
    const value = (ratioAt(fineRef.current, clientX) - 0.5) * 2 * NUDGE_LIMIT;
    return Math.abs(value) < SNAP ? 0 : value;
  }, []);

  const fineDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = 'fine';
    setActive('fine');
    onSetNudge(fineAt(event.clientX));
  }, [fineAt, onSetNudge]);

  const fineMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== 'fine') return;
    onSetNudge(fineAt(event.clientX));
  }, [fineAt, onSetNudge]);

  /* ---- jump: this song's position, the whole track ---------------------- */

  const jumpDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = 'jump';
    setActive('jump');
    onScrub(ratioAt(jumpRef.current, event.clientX) * duration);
  }, [duration, onScrub]);

  const jumpMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== 'jump') return;
    onScrub(ratioAt(jumpRef.current, event.clientX) * duration);
  }, [duration, onScrub]);

  /** Both tracks end the same way; only the jump has anything to commit. */
  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const was = dragging.current;
    if (!was) return;
    dragging.current = null;
    setActive(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (was === 'jump') onCommit();
  }, [onCommit]);

  const fineKeys = useCallback((event: React.KeyboardEvent) => {
    const step = event.shiftKey ? NUDGE_STEP * 4 : NUDGE_STEP;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onNudge(-step);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onNudge(step);
    else if (event.key === 'Home') onSetNudge(0);
    else return;
    event.preventDefault();
  }, [onNudge, onSetNudge]);

  const jumpKeys = useCallback((event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 15 : 5;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = position - step;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = position + step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = duration;
    else return;
    event.preventDefault();
    onScrub(Math.min(duration, Math.max(0, next)));
    // No release from a keyboard, so each press commits on its own.
    onCommit();
  }, [position, duration, onScrub, onCommit]);

  const finePct = ((nudge + NUDGE_LIMIT) / (NUDGE_LIMIT * 2)) * 100;
  const jumpPct = duration > 0 ? clamp01(position / duration) * 100 : 0;
  const offset = nudge === 0 ? '0.00' : `${nudge > 0 ? '+' : '−'}${Math.abs(nudge).toFixed(2)}`;

  return (
    <section className="syncbar" aria-label="Put the lyrics back in step">
      <header className="syncbar__head">
        <p className="syncbar__hint">Drag until the words on screen are the ones you can hear</p>
        <button type="button" className="syncbar__done" onClick={onClose}>Done</button>
      </header>

      {/* --- the one you want, almost always --- */}
      <div className="syncbar__row">
        <button
          type="button"
          className="syncbar__step"
          onClick={() => onNudge(-NUDGE_STEP)}
          aria-label="Lyrics a quarter second earlier"
        >
          <Chevron dir="back" />
        </button>

        <div
          ref={fineRef}
          className="syncbar__fine"
          data-dragging={active === 'fine' || undefined}
          role="slider"
          tabIndex={0}
          aria-label="Shift the lyrics"
          aria-valuemin={-NUDGE_LIMIT}
          aria-valuemax={NUDGE_LIMIT}
          aria-valuenow={nudge}
          aria-valuetext={nudge === 0 ? 'in step' : `${offset} seconds`}
          onPointerDown={fineDown}
          onPointerMove={fineMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={fineKeys}
        >
          <span className="syncbar__rail" aria-hidden="true" />
          {/* Zero, marked, so it can be found by eye and by feel. */}
          <span className="syncbar__zero" aria-hidden="true" />
          <span
            className="syncbar__fill"
            style={{ insetInlineStart: `${Math.min(50, finePct)}%`, inlineSize: `${Math.abs(finePct - 50)}%` }}
            aria-hidden="true"
          />
          <span className="syncbar__handle" style={{ insetInlineStart: `${finePct}%` }} aria-hidden="true" />
          <span className="syncbar__end syncbar__end--start" aria-hidden="true">earlier</span>
          <span className="syncbar__end syncbar__end--end" aria-hidden="true">later</span>
        </div>

        <button
          type="button"
          className="syncbar__step"
          onClick={() => onNudge(NUDGE_STEP)}
          aria-label="Lyrics a quarter second later"
        >
          <Chevron dir="forward" />
        </button>

        <span className="syncbar__readout">
          <span className="readout syncbar__value" aria-live="polite" data-offset={nudge !== 0 || undefined}>
            {offset}
          </span>
          <span className="syncbar__unit" aria-hidden="true">shift</span>
        </span>
      </div>

      {/* --- and the one for being on the wrong verse entirely --- */}
      <div className="syncbar__jump">
        <span className="syncbar__label">Wrong part?</span>

        <div
          ref={jumpRef}
          className="syncbar__track"
          data-dragging={active === 'jump' || undefined}
          role="slider"
          tabIndex={0}
          aria-label="Position in the song"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
          onPointerDown={jumpDown}
          onPointerMove={jumpMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={jumpKeys}
        >
          <span className="syncbar__rail" aria-hidden="true" />
          <span className="syncbar__played" style={{ inlineSize: `${jumpPct}%` }} aria-hidden="true" />
          {/* Over the fill, not under it: beneath, every mark in the part
              already played was hidden, and that is the half you drag back
              into. */}
          <Ticks lines={lines} duration={duration} />
          <span className="syncbar__handle syncbar__handle--small" style={{ insetInlineStart: `${jumpPct}%` }} aria-hidden="true" />
        </div>

        <span className="readout syncbar__time">
          {formatTime(position)} / {formatTime(duration)}
        </span>
      </div>
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
