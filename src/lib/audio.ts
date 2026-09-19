import type { AppError } from '../types';

/**
 * Audio utilities: preparing a recording for the recogniser, and turning
 * microphone failures into something worth showing a person.
 *
 * The recording itself lives in mic.ts.
 */

/** What the recogniser's fingerprinter works at internally. */
export const RECOGNITION_RATE = 8000;

/** Turns a raw getUserMedia rejection into something worth showing a user. */
export function describeMicError(err: unknown): AppError {
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

/** Root-mean-square level — a far better match for perceived loudness than peak. */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * Resamples with the browser's own resampler.
 *
 * An OfflineAudioContext renders the buffer at the new rate with a proper
 * anti-aliasing filter. The earlier approach — asking the live AudioContext to
 * run at 8 kHz — did the same job in Chrome but throws in Firefox, which
 * refuses to connect a microphone to a context at a different rate from the
 * device. Capturing at the device's own rate and converting afterwards works
 * everywhere.
 */
async function resample(samples: Float32Array<ArrayBuffer>, from: number, to: number): Promise<Float32Array<ArrayBuffer>> {
  if (from === to || samples.length === 0) return samples;
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const ctx = new OfflineAudioContext(1, length, to);
  const buffer = ctx.createBuffer(1, samples.length, from);
  buffer.copyToChannel(samples, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

/**
 * Removes DC offset and brings the level up to a consistent loudness.
 *
 * A phone held across the room can record music peaking at a few percent of
 * full scale. Converted straight to 16-bit, that uses only a handful of bits
 * and throws away the fine spectral detail the fingerprint is built from.
 * Scaling first keeps it. The gain is capped so near-silence is never pumped
 * up into loud noise.
 */
function normalise(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  const n = samples.length;
  if (!n) return samples;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;

  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i] - mean;
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const level = Math.sqrt(sum / n);
  if (peak < 1e-4 || level < 1e-5) return samples;

  // Aim for -20 dBFS RMS, but never clip the peaks and never boost past 30x.
  const gain = Math.min(0.1 / level, 0.98 / peak, 30);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (samples[i] - mean) * gain;
  return out;
}

/** Turns captured audio into the WAV the recogniser wants: 8 kHz, mono, levelled. */
export async function toRecognitionWav(samples: Float32Array<ArrayBuffer>, sampleRate: number): Promise<Blob> {
  const resampled = await resample(samples, sampleRate, RECOGNITION_RATE);
  return encodeWav(normalise(resampled), RECOGNITION_RATE);
}

/**
 * Wraps Float32 samples in a 16-bit PCM WAV container.
 *
 * The 44-byte header is a fixed recipe; the only interesting part is the
 * float-to-int conversion, which clamps first so a sample slightly over 1.0
 * saturates instead of overflowing and wrapping round to the opposite sign.
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
