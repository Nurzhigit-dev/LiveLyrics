import type { AppPhase } from '../types';
import './StatusBar.css';

/** The short label and dot colour for each phase. */
const PHASE_LABEL: Record<AppPhase, string> = {
  idle:        'standby',
  listening:   'listening',
  identifying: 'matching',
  fetching:    'loading lyrics',
  synced:      'in sync',
  nomatch:     'no match',
  error:       'error',
};

interface Props {
  phase: AppPhase;
  /** Right-hand readouts, e.g. sample rate. Rendered in order. */
  readouts?: string[];
}

/**
 * The thin instrument bar across the top.
 *
 * Deliberately styled like hardware: monospace, uppercase, tracked-out, one
 * hairline rule underneath. It gives the page a fixed horizon line so the
 * enormous type below has something to sit against.
 */
export function StatusBar({ phase, readouts = [] }: Props) {
  const live = phase === 'listening' || phase === 'identifying';

  return (
    <header className="statusbar">
      <div className="statusbar__group">
        {/*
          role="status" + aria-live announces phase changes to a screen reader
          without stealing focus. The dot is decorative, so the text carries
          the meaning — colour is never the only signal.
        */}
        <span
          className={`statusbar__dot statusbar__dot--${phase}`}
          aria-hidden="true"
        />
        <span className="label statusbar__phase" role="status" aria-live="polite">
          {PHASE_LABEL[phase]}
        </span>
      </div>

      <div className="statusbar__group statusbar__group--end">
        {readouts.map((r) => (
          <span key={r} className="label readout statusbar__readout">
            {r}
          </span>
        ))}
        <span className="label statusbar__mark">
          Lyricwave<span aria-hidden="true"> ●</span>
        </span>
      </div>

      {/* Only rendered while the mic is genuinely open — a fake activity bar
          that runs when nothing is happening is a small lie the UI shouldn't tell. */}
      {live && <span className="statusbar__scan" aria-hidden="true" />}
    </header>
  );
}
