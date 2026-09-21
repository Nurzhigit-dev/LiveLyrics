import { useCallback, useEffect, useState } from 'react';
import { setFrameHost } from '../lib/frames';

/**
 * A small always-on-top window showing the lyrics, outside the site.
 *
 * This is Document Picture-in-Picture: the browser gives back a real, empty,
 * floating window, and the page decides what goes in it. Ordinary popups can't
 * do this — they sit in the window stack like anything else and disappear the
 * moment you click on something. This one stays in front of whatever you are
 * doing, which is the entire point: you are here to watch the video, not the
 * lyrics site.
 *
 * Chrome and Edge have it. Firefox and Safari do not, and there is no polyfill
 * worth the name, so the button is hidden rather than offered and broken.
 */

interface PictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

const api = (): PictureInPicture | null =>
  typeof window !== 'undefined' && 'documentPictureInPicture' in window
    ? (window as unknown as { documentPictureInPicture: PictureInPicture }).documentPictureInPicture
    : null;

/**
 * Gives the new window the app's styles.
 *
 * A picture-in-picture document starts completely bare — it does not inherit
 * one rule from the page that opened it. Same-origin sheets can be read and
 * copied as text; a cross-origin one (the webfonts) throws on `cssRules`, so
 * it is re-linked by URL and the new window fetches it itself.
 */
function adoptStyles(target: Window): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const text = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
      const style = target.document.createElement('style');
      style.textContent = text;
      target.document.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = target.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.document.head.appendChild(link);
    }
  }
}

export function usePopOut() {
  const [win, setWin] = useState<Window | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = api() !== null;

  const close = useCallback(() => {
    // Closing fires 'pagehide', which is where the state is actually cleared —
    // so this stays correct when the listener closes the window themselves.
    win?.close();
  }, [win]);

  const open = useCallback(async () => {
    const pip = api();
    if (!pip || win) return;
    setError(null);

    /*
     * Having the API is not the same as being allowed to use it. An embedded
     * webview reports it and then refuses, because there is no desktop for a
     * floating window to float on; a browser can also refuse for want of a
     * user gesture. Either way the promise rejects, and an unhandled rejection
     * would leave the button looking simply broken.
     */
    let opened: Window;
    try {
      // Enough for three lines and the bar, once the browser's own title
      // strip has taken its share off the top.
      opened = await pip.requestWindow({ width: 480, height: 252 });
    } catch {
      setError('This browser wouldn’t open a floating window. Chrome and Edge on a computer can.');
      return;
    }

    adoptStyles(opened);
    opened.document.documentElement.lang = document.documentElement.lang || 'en';
    opened.document.body.classList.add('popout-body');

    opened.addEventListener('pagehide', () => {
      setFrameHost(null);
      setWin(null);
    }, { once: true });

    // Everything animated now beats in time with this window instead of the
    // tab, which is about to be behind something else and stop being rendered.
    setFrameHost(opened);
    setWin(opened);
  }, [win]);

  // Leaving a floating window behind after the app has gone would be a window
  // nobody owns and nothing updates.
  useEffect(() => () => { win?.close(); }, [win]);

  return { supported, win, error, open, close };
}
