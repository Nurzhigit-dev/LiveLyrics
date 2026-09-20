import type { ReactNode } from 'react';
import type { Track } from '../types';
import { formatTime } from '../lib/time';
import './TransportBar.css';

interface Props {
  track?: Track | null;
  /** Current position in the song, in seconds. */
  position?: number;
  /** The single control in the middle of the bar. */
  centre?: ReactNode;
  /** Tools at the end: the timeline, and the language. */
  end?: ReactNode;
}

/**
 * The fixed bar along the bottom: what is playing, and where in it we are.
 *
 * It stays mounted in every phase so the layout never jumps when a track
 * arrives — the content swaps in place instead of the bar appearing from
 * nowhere and shoving the stage upward.
 *
 * Three cells rather than two. Everything used to pile into the right-hand
 * one, which put six controls in a row and gave the eye nowhere to start.
 * Now the song is on the left, the one control you actually reach for is in
 * the middle where it can be hit without looking, and the tools that change
 * how the lyrics read are at the end.
 */
export function TransportBar({ track, position = 0, centre, end }: Props) {
  const duration = track?.duration ?? 0;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const hasTrack = Boolean(track);

  return (
    <footer className="transport">
      {/* The progress hairline sits on the bar's top edge, doubling as the
          rule that separates it from the stage. */}
      <div
        className="transport__track"
        role="progressbar"
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={duration || 100}
        aria-valuenow={hasTrack ? Math.floor(position) : 0}
        aria-valuetext={
          hasTrack ? `${formatTime(position)} of ${formatTime(duration)}` : 'No song playing'
        }
      >
        <div className="transport__fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>

      <div className="transport__body">
        <div className="transport__meta">
          {hasTrack ? (
            <>
              {/* Stacked rather than on one row: a long title and a long
                  artist name would otherwise compete for the same space and
                  both end up truncated. The timecode joins the artist on the
                  second line, where it reads as a detail of the song rather
                  than as another control. */}
              <span className="transport__title">{track!.title}</span>
              <span className="transport__sub">
                <span className="transport__artist">{track!.artist}</span>
                <span className="label readout transport__time">
                  {formatTime(position)} / {formatTime(duration)}
                </span>
              </span>
            </>
          ) : (
            <span className="label transport__empty">Nothing playing</span>
          )}
        </div>

        <div className="transport__centre">{centre}</div>
        <div className="transport__end">{end}</div>
      </div>
    </footer>
  );
}
