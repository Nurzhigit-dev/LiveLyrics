import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ambience } from './components/Ambience';
import { Grain } from './components/Grain';
import { StatusBar } from './components/StatusBar';
import { Stage } from './components/Stage';
import { LyricStage } from './components/LyricStage';
import { Notice } from './components/Notice';
import { TransportBar } from './components/TransportBar';
import { SyncControls, NUDGE_STEP } from './components/SyncControls';
import { useSongClock, type Anchor } from './hooks/useSongClock';
import { captureSample, MicError } from './lib/audio';
import { identify, IdentifyError } from './lib/identify';
import { fetchLyrics, LyricsError } from './lib/lrclib';
import { findActiveIndex, parseLrc } from './lib/lrc';
import { clamp, loadCalibration, saveCalibration } from './lib/calibration';
import type { AppPhase, LyricLine, Track } from './types';

/**
 * How much audio to record before asking what it is.
 *
 * Shorter feels snappier but gives the fingerprinter less to work with in a
 * noisy room. Seven seconds is around where accuracy stops improving much,
 * and it keeps the upload near 110 KB at 8 kHz mono.
 */
const SAMPLE_SECONDS = 7;

interface NoticeState {
  kind: string;
  title: string;
  detail?: string;
  tone?: 'neutral' | 'danger';
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [track, setTrack] = useState<Track | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [synced, setSynced] = useState(true);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  /* The timing correction persists across songs and across sessions: the
     residual latency is systematic, so making the user re-fix it every time
     was busywork. */
  const [calibration, setCalibration] = useState(loadCalibration);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [level, setLevel] = useState(0);

  /** Lets Stop cancel a capture that is already in flight. */
  const abortRef = useRef<AbortController | null>(null);

  const { position, getPosition } = useSongClock(anchor, calibration);
  const activeIndex = useMemo(
    () => (synced ? findActiveIndex(lines, position) : -1),
    [synced, lines, position],
  );

  const busy = phase === 'listening' || phase === 'identifying' || phase === 'fetching';
  const showLyrics = phase === 'synced' && lines.length > 0;

  /** Turns any thrown error into a screen with a way forward. */
  const reportError = useCallback((err: unknown) => {
    if (err instanceof MicError) {
      setNotice({
        kind: 'microphone',
        title: 'I can’t hear anything.',
        detail: err.detail.message,
        tone: 'danger',
      });
      setPhase('error');
      return;
    }

    if (err instanceof IdentifyError) {
      if (err.kind === 'nomatch') {
        setNotice({
          kind: 'no match',
          title: 'Heard it, couldn’t place it.',
          detail:
            'Getting closer to the speaker helps far more than turning it up. Live takes and remixes often aren’t in the catalogue at all.',
        });
        setPhase('nomatch');
        return;
      }
      setNotice({
        kind:
          err.kind === 'quota' ? 'limit reached'
          : err.kind === 'unconfigured' ? 'setup'
          : 'connection',
        title:
          err.kind === 'quota' ? 'Out of recognitions this month.'
          : err.kind === 'unconfigured' ? 'Recognition isn’t set up yet.'
          : 'Couldn’t reach the server.',
        detail: err.message,
        tone: 'danger',
      });
      setPhase('error');
      return;
    }

    if (err instanceof LyricsError) {
      setNotice({
        kind: err.kind === 'instrumental' ? 'instrumental' : 'no lyrics',
        title:
          err.kind === 'instrumental' ? 'This one has no words.'
          : err.kind === 'network' ? 'Couldn’t reach the lyric database.'
          : 'No lyrics on file for this track.',
        detail: err.message,
      });
      setPhase('nomatch');
      return;
    }

    setNotice({
      kind: 'error',
      title: 'Something went wrong.',
      detail: err instanceof Error ? err.message : 'An unexpected error occurred.',
      tone: 'danger',
    });
    setPhase('error');
  }, []);

  /** The whole pipeline: record, identify, fetch lyrics, start the clock. */
  const run = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    setNotice(null);
    setAnchor(null);
    setPhase('listening');

