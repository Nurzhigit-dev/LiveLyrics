import { MicError, describeMicError, rms, toRecognitionWav } from './audio';

/**
 * One continuous microphone session.
 *
 * The app used to open the microphone, record a fixed clip, close it, and then
 * open a second, separate monitor to watch for the music stopping. Keeping one
 * session open instead — with a rolling buffer of the most recent audio —
 * makes three things possible that weren't before:
 *
 *  - A failed match can be retried by sliding the window forward a few seconds
 *    rather than recording ten fresh seconds from scratch.
 *  - The sync can be re-checked in the background at any moment, from audio
 *    that has already been heard, with no extra wait.
 *  - Silence is timestamped in the same clock as the audio itself, so a pause
 *    can hold the lyrics at the moment the music actually stopped.
 */

/** How much recent audio is kept, in seconds. */
const RING_SECONDS = 30;

/** Samples per message from the audio thread: about 43 ms at 48 kHz. */
const BATCH = 2048;

/** Below this RMS the room is silent, whatever the music's own level. */
const QUIET_FLOOR = 0.004;
/** Or this far below how loud the music has been (about -22 dB). */
const QUIET_RATIO = 0.08;
/** How long it must stay quiet before the music is presumed stopped. */
const QUIET_HOLD_MS = 3200;
/** Coming back from quiet needs clearly more than the threshold, so a single
 *  loud beat in a quiet room doesn't flicker the state back and forth. */
const RESUME_MARGIN = 1.6;

