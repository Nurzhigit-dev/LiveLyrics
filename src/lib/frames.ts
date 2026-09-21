import { useSyncExternalStore } from 'react';

/**
 * Which window's animation frames the app runs on.
 *
 * `requestAnimationFrame` only fires while the page is being *rendered*. A
 * hidden tab is not, so the moment you switch to YouTube the clock stops, the
 * lyrics freeze, and they lurch forward when you come back. That is fatal for
 * a floating widget, whose whole purpose is to be used while this tab is
 * behind something else.
 *
 * The fix is that the pop-out window is a real window, and it is visible. Its
 * frames keep coming whatever the opener is doing. So the app doesn't ask
 * `window` for frames — it asks whichever window is actually on screen, and
 * this module is the one place that knows which that is.
 *
 * The callbacks still run in the opener's realm, so `performance.now()` keeps
 * meaning the same thing throughout. Only the heartbeat moves.
 */

let host: Window = typeof window === 'undefined' ? (undefined as unknown as Window) : window;
const listeners = new Set<() => void>();

/** Point the app's animation loops at `next`, or back at this tab with null. */
export function setFrameHost(next: Window | null): void {
  const target = next ?? window;
  if (target === host) return;
  host = target;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const snapshot = () => host;

/**
 * The window to schedule frames on, re-rendering when it changes.
 *
 * Effects that drive an animation should list this in their dependencies: when
 * the pop-out opens or closes, the loop is torn down and restarted on the new
 * window, which is exactly right — a frame callback registered on a window
 * that has since closed will never be called again.
 */
export function useFrameHost(): Window {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
