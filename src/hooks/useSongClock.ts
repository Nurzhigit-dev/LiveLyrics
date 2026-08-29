import { useEffect, useState } from 'react';

/**
 * Where the song was, and when we knew it.
 *
 * `startedAt` is a performance.now() reading from the moment the microphone
 * began recording — not the moment the API replied. ACRCloud reports the
 * offset for the *start* of the sample it was given, so anchoring to the start
 * of the recording makes both the recording duration and the network round
 * trip cancel out on their own. Anchoring to the reply instead would leave the
 * lyrics permanently running a couple of seconds behind.
 */
export interface Anchor {
  /** performance.now() when recording began. */
  startedAt: number;
  /** Seconds into the song at that instant. */
  songPosition: number;
}

/**
 * Turns an anchor into a live playback position.
 *
 * The position is *derived*, never accumulated — it is recomputed from the
 * wall clock on every frame. That means it stays correct even if the tab is
 * backgrounded (where requestAnimationFrame stops firing entirely) or the
 * device sleeps: on return it simply reads the current time and lands in the
 * right place, instead of resuming from wherever a counter had got to.
 *
 * @param nudge  Manual correction in seconds, for when the room is ahead of
 *               or behind the lyrics.
 */
export function useSongClock(anchor: Anchor | null, nudge = 0): number {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!anchor) {
      setPosition(0);
      return;
    }

    let frame = 0;
    let lastTenth = -1;

    const tick = () => {
      const elapsed = (performance.now() - anchor.startedAt) / 1000;
      const next = anchor.songPosition + elapsed + nudge;

      // React only needs to hear about this ten times a second. The progress
      // bar and timecode both interpolate smoothly across that gap, and it
      // keeps a fifty-line lyric list from re-rendering at 60fps for nothing.
      const tenth = Math.round(next * 10);
      if (tenth !== lastTenth) {
        lastTenth = tenth;
        setPosition(next);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [anchor, nudge]);

  return position;
}
