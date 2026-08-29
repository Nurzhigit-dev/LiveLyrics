import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Where the song was, and when we knew it.
 *
 * `startedAt` is a performance.now() reading from the moment the microphone
 * began recording — not the moment the server replied. The recogniser reports
 * where the start of the submitted sample sits in the track, so anchoring to
 * the start of the recording makes both the recording duration and the network
 * round trip cancel out on their own.
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
   * The word-by-word lyric fill runs its own animation loop and calls this
   * each frame. Driving that from React state instead would either cap the
   * animation at the state update rate or re-render the lyric list 60 times
   * a second.
   */
  getPosition: () => number;
}

/**
 * Turns an anchor into a live playback position.
 *
 * The position is *derived*, never accumulated — recomputed from the wall
 * clock every frame. That keeps it correct when the tab is backgrounded and
 * requestAnimationFrame stops firing entirely: on return it reads the current
 * time and lands in the right place rather than resuming from a stale counter.
 *
 * @param nudge   Persistent timing correction, in seconds.
 * @param running When false the clock holds its last value — used when the
 *                room has gone quiet and the music is presumed paused.
 */
export function useSongClock(anchor: Anchor | null, nudge = 0, running = true): SongClock {
  const [position, setPosition] = useState(0);

  // Refs so getPosition stays a stable identity while always seeing current values.
  const anchorRef = useRef(anchor);
  const nudgeRef = useRef(nudge);
  anchorRef.current = anchor;
  nudgeRef.current = nudge;

  /** The position the clock was holding when it was paused. */
  const frozenRef = useRef<number | null>(null);

  const live = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return 0;
    return a.songPosition + (performance.now() - a.startedAt) / 1000 + nudgeRef.current;
  }, []);

  const getPosition = useCallback(
    () => frozenRef.current ?? live(),
    [live],
  );

  // Freeze on pause, and on resume shift the anchor forward by however long we
  // were stopped, so the held position continues from exactly where it was
  // rather than jumping ahead by the length of the pause.
  useEffect(() => {
    if (!running) {
      frozenRef.current = live();
      return;
    }
    const held = frozenRef.current;
    frozenRef.current = null;
    if (held !== null && anchorRef.current) {
      const a = anchorRef.current;
      a.startedAt = performance.now() - (held - a.songPosition - nudgeRef.current) * 1000;
    }
  }, [running, live]);

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
  }, [anchor, nudge, running, getPosition]);

  return { position, getPosition };
}
