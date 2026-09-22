import type { ReactNode } from 'react';
import type { AppPhase } from '../types';
import './StatusBar.css';

const PHASE_LABEL: Record<AppPhase, string> = {
  idle: 'ready',
  listening: 'listening',
  identifying: 'matching',
  fetching: 'loading lyrics',
  synced: 'in sync',
  paused: 'music stopped',
  nomatch: 'no match',
  waiting: 'waiting for the next song',
  error: 'error',
};

/** Bars in the input meter. */
const SEGMENTS = 14;

interface Props {
  phase: AppPhase;
  /** Right-hand readouts. Only pass values that are true right now. */
  readouts?: string[];
  /** Live input loudness, 0..1. Only meaningful while recording. */
  level?: number;
  /** Overrides the phase's own wording — e.g. a pause the listener asked for,
   *  rather than one we guessed at from the room going quiet. */
  label?: string;
  /** Session-level actions: starting over, and finishing. They live up here
   *  because they end things, and nothing that ends things belongs in the
   *  row of controls you use while a song is playing. */
  actions?: ReactNode;
}

export function StatusBar({ phase, readouts = [], level = 0, label, actions }: Props) {
  const recording = phase === 'listening';

  return (
    <header className="statusbar">
      <div className="statusbar__group">
        <span className="statusbar__mark">
          <span className="statusbar__glyph" aria-hidden="true" />
          LiveLyrics
        </span>

        <span className="statusbar__divider" aria-hidden="true" />

        {/* role="status" announces phase changes without stealing focus. The
            dot is decorative — the text carries the meaning, so state is never
            signalled by colour alone. */}
        <span className={`statusbar__dot statusbar__dot--${phase}`} aria-hidden="true" />
        <span className="label statusbar__phase" role="status" aria-live="polite">
          {label ?? PHASE_LABEL[phase]}
        </span>
      </div>

      <div className="statusbar__group statusbar__group--end">
        {/* A meter driven by the real RMS level, so it is genuine feedback:
            you can tell the mic is picking the room up without waiting the
            full seven seconds to find out. */}
        {recording && (
          <span className="statusbar__meter" aria-hidden="true">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span
                key={i}
                className="statusbar__seg"
                data-lit={level * SEGMENTS > i || undefined}
                data-hot={i >= SEGMENTS - 3 || undefined}
              />
            ))}
          </span>
        )}

        {readouts.map((r) => (
          <span key={r} className="label readout statusbar__readout">{r}</span>
        ))}

        {actions}
      </div>

      {/* Only rendered while the mic is genuinely open. An activity line that
          runs when nothing is happening is a small lie the UI shouldn't tell. */}
      {recording && <span className="statusbar__scan" aria-hidden="true" />}
    </header>
  );
}
