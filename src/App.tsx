import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Ambience } from './components/Ambience';
import { Grain } from './components/Grain';
import { StatusBar } from './components/StatusBar';
import { Stage } from './components/Stage';
import { LyricStage } from './components/LyricStage';
import { Notice } from './components/Notice';
import { TransportBar } from './components/TransportBar';
import { SyncBar } from './components/SyncBar';
import { PlayControl, ReadingTools, SessionActions } from './components/Controls';
import { WordCard } from './components/WordCard';
import { TranslationStrip } from './components/TranslationStrip';
import { MiniLyrics } from './components/MiniLyrics';
import { usePopOut } from './hooks/usePopOut';
import { NUDGE_STEP } from './lib/calibration';
import { SAMPLE_SECONDS, useLiveLyrics } from './hooks/useLiveLyrics';
import { useStudy } from './hooks/useStudy';

/**
 * The screen. All of the listening, recognition and syncing lives in
 * useLiveLyrics; this component only decides what to show.
 */
export default function App() {
  const lyrics = useLiveLyrics();
  const study = useStudy(lyrics.lines, lyrics.activeIndex);
  const popOut = usePopOut();
  const { phase, busy, showLyrics, synced, adjusting, notice, nudge } = lyrics;

  const toggleListen = () => (busy ? lyrics.stop() : void lyrics.listen('mic'));
  const listenToDevice = () => void lyrics.listen('device');
  /* "Try again" repeats whatever was chosen, rather than silently dropping
     back to the microphone and listening to the room instead. */
  const retry = () => (busy ? lyrics.stop() : void lyrics.listen());

  /**
   * How long the song is, for the timeline.
   *
   * The recogniser usually reports a duration, but not always — and a
   * timeline with no length is a bar you cannot aim at. The last lyric line
   * plus a little is a good enough stand-in: it is always at least as long as
   * the words, which is all of the song anyone is trying to find a place in.
   */
  const duration = useMemo(() => {
    if (lyrics.track?.duration) return lyrics.track.duration;
    const last = lyrics.lines[lyrics.lines.length - 1];
    return last ? last.time + 30 : 0;
  }, [lyrics.track, lyrics.lines]);

  /*
   * Pulled out of `lyrics` and `study` one by one, rather than depending on
   * those objects in the effect below.
   *
   * Both hooks return a fresh object on every render, and this component
   * renders ten times a second to drive the clock — so depending on them meant
   * tearing down and re-attaching the window key listener ten times a second,
   * for a set of handlers that never actually changed.
   */
  const { togglePause, endAdjust } = lyrics;
  const { card: studyCard, closeWord } = study;

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
      if (event.key === 'Escape' && (studyCard || adjusting)) {
        event.preventDefault();
        if (studyCard) closeWord();
        else endAdjust();
        return;
      }

      // While the timeline is open, the arrows belong to it: it is a slider,
      // and moving the song is the coarser version of the same job.
      if (adjusting) return;

      if (event.key === ' ' || event.key === 'Spacebar') {
        // Not while a button has focus: space is how a button is pressed, and
        // stealing it would break the control just used.
        if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) return;
        event.preventDefault();
        togglePause();
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
  }, [showLyrics, synced, adjusting, nudge, studyCard, closeWord, endAdjust, togglePause]);

  /**
   * The translation of the line being sung — the only one on screen.
   *
   * Depends on `translationFor` rather than on `study`: the hook returns a
   * fresh object every render, and this component renders ten times a second
   * for the clock, so depending on the whole thing would recompute constantly.
   */
  const translationFor = study.translationFor;
  const activeTranslation = useMemo(() => {
    const line = lyrics.lines[lyrics.activeIndex];
    return line?.text ? translationFor(line.text) : undefined;
  }, [lyrics.lines, lyrics.activeIndex, translationFor]);

  // Readouts only ever show what is actually true right now.
  const readouts = useMemo(() => {
    const out: string[] = [];
    if (phase === 'listening') out.push(`${SAMPLE_SECONDS}s sample`);
    if (lyrics.activity) out.push(lyrics.activity);
    if (study.status === 'loading') out.push('translating');
    if (showLyrics && !synced) out.push('unsynced');
    return out;
  }, [phase, lyrics.activity, showLyrics, synced, study.status]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <StatusBar
        phase={phase}
        readouts={readouts}
        level={lyrics.level}
        label={lyrics.pausedBy === 'user' ? 'paused' : undefined}
        /* Also while a floating window is open with no song in it: the button
           that closes it lives in here, and hiding it would leave the window
           with no way back except its own title bar. */
        actions={
          showLyrics || popOut.win ? (
            <SessionActions
              busy={busy}
              canPopOut={popOut.supported}
              poppedOut={Boolean(popOut.win)}
              onPopOut={() => (popOut.win ? popOut.close() : void popOut.open())}
              onRelisten={() => void lyrics.listen()}
              onReset={lyrics.reset}
            />
          ) : null
        }
      />

      {showLyrics ? (
        <LyricStage
          lines={lyrics.lines}
          spans={lyrics.spans}
          activeIndex={lyrics.activeIndex}
          synced={synced}
          getPosition={lyrics.getPosition}
          onSeekToLine={synced ? lyrics.seekToLine : undefined}
          studyOn={study.on}
          onWord={study.openWord}
        />
      ) : notice ? (
        <Notice
          kind={notice.kind}
          title={notice.title}
          detail={notice.detail}
          tone={notice.tone}
          action={{ label: busy ? 'Listening…' : 'Try again', onClick: retry }}
          secondary={{ label: 'Start over', onClick: lyrics.reset }}
        />
      ) : (
        <Stage
          onListen={toggleListen}
          onListenToDevice={listenToDevice}
          canUseDevice={lyrics.canUseDevice}
          listening={busy}
          phase={phase}
          source={lyrics.source}
          level={lyrics.level}
          caption={lyrics.caption}
        />
      )}

      {/*
        The translation of the line being sung, in a band of its own.

        Hidden while the word card or the timeline is up: the card already
        shows this line and its translation, and during a drag the Russian is
        not what is being matched. Two panels stacked over the transport bar
        would also leave very little song on a phone.
      */}
      {showLyrics && study.on && !study.card && !adjusting && (
        <TranslationStrip
          text={activeTranslation}
          to={study.target}
          loading={study.status === 'loading'}
        />
      )}

      {/* A failed translation, or a floating window that wouldn't open. Worth
          saying once, quietly, and never at the cost of the lyrics: they are
          still running underneath it. */}
      {popOut.error && <p className="app-note label" role="status">{popOut.error}</p>}

      {showLyrics && study.status === 'error' && study.error && (
        <p className="app-note label" role="status">{study.error}</p>
      )}

      {showLyrics && study.card && (
        <WordCard
          card={study.card}
          to={study.target}
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

      {showLyrics && adjusting && synced && (
        <SyncBar
          duration={duration}
          position={lyrics.position}
          lines={lyrics.lines}
          nudge={lyrics.calibration}
          onNudge={nudge}
          onScrub={lyrics.scrubTo}
          onCommit={lyrics.commitScrub}
          onClose={lyrics.endAdjust}
        />
      )}

      <TransportBar
        track={showLyrics ? lyrics.track : null}
        position={lyrics.position}
        centre={showLyrics && synced ? <PlayControl paused={lyrics.paused} onToggle={lyrics.togglePause} /> : null}
        end={
          showLyrics ? (
            <ReadingTools
              canAdjust={synced}
              adjusting={adjusting}
              onAdjust={adjusting ? lyrics.endAdjust : lyrics.startAdjust}
              studyOn={study.on}
              target={study.target}
              detected={study.detected}
              onToggleStudy={study.toggle}
              onSetTarget={study.setTarget}
            />
          ) : null
        }
      />

      {/*
        The floating window's contents live in this component tree — a portal,
        not a second React root — so it shares the same clock, the same track
        and the same translations. Nothing has to be kept in step, because
        there is only one of everything.
      */}
      {popOut.win && createPortal(
        <MiniLyrics
          track={lyrics.track}
          lines={lyrics.lines}
          spans={lyrics.spans}
          activeIndex={lyrics.activeIndex}
          progress={duration > 0 ? Math.min(1, Math.max(0, lyrics.position / duration)) : 0}
          getPosition={lyrics.getPosition}
          paused={lyrics.paused}
          onTogglePause={togglePause}
        />,
        popOut.win.document.body,
      )}

      <Ambience />
      <Grain />
    </>
  );
}
