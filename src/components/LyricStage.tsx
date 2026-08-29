import { useCallback, useEffect, useRef } from 'react';
import type { LyricLine } from '../types';
import './LyricStage.css';

interface Props {
  lines: LyricLine[];
  /** Index of the line currently being sung, or -1 before the first. */
  activeIndex: number;
  /** False when only unsynced plain lyrics were available. */
  synced: boolean;
  /** Called when a line is clicked, to re-anchor the clock to that moment. */
  onSeekToLine?: (index: number) => void;
}

/** The active line sits slightly above centre — the eye reads better with
 *  more of the song ahead of it than behind. */
const FOCAL_RATIO = 0.42;

/** Beyond this many lines from the active one, everything looks the same. */
const MAX_DISTANCE = 4;

export function LyricStage({ lines, activeIndex, synced, onSeekToLine }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);

  /**
   * Brings the active line to the focal point.
   *
   * This started out as manual offsetTop arithmetic driving a CSS transform,
   * and it was quietly wrong most of the time: the numbers went stale whenever
   * the webfont swapped in, whenever a line rewrapped, and whenever the
   * viewport resized (the reel's padding is in vh, so it moved too). The
   * measured offset and the rendered position drifted hundreds of pixels apart.
   *
   * Letting the container be a real scroll container fixes all of those at
   * once, because the geometry is read live from the rendered box at the
   * moment we scroll, instead of being cached in React state. It also means
   * the user can scroll back to re-read a line, which the transform could not
   * support at all.
   */
  const alignToActive = useCallback((smooth: boolean) => {
    if (!synced) return;

    const viewport = viewportRef.current;
    const el = lineRefs.current[Math.max(0, activeIndex)];
    if (!viewport || !el) return;

    // Measured from the live rects rather than offsetTop, so it does not care
    // what the offsetParent happens to be or how the reel is padded.
    const viewportRect = viewport.getBoundingClientRect();
    const lineRect = el.getBoundingClientRect();
    const lineCentre = lineRect.top + lineRect.height / 2 - viewportRect.top;
    const delta = lineCentre - viewport.clientHeight * FOCAL_RATIO;

    if (Math.abs(delta) < 1) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    viewport.scrollTo({
      top: viewport.scrollTop + delta,
      behavior: smooth && !reduced ? 'smooth' : 'auto',
    });
  }, [activeIndex, synced]);

  // Follow the song.
  useEffect(() => { alignToActive(true); }, [alignToActive]);

  /*
   * Re-align when the geometry moves underneath us: the webfont finishing its
   * swap changes every line's height, and a resize changes both the wrapping
   * and the container. Neither of these is an activeIndex change, so neither
   * would be caught by the effect above.
   */
  useEffect(() => {
    if (!synced) return;

    let cancelled = false;
    const jump = () => { if (!cancelled) alignToActive(false); };

    void document.fonts?.ready.then(jump);

    const onResize = () => jump();
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
  }, [alignToActive, synced]);

  if (lines.length === 0) return null;

  return (
    <div
      className="lyrics"
      ref={viewportRef}
      id="main"
      data-mode={synced ? 'synced' : 'static'}
      tabIndex={0}
      role="region"
      aria-label="Lyrics"
    >
      {!synced && (
        <p className="label lyrics__notice">
          Only unsynced lyrics exist for this track
        </p>
      )}

      <div className="lyrics__reel">
        {lines.map((line, i) => {
          const distance = Math.min(MAX_DISTANCE, Math.abs(i - activeIndex));
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;

          // An empty line in an LRC file is an instrumental gap, not a bug —
          // it earns a marker rather than collapsing to nothing.
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

          const shared = {
            ref: (el: HTMLElement | null) => { lineRefs.current[i] = el; },
            'data-distance': distance,
            'data-active': isActive || undefined,
            'data-past': isPast || undefined,
            'aria-current': isActive ? ('true' as const) : undefined,
          };

          return synced && onSeekToLine ? (
            <button
              key={`${line.time}-${i}`}
              type="button"
              className="lyrics__line lyrics__line--seek"
              onClick={() => onSeekToLine(i)}
              title="Jump the sync to this line"
              {...shared}
            >
              <span className="lyrics__text">{line.text}</span>
            </button>
          ) : (
            <p key={`${line.time}-${i}`} className="lyrics__line" {...shared}>
              <span className="lyrics__text">{line.text}</span>
            </p>
          );
        })}
      </div>

      {/* Fades the type out at the top and bottom edges so lines dissolve
          rather than being guillotined by the container. */}
      <div className="lyrics__fade lyrics__fade--top" aria-hidden="true" />
      <div className="lyrics__fade lyrics__fade--bottom" aria-hidden="true" />
    </div>
  );
}
