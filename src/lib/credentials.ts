import type { Credentials } from './acrcloud';

/**
 * Storage for the user's own ACRCloud keys.
 *
 * Deliberately localStorage and nothing else. The obvious alternative — a
 * .env file read through `import.meta.env.VITE_*` — is a trap with Vite:
 * those values are inlined into the production bundle at build time, so the
 * moment you deployed the site your secret key would ship inside a public
 * JavaScript file for anyone to read.
 *
 * Keeping keys in localStorage means:
 *   - nothing secret is ever in the repo or the build output
 *   - the site is safe to publish on GitHub Pages
 *   - each person who uses it brings their own free key
 *
 * The trade-off is that the key lives in the browser, so it is readable by
 * anyone with access to that browser profile. For a personal key on your own
 * machine that's the right call; it is not a model for a multi-user product.
 */

const STORAGE_KEY = 'lyricwave.acrcloud';

/** Every read is wrapped: private mode and blocked site data both throw. */
export function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    if (!parsed.host || !parsed.accessKey || !parsed.accessSecret) return null;
    return {
      host: parsed.host,
      accessKey: parsed.accessKey,
      accessSecret: parsed.accessSecret,
    };
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // Storage full or blocked. The app still works for this session, so
    // failing silently is better than blocking the user on a save error.
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Users paste the host straight out of the ACRCloud console, which sometimes
 * carries a protocol or a trailing slash. Strip both rather than failing with
 * an unhelpful network error later.
 */
export function normaliseHost(input: string): string {
  return input.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}
