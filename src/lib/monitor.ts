/**
 * A lightweight, continuous microphone level monitor.
 *
 * This is what lets the app notice that the music stopped. It is deliberately
 * much cheaper than `captureSample`: an AnalyserNode reading a small time-domain
 * buffer, no AudioWorklet, no recording, no buffers retained. Nothing it hears
 * is stored or sent anywhere — only a single loudness number leaves this module.
 *
 * It also gives the sync problem a structural fix. When the room goes quiet and
 * then starts up again, the app re-identifies from scratch, which produces a
 * fresh anchor. Any drift that had built up is simply discarded.
 */

/** Analyser window. 2048 samples is ~46ms at 44.1kHz — smooth but responsive. */
const FFT_SIZE = 2048;

export interface Monitor {
  stop: () => void;
}

export interface MonitorOptions {
  /** Called with a smoothed 0..1 level, roughly 60x a second. */
  onLevel: (level: number) => void;
  /** Called once the level has stayed below the floor for `quietMs`. */
  onQuiet?: () => void;
  /** Called when sound returns after a quiet stretch. */
  onSound?: () => void;
  /** RMS below this counts as silence. Room tone sits well under it. */
  floor?: number;
  /** How long it must stay quiet before onQuiet fires. */
  quietMs?: number;
}

export async function startMonitor({
  onLevel,
  onQuiet,
  onSound,
  floor = 0.012,
  quietMs = 2600,
}: MonitorOptions): Promise<Monitor> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      // Same reasoning as the recorder: these are tuned to isolate speech and
      // suppress everything else, which would make music look like silence.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  // Some smoothing in the analyser itself, so a single quiet beat between
  // phrases doesn't read as the track having stopped.
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);
  // Not connected to the destination: nothing is played back.

  const buffer = new Float32Array(analyser.fftSize);
  let frame = 0;
  let quietSince: number | null = null;
  let isQuiet = false;
  let stopped = false;

  const tick = () => {
    if (stopped) return;

    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);

    onLevel(Math.min(1, rms * 4));

    const now = performance.now();
    if (rms < floor) {
      quietSince ??= now;
      if (!isQuiet && now - quietSince >= quietMs) {
        isQuiet = true;
        onQuiet?.();
      }
    } else {
      quietSince = null;
      if (isQuiet) {
        isQuiet = false;
        onSound?.();
      }
    }

    frame = requestAnimationFrame(tick);
  };

  if (ctx.state === 'suspended') await ctx.resume();
  frame = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      // Releasing the tracks is what turns the browser's recording indicator
      // off. Leaving it burning would be both a privacy smell and a battery drain.
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    },
  };
}
