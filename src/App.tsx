import { useEffect, useMemo } from 'react';
import { Ambience } from './components/Ambience';
import { Grain } from './components/Grain';
import { StatusBar } from './components/StatusBar';
import { Stage } from './components/Stage';
import { LyricStage } from './components/LyricStage';
import { Notice } from './components/Notice';
import { TransportBar } from './components/TransportBar';
import { SyncControls, NUDGE_STEP } from './components/SyncControls';
import { SAMPLE_SECONDS, useLiveLyrics } from './hooks/useLiveLyrics';

/**
 * The screen. All of the listening, recognition and syncing lives in
 * useLiveLyrics; this component only decides what to show.
 */
export default function App() {
  const lyrics = useLiveLyrics();
  const { phase, busy, showLyrics, synced, notice, nudge } = lyrics;

  const toggleListen = () => (busy ? lyrics.stop() : void lyrics.listen());

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
        nudge(-NUDGE_STEP);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(NUDGE_STEP);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLyrics, synced, nudge]);

  // Readouts only ever show what is actually true right now.
  const readouts = useMemo(() => {
    const out: string[] = [];
    if (phase === 'listening') out.push(`${SAMPLE_SECONDS}s sample`);
    if (lyrics.activity) out.push(lyrics.activity);
    if (showLyrics && !synced) out.push('unsynced');
    return out;
  }, [phase, lyrics.activity, showLyrics, synced]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <StatusBar phase={phase} readouts={readouts} level={lyrics.level} />

      {showLyrics ? (
        <LyricStage
          lines={lyrics.lines}
          spans={lyrics.spans}
          activeIndex={lyrics.activeIndex}
          synced={synced}
          getPosition={lyrics.getPosition}
          onSeekToLine={synced ? lyrics.seekToLine : undefined}
        />
      ) : notice ? (
        <Notice
          kind={notice.kind}
          title={notice.title}
          detail={notice.detail}
          tone={notice.tone}
          action={{ label: busy ? 'Listening…' : 'Try again', onClick: toggleListen }}
          secondary={{ label: 'Start over', onClick: lyrics.reset }}
        />
      ) : (
        <Stage
          onListen={toggleListen}
          listening={busy}
          phase={phase}
          level={lyrics.level}
          caption={lyrics.caption}
        />
      )}

      <TransportBar
        track={showLyrics ? lyrics.track : null}
        position={lyrics.position}
        actions={
          showLyrics ? (
            <SyncControls
              nudge={lyrics.calibration}
              synced={synced}
              onNudge={nudge}
              onReset={lyrics.reset}
              onRelisten={() => void lyrics.listen()}
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