    try {
      const capture = await captureSample({
        seconds: SAMPLE_SECONDS,
        onLevel: setLevel,
        signal: controller.signal,
      });
      setLevel(0);
      if (controller.signal.aborted) return;

      setPhase('identifying');
      const matched = await identify(capture.wav);
      if (controller.signal.aborted) return;

      setTrack(matched);
      setPhase('fetching');

      const record = await fetchLyrics({
        track: matched.title,
        artist: matched.artist,
        album: matched.album,
        duration: matched.duration,
      });
      if (controller.signal.aborted) return;

      if (record.syncedLyrics) {
        setLines(parseLrc(record.syncedLyrics).lines);
        setSynced(true);
        // Anchored to when RECORDING STARTED, not to now, so the round trip
        // cancels out instead of accumulating into a permanent lag.
        setAnchor({ startedAt: capture.startedAt, songPosition: matched.offset ?? 0 });
      } else {
        setLines(
          (record.plainLyrics ?? '')
            .split(/\r?\n/)
            .map((text) => ({ time: 0, text: text.trim() })),
        );
        setSynced(false);
        setAnchor(null);
      }

      setPhase('synced');
    } catch (err) {
      const cancelled =
        controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
      if (cancelled) {
        setPhase('idle');
        return;
      }
      reportError(err);
    } finally {
      setLevel(0);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [reportError]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLevel(0);
    setPhase('idle');
  }, []);

  const toggleListen = useCallback(() => {
    if (busy) stop();
    else void run();
  }, [busy, stop, run]);

  const reset = useCallback(() => {
    setNotice(null);
    setTrack(null);
    setLines([]);
    setAnchor(null);
    setPhase('idle');
    // Calibration deliberately survives: it describes this device, not this song.
  }, []);

  const bumpNudge = useCallback((delta: number) => {
    setCalibration((current) => {
      const next = clamp(current + delta);
      saveCalibration(next);
      return next;
    });
  }, []);

  /** Clicking a lyric line says "the song is here, right now". */
  const seekToLine = useCallback((index: number) => {
    const line = lines[index];
    if (!line) return;
    // Subtracting the calibration here means the clicked line lands exactly on
    // "now". Without it the saved correction would be applied a second time on
    // top of a position the user has just stated explicitly.
    setAnchor({ startedAt: performance.now(), songPosition: line.time - calibration });
  }, [lines, calibration]);

  /*
   * Arrow keys nudge the timing while lyrics are on screen.
   *
   * Correcting drift is the single most common thing anyone will want to do
   * here, and hunting for a small button in the corner every time is friction.
   * The guard skips the shortcut when focus is in a text field so it can never
   * swallow a real interaction.
   */
  useEffect(() => {
    if (!showLyrics || !synced) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        bumpNudge(-NUDGE_STEP);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        bumpNudge(NUDGE_STEP);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLyrics, synced, bumpNudge]);

  // Readouts only ever show what is actually true right now.
  const readouts = useMemo(() => {
    const out: string[] = [];
    if (phase === 'listening') out.push(`${SAMPLE_SECONDS}s sample`);
    if (showLyrics && !synced) out.push('unsynced');
    return out;
  }, [phase, showLyrics, synced]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <StatusBar phase={phase} readouts={readouts} level={level} />

      {showLyrics ? (
        <LyricStage
          lines={lines}
          activeIndex={activeIndex}
          synced={synced}
          getPosition={getPosition}
          onSeekToLine={synced ? seekToLine : undefined}
        />
      ) : notice ? (
        <Notice
          kind={notice.kind}
          title={notice.title}
          detail={notice.detail}
          tone={notice.tone}
          action={{ label: busy ? 'Listening…' : 'Try again', onClick: toggleListen }}
          secondary={{ label: 'Start over', onClick: reset }}
        />
      ) : (
        <Stage onListen={toggleListen} listening={busy} phase={phase} level={level} />
      )}

      <TransportBar
        track={showLyrics ? track : null}
        position={position}
        actions={
          showLyrics ? (
            <SyncControls
              nudge={calibration}
              synced={synced}
              onNudge={bumpNudge}
              onReset={reset}
              onRelisten={toggleListen}
              busy={busy}
            />
          ) : null
        }
      />

      <Ambience />
      <Grain />
    </>
  );
}
