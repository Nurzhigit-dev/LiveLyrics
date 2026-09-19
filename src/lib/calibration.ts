/**
 * The user's persistent timing correction, in seconds.
 *
 * Ambient sync is never sample-accurate. The recogniser reports where the
 * *sample* began, and some latency is unavoidable on the way in — microphone
 * buffering, the audio graph, the encode. The residual error is largely
 * systematic: it is roughly the same amount, in the same direction, every
 * time, for a given device.
 *
 * So it is worth remembering. An earlier version reset the correction to zero
 * on every new identification, which meant fixing the same drift by hand for
 * every single song. Now you correct it once and it sticks.
 */

/*
 * Versioned, and bumped to v2 deliberately. The timing model changed underneath
 * any value saved before: lines now arrive slightly ahead of their timestamp,
 * the recogniser's offset is read correctly, and a pause no longer pushes the
 * lyrics ahead. A correction someone dialled in to compensate for those old
 * errors would now push the lyrics the wrong way, so old values are dropped.
 */
const STORAGE_KEY = 'livelyrics.calibration.v2';

/** Beyond a few seconds it is not calibration, it is a bad match. */
const LIMIT = 5;

export function loadCalibration(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const value = Number(raw);
    // Guard against a corrupted or hand-edited value putting the clock in a
    // state the user cannot recover from.
    if (!Number.isFinite(value)) return 0;
    return clamp(value);
  } catch {
    // Private mode, or site data blocked. Not worth failing over.
    return 0;
  }
}

export function saveCalibration(seconds: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clamp(seconds)));
  } catch {
    /* storage unavailable — the value still applies for this session */
  }
}

export function clamp(seconds: number): number {
  // Rounded to avoid floating-point dust accumulating over many small nudges.
  return Math.round(Math.max(-LIMIT, Math.min(LIMIT, seconds)) * 100) / 100;
}
