import { useEffect, useMemo } from 'react';
import { Ambience } from './components/Ambience';
import { Grain } from './components/Grain';
import { StatusBar } from './components/StatusBar';
import { Stage } from './components/Stage';
import { LyricStage } from './components/LyricStage';
import { Notice } from './components/Notice';
import { TransportBar } from './components/TransportBar';
import { SyncControls, NUDGE_STEP } from './components/SyncControls';
import { WordCard } from './components/WordCard';
import { SAMPLE_SECONDS, useLiveLyrics } from './hooks/useLiveLyrics';
import { useStudy } from './hooks/useStudy';

/**
 * The screen. All of the listening, recognition and syncing lives in
 * useLiveLyrics; this component only decides what to show.
 */
export default function App() {
  const lyrics = useLiveLyrics();
  const study = useStudy(lyrics.lines);
  const { phase, busy, showLyrics, synced, picking, notice, nudge } = lyrics;

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

      // Escape closes whatever is open, innermost first.
      if (event.key === 'Escape' && (picking || study.card)) {
        event.preventDefault();
        if (study.card) study.closeWord();
        else lyrics.stopPicking();
        return;
      }

      // While picking, arrows and space belong to scrolling the list.
      if (picking) return;

      if (event.key === ' ' || event.key === 'Spacebar') {
        // Not while a button has focus: space is how a button is pressed, and
        // stealing it would break the control just used.
        if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) return;
        event.preventDefault();
        lyrics.togglePause();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nudge(-NUDGE_STEP);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(NUDGE_STEP);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLyrics, synced, picking, nudge, lyrics, study]);

  // Readouts only ever show what is actually true right now.
  const readouts = useMemo(() => {
    const out: string[] = [];
    if (phase === 'listening') out.push(`${SAMPLE_SECONDS}s sample`);
    if (lyrics.activity) out.push(lyrics.activity);
    if (picking) out.push('choosing a line');
    if (study.status === 'loading') out.push('translating');
    if (showLyrics && !synced) out.push('unsynced');
    return out;
  }, [phase, lyrics.activity, picking, showLyrics, synced, study.status]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <StatusBar
        phase={phase}
        readouts={readouts}
        level={lyrics.level}
        label={lyrics.pausedBy === 'user' ? 'paused' : undefined}
      />

      {showLyrics ? (
        <LyricStage
          lines={lyrics.lines}
          spans={lyrics.spans}
          activeIndex={lyrics.activeIndex}
          synced={synced}
          picking={picking}
          getPosition={lyrics.getPosition}
          onSeekToLine={synced ? lyrics.seekToLine : undefined}
          translate={study.on ? study.translationFor : undefined}
          translationLang={study.pair?.to}
          studyOn={study.on}
          onWord={study.openWord}
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

      {/* A failed translation is worth saying once, quietly, and never at the
          cost of the lyrics: they are still running underneath it. */}
      {showLyrics && study.status === 'error' && study.error && (
        <p className="study-error label" role="status">{study.error}</p>
      )}

      {showLyrics && study.card && study.pair && (
        <WordCard
          card={study.card}
          to={study.pair.to}
          onClose={study.closeWord}
          onSeekToLine={
            synced
              ? () => {
                  lyrics.seekToLine(study.card!.lineIndex);
                  study.closeWord();
                }
              : undefined
          }
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
              paused={lyrics.paused}
              picking={picking}
              busy={busy}
              studyLang={study.lang}
              onCycleStudy={study.cycleLang}
              onNudge={nudge}
              onTogglePause={lyrics.togglePause}
              onPick={lyrics.startPicking}
              onCancelPick={lyrics.stopPicking}
              onReset={lyrics.reset}
              onRelisten={() => void lyrics.listen()}
            />
          ) : null
        }
      />

      <Ambience />
      <Grain />
    </>
  );
}
