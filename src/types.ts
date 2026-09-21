/**
 * Shared shapes for the whole app.
 *
 * Defining the state machine up front — even before the mic and lyrics code
 * exists — means the UI can be built and reviewed against every state it will
 * ever be in, instead of only the happy path.
 */

/** Every screen the app can be in. The UI is a pure function of this. */
export type AppPhase =
  | 'idle'         // nothing happening; waiting for the user to start
  | 'listening'    // mic is open, capturing a sample
  | 'identifying'  // sample sent, waiting on a match
  | 'fetching'     // matched; pulling the synced lyrics
  | 'synced'       // lyrics are on screen and scrolling with the song
  | 'paused'       // the room went quiet; the clock is held until sound returns
  | 'nomatch'      // heard something, recognised nothing
  | 'error';       // mic denied, offline, bad key, etc.

/** A track, once we know what it is. */
export interface Track {
  /** The recogniser's own id for this recording, when it gives one. */
  id?: string;
  title: string;
  artist: string;
  album?: string;
  /** Total length in seconds, when the source reports it. */
  duration?: number;
  /** Where in the song the room was when we sampled it, in seconds.
   *  This is what makes ambient sync possible at all. */
  offset?: number;
  /** Recogniser confidence, 0-100. A low score usually means the position
   *  is unreliable even when the title is right. */
  score?: number;
  /** Every spelling of the title the recogniser knows — other scripts too. */
  titleVariants?: string[];
  artistVariants?: string[];
}

/** One recognition: the best match, plus the alternatives it considered. */
export interface Identification {
  track: Track;
  candidates: Track[];
}

/** One timed line of a lyric file. */
export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number;
  text: string;
}

/**
 * What the app is listening through.
 *
 * 'mic'    — the room, through the microphone.
 * 'device' — this computer's own sound, through a shared tab or screen. The
 *            audio arrives clean instead of being re-recorded off a speaker,
 *            so it recognises far more reliably and hears track changes the
 *            moment they happen. The cost is a browser that supports it and a
 *            share prompt each time.
 */
export type SourceId = 'mic' | 'device';

export interface AppError {
  /** Short machine-readable reason, used to pick the recovery action. */
  code:
    | 'mic-denied'
    | 'mic-unavailable'
    | 'share-denied'
    | 'share-unavailable'
    | 'share-silent'
    | 'share-ended'
    | 'no-key'
    | 'network'
    | 'unknown';
  /** Plain sentence shown to the user: what happened and what to do. */
  message: string;
}
