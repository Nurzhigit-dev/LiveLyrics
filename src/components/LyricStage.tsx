import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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

/** How long the reel takes to glide to a new line. */
const SCROLL_MS = 720;

/** Assumed length of the final line, which has no following timestamp. */
const LAST_LINE_SECONDS = 4;

export function LyricStage({
  lines, activeIndex, synced, getPosition, onSeekToLine,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const scrollFrame = useRef(0);
  const litFrame = useRef(0);

  const reduced = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /**
   * Glides the reel so the active line lands on the focal point.
   *
   * This is a hand-rolled scroll animation rather than
   * `scrollTo({behavior:'smooth'})` because the native one has a fixed,
   * platform-defined curve and duration that cannot be matched to the rest of
   * the app's motion — it lands with a noticeable stutter next to everything
   * else. A quartic ease-out gives a long, calm tail that suits a song.
   *
   * Geometry is read live from the rendered boxes each time, so nothing goes
   * stale when the webfont swaps in or a line rewraps.
   */
  const glideToActive = useCallback((animate: boolean) => {
    if (!synced) return;
    const viewport = viewportRef.current;
    const el = lineRefs.current[Math.max(0, activeIndex)];
    if (!viewport || !el) return;

    const viewportRect = viewport.getBoundingClientRect();
    const lineRect = el.getBoundingClientRect();
    const centre = lineRect.top + lineRect.height / 2 - viewportRect.top;
    const target = viewport.scrollTop + centre - viewport.clientHeight * FOCAL_RATIO;

    cancelAnimationFrame(scrollFrame.current);

    if (!animate || reduced()) {
      viewport.scrollTop = target;
      return;
    }

    const from = viewport.scrollTop;
    const delta = target - from;
    if (Math.abs(delta) < 1) return;

    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / SCROLL_MS);
      const eased = 1 - (1 - t) ** 4;
      viewport.scrollTop = from + delta * eased;
      if (t < 1) scrollFrame.current = requestAnimationFrame(step);
    };
    scrollFrame.current = requestAnimationFrame(step);
  }, [activeIndex, synced]);

  // Follow the song. useLayoutEffect so the first frame is never drawn at the
  // old position.
  useLayoutEffect(() => {
    glideToActive(true);
    return () => cancelAnimationFrame(scrollFrame.current);
  }, [glideToActive]);

  // Re-align when geometry shifts underneath us. The webfont finishing its
  // swap changes every line's height, and a resize changes the wrapping —
  // neither is an activeIndex change, so neither is caught above.
  useEffect(() => {
    if (!synced) return;
    let cancelled = false;
    const settle = () => { if (!cancelled) glideToActive(false); };

    void document.fonts?.ready.then(settle);
    window.addEventListener('resize', settle);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', settle);
    };
  }, [glideToActive, synced]);

  /**
   * Lights the active line up word by word as it is sung.
   *
   * LRC files only carry per-line timings, so word positions are interpolated
   * across the line's duration. It is an approximation, which is why words
   * brighten on a soft ramp rather than snapping on like a hard karaoke wipe.
   *
   * It writes a single CSS custom property straight to the DOM each frame
   * instead of going through React state. That keeps it at a genuine 60fps
   * and avoids re-rendering the whole lyric list on every tick — the CSS does
   * the per-word arithmetic from that one number.
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
      // than the line appearing completely dark for a beat.
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

      <div className="lyrics__reel">
        {lines.map((line, i) => {
          const distance = Math.min(MAX_DISTANCE, Math.abs(i - activeIndex));
          const isActive = i === activeIndex;

          // An empty LRC line is an instrumental gap, not a bug.
          if (!line.text) {
            return (
              <div
                key={`${line.time}-${i}`}
                ref={(el) => { lineRefs.current[i] = el; }}
                className="lyrics__rest"
                data-active={isActive || undefined}
                aria-hidden="true"
              >
                <span /><span /><span />
              </div>
            );
          }

          const words = line.text.split(/\s+/);
          const shared = {
            ref: (el: HTMLElement | null) => { lineRefs.current[i] = el; },
            'data-distance': distance,
            'data-active': isActive || undefined,
            'data-past': i < activeIndex || undefined,
            'data-words': words.length,
            'aria-current': isActive ? ('true' as const) : undefined,
          };

          // Only the active line is split into words. Every other line is a
          // single text node, which keeps the DOM small on a 200-line song.
          const content = isActive && synced ? (
            words.map((word, w) => (
              <span
                key={`${w}-${word}`}
                className="lyrics__word"
                style={{ '--i': w } as React.CSSProperties}
              >
                {word}
                {w < words.length - 1 ? ' ' : ''}
              </span>
            ))
          ) : (
            line.text
          );

          return synced && onSeekToLine ? (
            <button
              key={`${line.time}-${i}`}
              type="button"
              className="lyrics__line lyrics__line--seek"
              onClick={() => onSeekToLine(i)}
              title="Set the sync to this line"
              {...shared}
            >
              {content}
            </button>
          ) : (
            <p key={`${line.time}-${i}`} className="lyrics__line" {...shared}>
              {content}
            </p>
          );
        })}
      </div>

      <div className="lyrics__fade lyrics__fade--top" aria-hidden="true" />
      <div className="lyrics__fade lyrics__fade--bottom" aria-hidden="true" />
    </div>
  );
}
