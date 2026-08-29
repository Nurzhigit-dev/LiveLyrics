import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import './LyricStage.css';

interface Props {
  lines: LyricLine[];
  /** Index of the line currently being sung, or -1 before the first. */
  activeIndex: number;
  /** False when only unsynced plain lyrics were available. */
  synced: boolean;
  /** Reads the exact song position without triggering a render. */
  getPosition: () => number;
  /** Called when a line is clicked, to re-anchor the clock to that moment. */
  onSeekToLine?: (index: number) => void;
}

/** The active line sits above centre — reading is easier with more of the
 *  song visible ahead than behind. */
const FOCAL_RATIO = 0.40;

/** Past this many lines away, everything looks the same. */
const MAX_DISTANCE = 5;


/** Assumed length of the final line, which has no following timestamp. */
const LAST_LINE_SECONDS = 4;

/* ---------------------------------------------------------------------------
 * One line.
 *
 * memo() matters more than it looks. When the active line changes, only about
 * four rows actually change appearance, but without this every row in the song
 * — often two hundred of them — would re-render and have its styles
 * recalculated. That work landed in the same frames as the scroll animation,
 * which is exactly when it is most visible as a stutter.
 * ------------------------------------------------------------------------ */

interface RowProps {
  line: LyricLine;
  index: number;
  distance: number;
  isActive: boolean;
  isPast: boolean;
  seekable: boolean;
  onSeek?: (index: number) => void;
  attach: (index: number, el: HTMLElement | null) => void;
}

const LyricRow = memo(function LyricRow({
  line, index, distance, isActive, isPast, seekable, onSeek, attach,
}: RowProps) {
  const ref = useCallback(
    (el: HTMLElement | null) => attach(index, el),
    [attach, index],
  );

  // An empty LRC line is an instrumental gap, not a bug.
  if (!line.text) {
    return (
      <div ref={ref} className="lyrics__rest" data-active={isActive || undefined} aria-hidden="true">
        <span /><span /><span />
      </div>
    );
  }

  const words = line.text.split(/\s+/);
  const shared = {
    ref,
    'data-distance': distance,
    'data-active': isActive || undefined,
    'data-past': isPast || undefined,
    'data-words': words.length,
    'aria-current': isActive ? ('true' as const) : undefined,
  };

  // Only the active line is split into words. Every other line stays a single
  // text node, which keeps the DOM small on a long song.
  const content = isActive && seekable
    ? words.map((word, w) => (
        <span
          key={`${w}-${word}`}
          className="lyrics__word"
          style={{ '--i': w } as React.CSSProperties}
        >
          {word}{w < words.length - 1 ? ' ' : ''}
        </span>
      ))
    : line.text;

  return seekable && onSeek ? (
    <button
      type="button"
      className="lyrics__line lyrics__line--seek"
      onClick={() => onSeek(index)}
      title="Set the sync to this line"
      {...shared}
    >
      {content}
    </button>
  ) : (
    <p className="lyrics__line" {...shared}>{content}</p>
  );
});

/* ------------------------------------------------------------------------ */

