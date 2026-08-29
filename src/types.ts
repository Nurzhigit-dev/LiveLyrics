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
  | 'nomatch'      // heard something, recognised nothing
  | 'error';       // mic denied, offline, bad key, etc.

/** A track, once we know what it is. */
export interface Track {
  title: string;
  artist: string;
  album?: string;
  /** Total length in seconds, when the source reports it. */
  duration?: number;
  /** Where in the song the room was when we sampled it, in seconds.
   *  This is what makes ambient sync possible at all. */
  offset?: number;
}

/** One timed line of a lyric file. */
export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number;
  text: string;
}

/** What the app is currently listening through. Only one source exists today;
 *  the union is here so adding another later doesn't mean a refactor. */
export type SourceId = 'mic';

export interface AppError {
  /** Short machine-readable reason, used to pick the recovery action. */
  code: 'mic-denied' | 'mic-unavailable' | 'no-key' | 'network' | 'unknown';
  /** Plain sentence shown to the user: what happened and what to do. */
  message: string;
}
