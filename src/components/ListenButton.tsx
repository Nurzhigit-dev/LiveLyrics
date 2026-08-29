import './ListenButton.css';

interface Props {
  onClick: () => void;
  /** True while the mic is open — flips the button into its stop state. */
  active?: boolean;
  disabled?: boolean;
}

/**
 * The one primary action on the screen.
 *
 * Icons are hand-written inline SVG rather than an icon library: the app needs
 * exactly two glyphs, so pulling in a whole package would be more weight than
 * code. They inherit `currentColor`, so they recolour with the button state
 * for free.
 */
export function ListenButton({ onClick, active = false, disabled = false }: Props) {
  return (
    <button
      type="button"
      className={`listen ${active ? 'listen--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      /* The visible text already says what this does, so no aria-label is
         needed — but the state is not obvious from text alone, so announce it. */
      aria-pressed={active}
    >
      <span className="listen__icon" aria-hidden="true">
        {active ? <StopGlyph /> : <MicGlyph />}
      </span>
      <span className="listen__text">{active ? 'Stop' : 'Listen'}</span>
      <span className="listen__corner" aria-hidden="true" />
    </button>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="square" strokeLinejoin="miter">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );
}
