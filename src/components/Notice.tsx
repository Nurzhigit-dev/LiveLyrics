import './Notice.css';

interface Props {
  /** Short uppercase category, e.g. "no match". */
  kind: string;
  /** One sentence: what happened. */
  title: string;
  /** One sentence: what to do about it. */
  detail?: string;
  tone?: 'neutral' | 'danger';
  /** Primary recovery action. Every notice should offer a way forward. */
  action?: { label: string; onClick: () => void };
  /** Optional escape hatch, e.g. "Edit keys". */
  secondary?: { label: string; onClick: () => void };
}

/**
 * The screen shown when something didn't work.
 *
 * Every instance carries a recovery action, because an error message that only
 * describes a dead end leaves the user with nothing to do but reload the page.
 */
export function Notice({ kind, title, detail, tone = 'neutral', action, secondary }: Props) {
  return (
    <main className="notice" id="main" data-tone={tone}>
      <div className="notice__body">
        {/* role="alert" so a screen reader hears this the moment it appears,
            without needing to go looking for it. */}
        <p className="label notice__kind" role="alert">{kind}</p>

        <h2 className="notice__title">{title}</h2>
        {detail && <p className="notice__detail">{detail}</p>}

        {(action || secondary) && (
          <div className="notice__actions">
            {action && (
              <button type="button" className="notice__btn notice__btn--go" onClick={action.onClick}>
                {action.label}
              </button>
            )}
            {secondary && (
              <button type="button" className="notice__btn" onClick={secondary.onClick}>
                {secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
