import { useCallback, useMemo, useRef, useState } from 'react';
import { Grain } from './components/Grain';
import { StatusBar } from './components/StatusBar';
import { Stage } from './components/Stage';
import { LyricStage } from './components/LyricStage';
import { Notice } from './components/Notice';
import { Settings } from './components/Settings';
import { TransportBar } from './components/TransportBar';
import { SyncControls } from './components/SyncControls';
import { useSongClock, type Anchor } from './hooks/useSongClock';
import { captureSample, MicError } from './lib/audio';
import { identify, IdentifyError, type Credentials } from './lib/acrcloud';
import { fetchLyrics, LyricsError } from './lib/lrclib';
import { findActiveIndex, parseLrc } from './lib/lrc';
import { clearCredentials, loadCredentials, saveCredentials } from './lib/credentials';
import type { AppPhase, LyricLine, Track } from './types';

/**
 * How much audio to record before asking what it is.
 *
 * A trade-off: shorter feels snappier but gives the fingerprinter less to work
 * with in a noisy room. Eight seconds is around the point where accuracy stops
 * improving much, and it keeps the upload near 130 KB at 8 kHz mono.
 */
const SAMPLE_SECONDS = 8;

interface NoticeState {
  kind: string;
  title: string;
  detail?: string;
  tone?: 'neutral' | 'danger';
  /** True when the fix is to go and fix the keys. */
  keysAtFault?: boolean;
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [creds, setCreds] = useState<Credentials | null>(() => loadCredentials());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [track, setTrack] = useState<Track | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [synced, setSynced] = useState(true);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [nudge, setNudge] = useState(0);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [level, setLevel] = useState(0);

  /** Lets the Stop button cancel a capture that is already in flight. */
  const abortRef = useRef<AbortController | null>(null);

  const position = useSongClock(anchor, nudge);
  const activeIndex = useMemo(
    () => (synced ? findActiveIndex(lines, position) : -1),
    [synced, lines, position],
  );

  const busy = phase === 'listening' || phase === 'identifying' || phase === 'fetching';

  /** Turns any thrown error into a screen with a way forward. */
  const reportError = useCallback((err: unknown) => {
    if (err instanceof MicError) {
      setNotice({
        kind: 'microphone',
        title: 'The microphone is not available.',
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
          title: 'Heard it, but could not place it.',
          detail:
            'Background noise, a very quiet room, or a track outside the catalogue will all do this. Moving nearer the speaker helps more than turning it up.',
        });
        setPhase('nomatch');
        return;
      }
      setNotice({
        kind: err.kind === 'quota' ? 'quota' : err.kind === 'auth' ? 'keys' : 'network',
        title:
          err.kind === 'auth'
            ? 'Those keys were rejected.'
            : err.kind === 'quota'
              ? 'Out of recognitions for this month.'
              : 'Could not reach the recogniser.',
        detail: err.message,
        tone: 'danger',
        keysAtFault: err.kind === 'auth',
      });
      setPhase('error');
      return;
    }

    if (err instanceof LyricsError) {
      setNotice({
        kind: err.kind === 'instrumental' ? 'instrumental' : 'no lyrics',
        title:
          err.kind === 'instrumental'
            ? 'This one has no words.'
            : err.kind === 'network'
              ? 'Could not reach the lyric database.'
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
    if (!creds) {
      setSettingsOpen(true);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setNotice(null);
    setAnchor(null);
    setNudge(0);
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
      const matched = await identify(creds, capture.wav);
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
        // Anchored to when RECORDING STARTED, not to now — that is what makes
        // the round-trip latency cancel out instead of accumulating.
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
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (cancelled) {
        setPhase('idle');
        return;
      }
      reportError(err);
    } finally {
      setLevel(0);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [creds, reportError]);

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
    setNudge(0);
    setPhase('idle');
  }, []);

  /** Clicking a lyric line says "the song is here, right now". */
  const seekToLine = useCallback(
    (index: number) => {
      const line = lines[index];
      if (!line) return;
      setNudge(0);
      setAnchor({ startedAt: performance.now(), songPosition: line.time });
    },
    [lines],
  );

  // Readouts only ever show values that are actually true right now.
  const readouts = useMemo(() => {
    const out: string[] = [];
    if (phase === 'listening') out.push(`${SAMPLE_SECONDS}s sample`);
    if (phase === 'synced' && synced && nudge !== 0) {
      out.push(`${nudge > 0 ? '+' : ''}${nudge.toFixed(1)}s`);
    }
    if (phase === 'synced' && !synced) out.push('unsynced');
    return out;
  }, [phase, synced, nudge]);

  const showLyrics = phase === 'synced' && lines.length > 0;

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <StatusBar
        phase={phase}
        readouts={readouts}
        level={level}
        onOpenSettings={() => setSettingsOpen(true)}
        hasKeys={Boolean(creds)}
      />

      {showLyrics ? (
        <LyricStage
          lines={lines}
          activeIndex={activeIndex}
          synced={synced}
          onSeekToLine={synced ? seekToLine : undefined}
        />
      ) : notice ? (
        <Notice
          kind={notice.kind}
          title={notice.title}
          detail={notice.detail}
          tone={notice.tone}
          action={{ label: busy ? 'Listening…' : 'Try again', onClick: toggleListen }}
          secondary={
            notice.keysAtFault
              ? { label: 'Edit keys', onClick: () => setSettingsOpen(true) }
              : { label: 'Start over', onClick: reset }
          }
        />
      ) : (
        <Stage onListen={toggleListen} listening={busy} phase={phase} />
      )}

      <TransportBar
        track={showLyrics ? track : null}
        position={position}
        actions={
          showLyrics ? (
            <SyncControls
              nudge={nudge}
              synced={synced}
              onNudge={(delta) => setNudge((n) => Math.round((n + delta) * 10) / 10)}
              onReset={reset}
              onRelisten={toggleListen}
              busy={busy}
            />
          ) : null
        }
      />

      <Settings
        open={settingsOpen}
        initial={creds}
        onSave={(next) => {
          saveCredentials(next);
          setCreds(next);
          setSettingsOpen(false);
        }}
        onClear={() => {
          clearCredentials();
          setCreds(null);
          setSettingsOpen(false);
        }}
        onDismiss={() => setSettingsOpen(false)}
      />

      <Grain />
    </>
  );
}
