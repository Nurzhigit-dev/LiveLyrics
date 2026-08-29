import type { CSSProperties } from 'react';
import './ListenButton.css';

interface Props {
  onClick: () => void;
  /** True while the pipeline is running — flips the button to its stop state. */
  active?: boolean;
  /** Live input level 0..1, used to make the halo breathe with the room. */
  level?: number;
  disabled?: boolean;
}

/**
 * The one control in the app.
 *
 * A large circular target rather than a small rectangle: it is the only thing
 * to press, so it should read as the obvious thing to press. While recording,
 * the surrounding halo scales with the actual microphone level — the button
 * itself becomes the feedback, so you can see it is hearing the room without
 * looking anywhere else.
 */
export function ListenButton({ onClick, active = false, level = 0, disabled = false }: Props) {
  // Clamped so a loud room can't blow the halo out past its layout box.
  const halo = 1 + Math.min(0.42, level * 0.5);

  return (
    <div className="listen" style={{ '--halo': halo } as CSSProperties}>
      {/* Decorative rings. Idle: a slow breath inviting a press. Recording:
          driven by the live level instead. */}
      <span className="listen__ring listen__ring--1" aria-hidden="true" />
      <span className="listen__ring listen__ring--2" aria-hidden="true" />

      <button
        type="button"
        className="listen__btn"
        onClick={onClick}
        disabled={disabled}
        data-active={active || undefined}
        aria-pressed={active}
      >
        <span className="listen__icon" aria-hidden="true">
          {active ? <StopGlyph /> : <MicGlyph />}
        </span>
        <span className="listen__label">{active ? 'Stop' : 'Listen'}</span>
      </button>
    </div>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}
