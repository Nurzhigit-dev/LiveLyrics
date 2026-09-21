import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrameHost } from '../lib/frames';

/**
 * Where the song was, and when we knew it.
 *
 * `startedAt` is a performance.now() reading from the moment the audio that
 * was matched began — not the moment the server replied. The recogniser
 * reports the song position for the start of that audio, so anchoring there
 * makes the recording length and the network round trip cancel out on their
 * own.
 */
export interface Anchor {
  /** performance.now() at the start of the matched audio. */
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
 * @param nudge Persistent timing correction, in seconds.
 * @param hold  When set, the clock shows exactly this position and stands
 *              still — used while the music is paused. The caller decides
 *              WHICH position (the moment the silence began), which is what
 *              stops a pause from pushing the lyrics ahead.
 */
export function useSongClock(anchor: Anchor | null, nudge = 0, hold: number | null = null): SongClock {
  const [tick, setTick] = useState(0);

  /* Frames come from whichever window is on screen — this tab, or the pop-out
     when one is open. A hidden tab is never rendered, so its frames stop, and
     the clock would freeze the moment you switched away to the music. */
  const frames = useFrameHost();

  // Refs so getPosition stays a stable identity while always seeing current
  // values. Synced in a layout effect — before paint, before any animation
  // frame can read them — rather than during render.
  const anchorRef = useRef(anchor);
  const nudgeRef = useRef(nudge);
  const holdRef = useRef(hold);
  useLayoutEffect(() => {
    anchorRef.current = anchor;
    nudgeRef.current = nudge;
    holdRef.current = hold;
  });

  const getPosition = useCallback(() => {
    if (holdRef.current !== null) return holdRef.current;
    const a = anchorRef.current;
    if (!a) return 0;
    return a.songPosition + (performance.now() - a.startedAt) / 1000 + nudgeRef.current;
  }, []);

  useEffect(() => {
    let frame = 0;

    // Held or unanchored: park the ticking value on the held position. When
    // the clock restarts it then continues from there, instead of flashing
    // the position it had BEFORE the pause for a frame — enough to twitch the
    // lyric reel back a line and forward again.
    if (hold !== null || !anchor) {
      const parked = hold ?? 0;
      frame = frames.requestAnimationFrame(() => setTick(parked));
      return () => frames.cancelAnimationFrame(frame);
    }

    let lastTenth = -1;
    const loop = () => {
      const next = getPosition();

      // React only needs this ten times a second: the progress bar interpolates
      // across the gap in CSS, and it keeps a long lyric list from re-rendering
      // at 60fps for nothing.
      const tenth = Math.round(next * 10);
      if (tenth !== lastTenth) {
        lastTenth = tenth;
        setTick(next);
      }
      frame = frames.requestAnimationFrame(loop);
    };

    frame = frames.requestAnimationFrame(loop);
    return () => frames.cancelAnimationFrame(frame);
  }, [anchor, nudge, hold, getPosition, frames]);

  return { position: hold ?? (anchor ? tick : 0), getPosition };
}
