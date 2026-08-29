import './SyncControls.css';

interface Props {
  nudge: number;
  synced: boolean;
  onNudge: (delta: number) => void;
  onRelisten: () => void;
  onReset: () => void;
  busy: boolean;
}

/** One press moves the lyrics half a second. Fine enough to land on the beat,
 *  coarse enough that a couple of taps fixes an obvious drift. */
const STEP = 0.5;

/**
 * Drift correction, sitting in the transport bar.
 *
 * Ambient sync is never going to be sample-accurate — the recogniser reports
 * where the sample began, and a fraction of a second gets lost to buffering on
 * the way. Rather than pretend that error doesn't exist, the app hands the
 * user a way to close it in two taps. Without this, being half a second out
 * makes the whole thing feel broken.
 */
export function SyncControls({ nudge, synced, onNudge, onRelisten, onReset, busy }: Props) {
  return (
    <div className="sync">
      {synced && (
        <div className="sync__group" role="group" aria-label="Adjust lyric timing">
          <button
            type="button"
            className="sync__step"
            onClick={() => onNudge(-STEP)}
            aria-label="Lyrics half a second earlier"
          >
            <Chevron dir="back" />
          </button>

          {/* Announces the current correction so a screen-reader user can hear
              the effect of a press, which the chevrons alone wouldn't convey. */}
          <span className="label readout sync__value" aria-live="polite">
            {nudge === 0 ? 'sync' : `${nudge > 0 ? '+' : ''}${nudge.toFixed(1)}`}
          </span>

          <button
            type="button"
            className="sync__step"
            onClick={() => onNudge(STEP)}
            aria-label="Lyrics half a second later"
          >
            <Chevron dir="forward" />
          </button>
        </div>
      )}

      <button
        type="button"
        className="sync__action"
        onClick={onRelisten}
        disabled={busy}
      >
        {busy ? 'Listening' : 'Listen again'}
      </button>

      <button type="button" className="sync__action sync__action--quiet" onClick={onReset}>
        Done
      </button>
    </div>
  );
}

function Chevron({ dir }: { dir: 'back' | 'forward' }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" aria-hidden="true">
      <path d={dir === 'back' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}