/**
 * Runs on the audio thread. Batches the 128-sample render quanta into larger
 * messages — posting every quantum at 48 kHz would be 375 messages a second —
 * and mixes to mono, since some interfaces put the signal on one side only.
 */
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${BATCH}); this.n = 0; this.live = false; }
  process(inputs) {
    const input = inputs[0] || [];
    const left = input[0];
    const right = input[1];
    if (left && left.length) this.live = true;
    else if (!this.live) return true;
    // Once running, a missing quantum is recorded as silence rather than
    // skipped, so the sample count keeps matching real elapsed time.
    const len = left && left.length ? left.length : 128;
    for (let i = 0; i < len; i++) {
      const l = left ? left[i] : 0;
      this.buf[this.n++] = right ? (l + right[i]) / 2 : l;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf, [this.buf.buffer]);
        this.buf = new Float32Array(${BATCH});
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('tap', Tap);
`;

export interface Snapshot {
  wav: Blob;
  /** performance.now() at the first sample of the snapshot. */
  startedAt: number;
  seconds: number;
  /** Loudness before levelling — a near-zero value means nothing was playing. */
  rms: number;
}

export interface MicOptions {
  /** Live 0..1 loudness, about 23 times a second. */
  onLevel?: (level: number) => void;
  /** The room went quiet; `since` is when the silence began. */
  onQuiet?: (since: number) => void;
  /** Sound came back; `at` is when. */
  onSound?: (at: number) => void;
}

/**
 * The part of the session that doesn't touch the Web Audio API: a ring buffer,
 * a sample-to-wall-clock mapping and the silence detector. Kept separate so it
 * can be driven with synthetic audio and tested without a microphone.
 */
export class RollingAudio {
  readonly sampleRate: number;
  private readonly ring: Float32Array<ArrayBuffer>;
  private written = 0;
  private readonly latencyMs: number;
  private readonly opts: MicOptions;

  /** Recent (last sample index, arrival time) pairs. */
  private marks: Array<[number, number]> = [];
  private waiters: Array<{ target: number; resolve: () => void }> = [];

  private musicLevel = 0;
  private quietSince: number | null = null;
  private quiet = false;
  private readonly alpha: number;

  constructor(sampleRate: number, opts: MicOptions & { latencyMs?: number } = {}) {
    this.sampleRate = sampleRate;
    this.ring = new Float32Array(Math.ceil(sampleRate * RING_SECONDS));
    this.latencyMs = opts.latencyMs ?? 0;
    this.opts = opts;
    // A ~6 s memory for "how loud is this music", updated once per batch.
    this.alpha = 1 - Math.exp(-(BATCH / sampleRate) / 6);
  }

  /** Total audio received so far, in seconds. */
  get secondsCaptured(): number {
    return this.written / this.sampleRate;
  }

  /**
   * When sample `k` was captured, in performance.now() time.
   *
   * Each batch reaches the main thread some variable time after it was
   * recorded — never before. So for every recent batch, (arrival − how far
   * into the stream it ends) is an upper bound on when the stream began, and
   * the smallest of those bounds is the tightest estimate. Using a sliding
   * window of recent batches, rather than the first one alone, keeps it
   * honest if the audio clock drifts slightly against the system clock over
   * a long session.
   */
  timeOfSample(k: number): number {
    let origin = Infinity;
    for (const [end, arrival] of this.marks) {
      origin = Math.min(origin, arrival - (end / this.sampleRate) * 1000);
    }
    if (!Number.isFinite(origin)) origin = performance.now() - (this.written / this.sampleRate) * 1000;
    return origin + (k / this.sampleRate) * 1000 - this.latencyMs;
  }

  ingest(frame: Float32Array, arrival: number): void {
    const cap = this.ring.length;
    const len = frame.length;
    const start = this.written % cap;
    const first = Math.min(len, cap - start);
    this.ring.set(frame.subarray(0, first), start);
    if (first < len) this.ring.set(frame.subarray(first), 0);
    const batchStart = this.written;
    this.written += len;

    this.marks.push([this.written, arrival]);
    if (this.marks.length > 256) this.marks.shift();

    this.track(frame, batchStart, arrival);

    if (this.waiters.length) {
      const still: typeof this.waiters = [];
      for (const w of this.waiters) {
        if (this.written >= w.target) w.resolve();
        else still.push(w);
      }
      this.waiters = still;
    }
  }

  /** Level meter and silence detection, once per batch. */
  private track(frame: Float32Array, batchStart: number, arrival: number) {
    const level = rms(frame);
    this.opts.onLevel?.(Math.min(1, level * 4));

    const threshold = Math.max(QUIET_FLOOR, this.musicLevel * QUIET_RATIO);
    const loud = this.quiet ? level > threshold * RESUME_MARGIN : level >= threshold;

    if (!loud) {
      this.quietSince ??= this.timeOfSample(batchStart);
      if (!this.quiet && arrival - this.quietSince >= QUIET_HOLD_MS) {
        this.quiet = true;
        this.opts.onQuiet?.(this.quietSince);
      }
      return;
    }

    this.quietSince = null;
    if (this.quiet) {
      this.quiet = false;
      this.opts.onSound?.(this.timeOfSample(batchStart));
    }
    this.musicLevel = this.musicLevel ? this.musicLevel + (level - this.musicLevel) * this.alpha : level;
  }

  /** Resolves once the stream has reached `seconds` in total. */
  waitUntil(seconds: number, signal?: AbortSignal): Promise<void> {
    const target = Math.ceil(seconds * this.sampleRate);
    if (this.written >= target) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
      const waiter = { target, resolve };
      this.waiters.push(waiter);
      signal?.addEventListener(
        'abort',
        () => {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          reject(new DOMException('Cancelled', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  /** The most recent `seconds` of audio, with the time its first sample was captured. */
  latest(seconds: number): { samples: Float32Array<ArrayBuffer>; startedAt: number } {
    const cap = this.ring.length;
    const n = Math.min(Math.round(seconds * this.sampleRate), this.written, cap);
    const startIndex = this.written - n;
    const out = new Float32Array(n);
    const from = startIndex % cap;
    const first = Math.min(n, cap - from);
    out.set(this.ring.subarray(from, from + first), 0);
    if (first < n) out.set(this.ring.subarray(0, n - first), first);
    return { samples: out, startedAt: this.timeOfSample(startIndex) };
  }
}

/** The Web Audio side: opens the microphone and feeds RollingAudio. */
export class MicSession {
  readonly audio: RollingAudio;
  private readonly stream: MediaStream;
  private readonly ctx: AudioContext;
  private closed = false;

  private constructor(stream: MediaStream, ctx: AudioContext, audio: RollingAudio) {
    this.stream = stream;
    this.ctx = ctx;
    this.audio = audio;
  }

  static async open(opts: MicOptions = {}): Promise<MicSession> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicError({
        code: 'mic-unavailable',
        message: 'This browser has no microphone API. Try Chrome, Edge or Firefox.',
      });
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // Every "enhancement" is tuned to isolate a voice and throw away
          // everything else — which is exactly the music being identified.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch (err) {
      throw new MicError(describeMicError(err));
    }

    // The device's own rate. Forcing 8 kHz here throws in Firefox; the
    // conversion happens afterwards instead (see toRecognitionWav).
    const ctx = new AudioContext();
    try {
      if (ctx.state === 'suspended') await ctx.resume();

      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      const source = ctx.createMediaStreamSource(stream);
      const tap = new AudioWorkletNode(ctx, 'tap');
      // A worklet only runs while connected to a live graph, so it has to reach
      // the destination — through a muted gain, so nothing is played back.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(tap);
      tap.connect(mute);
      mute.connect(ctx.destination);

      // Chrome reports the capture path's latency; the audio it hands us is
      // that much older than its arrival suggests.
      const settings = stream.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined;
      const latencyMs = Number.isFinite(settings?.latency) ? (settings!.latency as number) * 1000 : 0;

      const audio = new RollingAudio(ctx.sampleRate, { ...opts, latencyMs });
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => audio.ingest(event.data, performance.now());

      return new MicSession(stream, ctx, audio);
    } catch (err) {
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
      throw err instanceof MicError ? err : new MicError(describeMicError(err));
    }
  }

  get secondsCaptured(): number {
    return this.audio.secondsCaptured;
  }

  waitUntil(seconds: number, signal?: AbortSignal): Promise<void> {
    return this.audio.waitUntil(seconds, signal);
  }

  /** The most recent `seconds` of audio, ready to send to the recogniser. */
  async snapshot(seconds: number): Promise<Snapshot> {
    const { samples, startedAt } = this.audio.latest(seconds);
    return {
      wav: await toRecognitionWav(samples, this.audio.sampleRate),
      startedAt,
      seconds: samples.length / this.audio.sampleRate,
      rms: rms(samples),
    };
  }

  /**
   * Releases the microphone. Stopping the tracks is what turns off the
   * browser's recording indicator — leaving it burning after the app is done
   * with it would be both a privacy smell and a battery drain.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const track of this.stream.getTracks()) track.stop();
    void this.ctx.close();
  }
}
