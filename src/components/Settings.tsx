import { useEffect, useId, useRef, useState } from 'react';
import type { Credentials } from '../lib/acrcloud';
import { normaliseHost } from '../lib/credentials';
import './Settings.css';

interface Props {
  open: boolean;
  initial: Credentials | null;
  onSave: (creds: Credentials) => void;
  onClear: () => void;
  onDismiss: () => void;
}

/**
 * Where the user pastes their own ACRCloud keys.
 *
 * Built on the native <dialog> element rather than a hand-rolled overlay:
 * it gives focus trapping, Escape-to-close, inertness of the page behind it
 * and correct screen-reader semantics for free. Reimplementing all of that by
 * hand is the usual source of inaccessible modals.
 */
export function Settings({ open, initial, onSave, onClear, onDismiss }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ids = { host: useId(), key: useId(), secret: useId() };

  const [host, setHost] = useState(initial?.host ?? '');
  const [accessKey, setAccessKey] = useState(initial?.accessKey ?? '');
  const [accessSecret, setAccessSecret] = useState(initial?.accessSecret ?? '');
  const [revealSecret, setRevealSecret] = useState(false);
  const [touched, setTouched] = useState(false);

  // Re-seed the fields whenever the dialog is reopened, so a cancelled edit
  // doesn't linger the next time it appears.
  useEffect(() => {
    if (!open) return;
    setHost(initial?.host ?? '');
    setAccessKey(initial?.accessKey ?? '');
    setAccessSecret(initial?.accessSecret ?? '');
    setRevealSecret(false);
    setTouched(false);
  }, [open, initial]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const cleanHost = normaliseHost(host);
  const errors = {
    host: !cleanHost
      ? 'Required.'
      : !cleanHost.includes('.')
        ? 'That doesn’t look like a host name.'
        : '',
    accessKey: accessKey.trim() ? '' : 'Required.',
    accessSecret: accessSecret.trim() ? '' : 'Required.',
  };
  const valid = !errors.host && !errors.accessKey && !errors.accessSecret;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSave({
      host: cleanHost,
      accessKey: accessKey.trim(),
      accessSecret: accessSecret.trim(),
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings"
      /* Fires for Escape and for the backdrop close, so both routes are
         handled in one place. */
      onClose={onDismiss}
      aria-labelledby={`${ids.host}-title`}
    >
      <form className="settings__form" onSubmit={handleSubmit}>
        <header className="settings__head">
          <h2 className="settings__title" id={`${ids.host}-title`}>
            Recognition keys
          </h2>
          <button
            type="button"
            className="settings__close"
            onClick={onDismiss}
            aria-label="Close settings"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </header>

        <p className="settings__intro">
          Identification runs on{' '}
          <a href="https://www.acrcloud.com" target="_blank" rel="noreferrer noopener">
            ACRCloud
          </a>
          . Their free tier needs no card. Create an{' '}
          <em>Audio &amp; Video Recognition</em> project and copy its three
          values from the console.
        </p>

        <Field
          id={ids.host}
          label="Host"
          hint="Looks like identify-eu-west-1.acrcloud.com"
          value={host}
          onChange={setHost}
          error={touched ? errors.host : ''}
          autoComplete="off"
        />

        <Field
          id={ids.key}
          label="Access key"
          value={accessKey}
          onChange={setAccessKey}
          error={touched ? errors.accessKey : ''}
          autoComplete="off"
        />

        <Field
          id={ids.secret}
          label="Secret key"
          value={accessSecret}
          onChange={setAccessSecret}
          error={touched ? errors.accessSecret : ''}
          type={revealSecret ? 'text' : 'password'}
          autoComplete="off"
          trailing={
            <button
              type="button"
              className="settings__reveal"
              onClick={() => setRevealSecret((v) => !v)}
              aria-pressed={revealSecret}
            >
              {revealSecret ? 'Hide' : 'Show'}
            </button>
          }
        />

        <p className="settings__privacy">
          Stored only in this browser. Nothing is sent anywhere except ACRCloud
          when you press Listen, and the keys never reach the source code or a
          published build.
        </p>

        <footer className="settings__actions">
          {initial && (
            <button type="button" className="settings__btn settings__btn--ghost" onClick={onClear}>
              Forget keys
            </button>
          )}
          <button type="submit" className="settings__btn settings__btn--go">
            Save keys
          </button>
        </footer>
      </form>
    </dialog>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  trailing?: React.ReactNode;
}

/**
 * One labelled input. The label is a real <label>, always visible — a
 * placeholder disappears the moment someone starts typing, which leaves them
 * with no way to check what a half-filled field was asking for.
 */
function Field({
  id, label, value, onChange, hint, error, type = 'text', autoComplete, trailing,
}: FieldProps) {
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;

  return (
    <div className="field">
      <label className="label field__label" htmlFor={id}>{label}</label>

      <div className={`field__box ${error ? 'field__box--error' : ''}`}>
        <input
          id={id}
          className="field__input"
          type={type}
          value={value}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={[hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
        />
        {trailing}
      </div>

      {/* Hint stays put; the error replaces nothing and is announced when it
          appears, so a screen reader hears the problem without losing the hint. */}
      {hint && <p className="field__hint" id={hintId}>{hint}</p>}
      {error && (
        <p className="field__error" id={errId} role="alert">{error}</p>
      )}
    </div>
  );
}
