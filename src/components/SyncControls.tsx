import './SyncControls.css';

/**
 * One press shifts the lyrics a quarter of a second.
 *
 * This was half a second, which was too coarse to land on a beat — and worse,
 * a nudge often produced no visible change at all, because the highlight only
 * moves when the clock crosses a line boundary. Press twice, see nothing, and
 * you reasonably conclude the button is broken. The word-by-word fill on the
 * active line is what actually fixed that: now every nudge moves something
 * immediately, whether or not a line change is due.
 */
export const NUDGE_STEP = 0.25;

interface Props {
  nudge: number;
  synced: boolean;
  onNudge: (delta: number) => void;
  onRelisten: () => void;
  onReset: () => void;
  busy: boolean;
}

export function SyncControls({ nudge, synced, onNudge, onRelisten, onReset, busy }: Props) {
  const offset = nudge === 0 ? '0.00' : `${nudge > 0 ? '+' : '−'}${Math.abs(nudge).toFixed(2)}`;

  return (
    <div className="sync">
      {synced && (
        <div className="sync__group" role="group" aria-label="Adjust lyric timing">
          <button
            type="button"
            className="sync__step"
            onClick={() => onNudge(-NUDGE_STEP)}
            aria-label="Lyrics a quarter second earlier"
          >
            <Chevron dir="back" />
          </button>

          <span className="sync__readout">
            {/* aria-live announces the new offset, which the chevrons alone
                could never convey to a screen reader. */}
            <span className="readout sync__value" aria-live="polite" data-offset={nudge !== 0 || undefined}>
              {offset}
            </span>
            <span className="sync__unit" aria-hidden="true">sync</span>
          </span>

          <button
            type="button"
            className="sync__step"
            onClick={() => onNudge(NUDGE_STEP)}
            aria-label="Lyrics a quarter second later"
          >
            <Chevron dir="forward" />
          </button>
        </div>
      )}

      <button type="button" className="sync__action" onClick={onRelisten} disabled={busy}>
        {busy ? 'Listening' : 'Again'}
      </button>

      <button type="button" className="sync__action sync__action--quiet" onClick={onReset}>
        Done
      </button>
    </div>
  );
}

function Chevron({ dir }: { dir: 'back' | 'forward' }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'back' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}
