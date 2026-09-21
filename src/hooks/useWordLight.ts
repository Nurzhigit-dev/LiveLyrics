import { useEffect } from 'react';
import type { LyricLine } from '../types';
import { useFrameHost } from '../lib/frames';

/** Assumed length of the final line, which has no following timestamp. */
const LAST_LINE_SECONDS = 4;

interface Options {
  /** The element carrying the words. Stable, or the loop restarts each render. */
  getEl: () => HTMLElement | null;
  lines: LyricLine[];
  /** How long each line is actually sung for — see computeSungSpans. */
  spans?: number[];
  activeIndex: number;
  getPosition: () => number;
  enabled?: boolean;
}

/**
 * Lights the active line up word by word as it is sung.
 *
 * LRC carries per-line timings only, so word positions are interpolated across
 * the line's duration — an approximation, which is why words brighten on a
 * ramp rather than snapping on like a hard karaoke wipe.
 *
 * It writes one CSS custom property straight to the DOM each frame rather than
 * going through React state, so it runs at a true 60fps and no list of lines
 * re-renders. The per-word arithmetic is done in CSS from that single number.
 *
 * Shared by the main reel and the floating window, because the two constants
 * that make it look right — the sung span rather than the gap, and the small
 * head start — are the kind that drift apart the moment they exist twice.
 */
export function useWordLight({ getEl, lines, spans, activeIndex, getPosition, enabled = true }: Options): void {
  const frames = useFrameHost();

  useEffect(() => {
    const el = getEl();
    if (!enabled || !el || activeIndex < 0) return;

    const start = lines[activeIndex]?.time ?? 0;
    // The SUNG length of the line, not the gap to the next one: across an
    // instrumental break the gap would drag the highlight far behind the voice.
    const gap = (lines[activeIndex + 1]?.time ?? start + LAST_LINE_SECONDS) - start;
    const span = Math.max(0.35, spans?.[activeIndex] ?? gap);
    const words = Number(el.dataset.words ?? 1);

    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, Math.max(0, (getPosition() - start) / span));
      // +0.85 so the first word is already lit as the line arrives, rather
      // than the line sitting dark for a beat.
      el.style.setProperty('--lit', String(progress * words + 0.85));
      frame = frames.requestAnimationFrame(tick);
    };

    frame = frames.requestAnimationFrame(tick);
    return () => {
      frames.cancelAnimationFrame(frame);
      el.style.removeProperty('--lit');
    };
  }, [getEl, lines, spans, activeIndex, getPosition, enabled, frames]);
}