function LyricStageInner({ lines, activeIndex, synced, getPosition, onSeekToLine }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const litFrame = useRef(0);

  /** How far the reel is shifted, in pixels. Negative moves it upward. */
  const [shift, setShift] = useState(0);

  // Stable identity, so memoised rows are not invalidated on every render.
  const attach = useCallback((index: number, el: HTMLElement | null) => {
    lineRefs.current[index] = el;
  }, []);

  /**
   * Positions the reel so the active line sits on the focal point.
   *
   * The movement itself is a CSS transition on `transform`, not a JavaScript
   * animation. That is the whole point of this rewrite: the previous version
   * wrote `scrollTop` on every frame from a requestAnimationFrame loop, and
   * scroll offsets cannot be handed to the compositor — every step ran on the
   * main thread and competed with React, so the glide between lines never felt
   * clean. A transform transition is composited off the main thread and stays
   * smooth even while the app is busy.
   *
   * Measurement uses `offsetTop`, which is a layout value and is unaffected by
   * the transform currently applied. That means it stays correct even when a
   * new line becomes active mid-transition — reading `getBoundingClientRect`
   * instead would measure the element's in-flight animated position and the
   * error would compound with every interruption.
   */
  const align = useCallback(() => {
    if (!synced) return;
    const viewport = viewportRef.current;
    const el = lineRefs.current[Math.max(0, activeIndex)];
    if (!viewport || !el) return;

    const focal = viewport.clientHeight * FOCAL_RATIO;
    setShift(focal - (el.offsetTop + el.offsetHeight / 2));
  }, [activeIndex, synced]);

  // useLayoutEffect so the reel is never painted at the old position first.
  useLayoutEffect(align, [align]);

  // Re-measure when geometry shifts underneath us: the webfont finishing its
  // swap changes every line's height, and a resize changes the wrapping.
  // Neither is an activeIndex change, so neither is caught above.
  useEffect(() => {
    if (!synced) return;
    let cancelled = false;
    const settle = () => { if (!cancelled) align(); };

    void document.fonts?.ready.then(settle);
    window.addEventListener('resize', settle);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', settle);
    };
  }, [align, synced]);

  /**
   * Lights the active line up word by word as it is sung.
   *
   * LRC carries per-line timings only, so word positions are interpolated
   * across the line's duration — an approximation, which is why words brighten
   * on a ramp rather than snapping on like a hard karaoke wipe.
   *
   * It writes one CSS custom property straight to the DOM each frame rather
   * than going through React state, so it runs at a true 60fps and the lyric
   * list never re-renders. The per-word arithmetic is done in CSS from that
   * single number.
   */
  useEffect(() => {
    const el = lineRefs.current[activeIndex];
    if (!synced || !el || activeIndex < 0) return;

    const start = lines[activeIndex]?.time ?? 0;
    const end = lines[activeIndex + 1]?.time ?? start + LAST_LINE_SECONDS;
    const span = Math.max(0.35, end - start);
    const words = Number(el.dataset.words ?? 1);

    const tick = () => {
      const progress = Math.min(1, Math.max(0, (getPosition() - start) / span));
      // +0.85 so the first word is already lit as the line arrives, rather
      // than the line sitting dark for a beat.
      el.style.setProperty('--lit', String(progress * words + 0.85));
      litFrame.current = requestAnimationFrame(tick);
    };

    litFrame.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(litFrame.current);
      el.style.removeProperty('--lit');
    };
  }, [activeIndex, lines, synced, getPosition]);

  if (lines.length === 0) return null;

  return (
    <div
      className="lyrics screen-in"
      ref={viewportRef}
      id="main"
      data-mode={synced ? 'synced' : 'static'}
      tabIndex={0}
      role="region"
      aria-label="Lyrics"
    >
      {!synced && (
        <p className="label lyrics__notice">Only unsynced lyrics exist for this track</p>
      )}

      <div
        className="lyrics__reel"
        style={synced ? { transform: `translate3d(0, ${shift}px, 0)` } : undefined}
      >
        {lines.map((line, i) => (
          <LyricRow
            key={`${line.time}-${i}`}
            line={line}
            index={i}
            distance={Math.min(MAX_DISTANCE, Math.abs(i - activeIndex))}
            isActive={i === activeIndex}
            isPast={i < activeIndex}
            seekable={synced && Boolean(onSeekToLine)}
            onSeek={onSeekToLine}
            attach={attach}
          />
        ))}
      </div>

      <div className="lyrics__fade lyrics__fade--top" aria-hidden="true" />
      <div className="lyrics__fade lyrics__fade--bottom" aria-hidden="true" />
    </div>
  );
}

/*
 * The app re-renders ten times a second to drive the clock. Without this the
 * entire lyric view would be reconciled on every one of those ticks, even
 * though none of its props changed — all of them are either stable values or
 * memoised callbacks, and activeIndex only changes a few times a minute.
 */
export const LyricStage = memo(LyricStageInner);
