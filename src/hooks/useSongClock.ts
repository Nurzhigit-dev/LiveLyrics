import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Where the song was, and when we knew it.
 *
 * `startedAt` is a performance.now() reading from the moment the microphone
 * began recording — not the moment the server replied. The recogniser reports
 * the offset for the *start* of the sample it was given, so anchoring to the
 * start of the recording makes both the recording duration and the network
 * round trip cancel out on their own. Anchoring to the reply would leave the
 * lyrics permanently running several seconds behind.
 */
export interface Anchor {
  /** performance.now() when recording began. */
  startedAt: number;
  /** Seconds into the song at that instant. */
  songPosition: number;
}

export interface SongClock {
  /** Position in seconds, re-rendered ~10x/sec. For text and progress bars. */
  position: number;
  /**
   * Reads the exact position right now, without causing a render.
   *
   * Animation that needs to be smooth (the word-by-word lyric fill) runs its
   * own requestAnimationFrame loop and calls this each frame. Driving that
   * from React state instead would either cap the animation at the state
   * update rate or re-render the whole lyric list 60 times a second.
   */
  getPosition: () => number;
}

export function useSongClock(anchor: Anchor | null, nudge = 0): SongClock {
  const [position, setPosition] = useState(0);

  // Kept in refs so getPosition stays stable and always sees current values.
  const anchorRef = useRef(anchor);
  const nudgeRef = useRef(nudge);
  anchorRef.current = anchor;
  nudgeRef.current = nudge;

  const getPosition = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return 0;
    return a.songPosition + (performance.now() - a.startedAt) / 1000 + nudgeRef.current;
  }, []);

  useEffect(() => {
    if (!anchor) {
      setPosition(0);
      return;
    }

    let frame = 0;
    let lastTenth = -1;

    const tick = () => {
      const next = getPosition();

      // React only needs this ten times a second: the progress bar interpolates
      // across the gap in CSS, and it keeps a long lyric list from re-rendering
      // at 60fps for nothing.
      const tenth = Math.round(next * 10);
      if (tenth !== lastTenth) {
        lastTenth = tenth;
        setPosition(next);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [anchor, nudge, getPosition]);

  return { position, getPosition };
}
