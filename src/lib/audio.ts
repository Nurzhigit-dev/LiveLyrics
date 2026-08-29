import type { AppError } from '../types';

/**
 * Microphone capture, encoded to WAV for the identification API.
 *
 * Two decisions here matter more than they look:
 *
 * 1. Every piece of browser audio "enhancement" is switched OFF. Echo
 *    cancellation, noise suppression and auto gain are all tuned to isolate a
 *    human voice and throw away everything else — which is precisely the
 *    music we are trying to fingerprint. Left on, recognition rates collapse.
 *
 * 2. The output is WAV, not the browser's native WebM/Opus. MediaRecorder
 *    gives a different codec per browser, and a lossy one at that. Raw PCM in
 *    a WAV container is universally accepted and doesn't smear the spectral
 *    detail the fingerprint depends on.
 */

/** 8 kHz mono is what the recognisers want, and keeps the upload small. */
const TARGET_SAMPLE_RATE = 8000;

/** Runs inside the audio thread and ships raw frames back to the main thread. */
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      // Copy: the engine reuses this buffer on the next render quantum.
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}
registerProcessor('capture', CaptureProcessor);
`;

export interface CaptureResult {
  /** The recording, ready to POST. */
  wav: Blob;
  /** performance.now() at the moment recording actually began. */
  startedAt: number;
  sampleRate: number;
}

export interface CaptureOptions {
  seconds: number;
  /** Called ~50x/sec with a 0..1 loudness level, for the live meter. */
  onLevel?: (level: number) => void;
  signal?: AbortSignal;
}

/** Turns a raw getUserMedia rejection into something worth showing a user. */
function describeMicError(err: unknown): AppError {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      code: 'mic-denied',
      message:
        'Microphone access was blocked. Allow it in your browser’s site settings, then try again.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { code: 'mic-unavailable', message: 'No microphone was found on this device.' };
  }
  if (name === 'NotReadableError') {
    return {
      code: 'mic-unavailable',
      message: 'The microphone is busy — another app may be using it.',
    };
  }
  return { code: 'unknown', message: 'The microphone could not be opened.' };
}

/** Thrown so callers can pattern-match on `.detail` rather than parse strings. */
export class MicError extends Error {
  /* Assigned in the body, not as a constructor parameter property — this
     project builds with `erasableSyntaxOnly`, which bans that shorthand. */
  readonly detail: AppError;

  constructor(detail: AppError) {
    super(detail.message);
    this.name = 'MicError';
    this.detail = detail;
  }
}

/**
 * Opens the mic, records for `seconds`, and returns a WAV blob.
 * Always tears the stream down — a live mic indicator left burning in the tab
 * after the app is done with it is both a privacy smell and a battery drain.
 */
export async function captureSample(opts: CaptureOptions): Promise<CaptureResult> {
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
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
  } catch (err) {
    throw new MicError(describeMicError(err));
  }

  // Asking for the context's sample rate directly lets the browser do the
  // resampling with a proper anti-aliasing filter, rather than us decimating
  // by hand and introducing artefacts into the fingerprint.
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    ctx = new AudioContext(); // some browsers refuse a forced rate
  }

  const cleanup = () => {
    for (const track of stream.getTracks()) track.stop();
    void ctx.close();
  };

  try {
    // A click opened this, so the context is allowed to start.
    if (ctx.state === 'suspended') await ctx.resume();

    const moduleUrl = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: 'application/javascript' }),
    );
    try {
      await ctx.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }

    const source = ctx.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(ctx, 'capture');

    // A worklet only runs while it is part of a live rendering graph, so it
    // has to reach the destination. Routing through a silent gain node keeps
    // it pulled without playing the mic back through the speakers — which
    // would cause exactly the feedback howl we just disabled AEC to allow.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(capture);
    capture.connect(mute);
    mute.connect(ctx.destination);

    const sampleRate = ctx.sampleRate;
    const needed = Math.ceil(sampleRate * opts.seconds);
    const chunks: Float32Array[] = [];
    let collected = 0;

    const startedAt = performance.now();

    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        capture.port.onmessage = null;
        resolve();
      };

      if (opts.signal?.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'));
        return;
      }
      opts.signal?.addEventListener(
        'abort',
        () => {
          capture.port.onmessage = null;
          reject(new DOMException('Cancelled', 'AbortError'));
        },
        { once: true },
      );

      capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const frame = event.data;
        chunks.push(frame);
        collected += frame.length;

        if (opts.onLevel) {
          // RMS is a far better match for perceived loudness than peak, so the
          // meter moves with the music instead of spiking on transients.
          let sum = 0;
          for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
          opts.onLevel(Math.min(1, Math.sqrt(sum / frame.length) * 4));
        }

        if (collected >= needed) finish();
      };
    });

    source.disconnect();
    capture.disconnect();
    mute.disconnect();

    return {
      wav: encodeWav(flatten(chunks, needed), sampleRate),
      startedAt,
      sampleRate,
    };
  } finally {
    cleanup();
  }
}

/** Concatenates the captured frames into one buffer of exactly `length`. */
function flatten(chunks: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  let written = 0;
  for (const chunk of chunks) {
    const room = length - written;
    if (room <= 0) break;
    out.set(chunk.length > room ? chunk.subarray(0, room) : chunk, written);
    written += Math.min(chunk.length, room);
  }
  return out;
}

/**
 * Wraps Float32 samples in a 16-bit PCM WAV container.
 *
 * The 44-byte header is a fixed recipe; the only interesting part is the
 * float-to-int conversion, which clamps first so that a sample slightly over
 * 1.0 wraps to silence-adjacent noise instead of overflowing to full scale.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const channels = 1;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');

  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);                                  // chunk size
  view.setUint16(20, 1, true);                                   // 1 = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true);           // block align
  view.setUint16(34, 8 * bytesPerSample, true);                  // bit depth

  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetric scaling: int16 runs -32768..32767, so negatives get the
    // larger multiplier. Using 32767 for both would clip the negative peaks.
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
