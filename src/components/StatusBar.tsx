import type { AppPhase } from '../types';
import './StatusBar.css';

/** The short label shown for each phase. */
const PHASE_LABEL: Record<AppPhase, string> = {
  idle: 'standby',
  listening: 'listening',
  identifying: 'matching',
  fetching: 'loading lyrics',
  synced: 'in sync',
  nomatch: 'no match',
  error: 'error',
};

/** Number of segments in the input meter. */
const METER_SEGMENTS = 12;

interface Props {
  phase: AppPhase;
  /** Right-hand readouts. Only pass values that are true right now. */
  readouts?: string[];
  /** Live input loudness, 0..1. Only meaningful while recording. */
  level?: number;
  hasKeys: boolean;
  onOpenSettings: () => void;
}

/**
 * The thin instrument bar across the top.
 *
 * Styled like hardware — monospace, uppercase, one hairline rule underneath —
 * so the huge type below has a fixed horizon to sit against.
 */
export function StatusBar({ phase, readouts = [], level = 0, hasKeys, onOpenSettings }: Props) {
  const recording = phase === 'listening';
  const live = recording || phase === 'identifying';

  return (
    <header className="statusbar">
      <div className="statusbar__group">
        {/* The dot is decorative; the text beside it carries the meaning, so
            state is never signalled by colour alone. */}
        <span className={`statusbar__dot statusbar__dot--${phase}`} aria-hidden="true" />
        <span className="label statusbar__phase" role="status" aria-live="polite">
          {PHASE_LABEL[phase]}
        </span>

        {/* A real meter driven by the actual input level: it is the difference
            between "is this thing even on?" and knowing the mic can hear the
            room before waiting eight seconds to find out. */}
        {recording && (
          <span className="statusbar__meter" aria-hidden="true">
            {Array.from({ length: METER_SEGMENTS }, (_, i) => (
              <span
                key={i}
                className="statusbar__seg"
                data-lit={level * METER_SEGMENTS > i || undefined}
                data-hot={i >= METER_SEGMENTS - 3 || undefined}
              />
            ))}
          </span>
        )}
      </div>

      <div className="statusbar__group statusbar__group--end">
        {readouts.map((r) => (
          <span key={r} className="label readout statusbar__readout">{r}</span>
        ))}

        <button
          type="button"
          className="statusbar__settings"
          onClick={onOpenSettings}
          aria-label={hasKeys ? 'Recognition keys' : 'Add recognition keys'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
          </svg>
          {/* A dot, not a red badge: keys missing is a setup step, not an error. */}
          {!hasKeys && <span className="statusbar__badge" aria-hidden="true" />}
        </button>

        <span className="label statusbar__mark">Lyricwave</span>
      </div>

      {/* Only rendered while the mic is genuinely open — an activity line that
          runs when nothing is happening is a small lie the UI shouldn't tell. */}
      {live && <span className="statusbar__scan" aria-hidden="true" />}
    </header>
  );
}
