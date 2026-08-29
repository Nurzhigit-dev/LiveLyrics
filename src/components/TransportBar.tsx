import type { Track } from '../types';
import './TransportBar.css';

interface Props {
  track?: Track | null;
  /** Current position in the song, in seconds. */
  position?: number;
}

/** 214 -> "3:34". Padded so the digits never change width mid-song. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The fixed bar along the bottom: what is playing, and where in it we are.
 *
 * It stays mounted in every phase so the layout never jumps when a track
 * arrives — the content swaps in place instead of the bar appearing from
 * nowhere and shoving the stage upward.
 */
export function TransportBar({ track, position = 0 }: Props) {
  const duration = track?.duration ?? 0;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
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
              <span className="transport__title">{track!.title}</span>
              <span className="transport__sep" aria-hidden="true">—</span>
              <span className="transport__artist">{track!.artist}</span>
            </>
          ) : (
            <span className="label transport__empty">No signal</span>
          )}
        </div>

        <span className="label readout transport__time">
          {hasTrack ? `${formatTime(position)} / ${formatTime(duration)}` : '--:-- / --:--'}
        </span>
      </div>
    </footer>
  );
}
