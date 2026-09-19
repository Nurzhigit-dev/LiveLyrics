import { useEffect, useMemo, useRef, useState } from 'react';
import { useSongClock, type Anchor } from './useSongClock';
import { MicSession, type Snapshot } from '../lib/mic';
import { MicError } from '../lib/audio';
import { identify, IdentifyError } from '../lib/identify';
import { findLyrics, LyricsError, type LrclibRecord, type LyricTarget } from '../lib/lrclib';
import { computeSungSpans, findActiveIndex, parseLrc } from '../lib/lrc';
import { clamp, loadCalibration, saveCalibration } from '../lib/calibration';
import { cleanTitle, primaryArtist, similarity, uniqueNames } from '../lib/translit';
import type { AppPhase, Identification, LyricLine, Track } from '../types';

/**
 * Seconds of audio for an identification. Long enough that a chorus repeated
 * later in the song rarely looks identical to the part actually playing.
 */
export const SAMPLE_SECONDS = 10;

/**
 * On a miss, slide the listening window forward this far and try again. The
 * second attempt still sees mostly new audio, but costs six more seconds of
 * listening instead of ten.
 */
const RETRY_SLIDE_SECONDS = 6;
const LISTEN_ATTEMPTS = 2;

/** Audio used for a background re-check of the sync. */
const RESYNC_SECONDS = 8;

/** When, after a match, to take one confirming measurement. */
const CONFIRM_AFTER_SECONDS = 18;

/**
 * A line becomes active this far ahead of its timestamp.
 *
 * The glide to a new line takes a moment, and the eye needs a moment more to
 * land on it. Switching exactly on the timestamp meant every line visibly
 * arrived just after the singer had started it — which reads as late even
 * when the clock is perfect. The words themselves still light up on time.
 */
export const LINE_LEAD = 0.28;

/** How far past the reported end of a song before listening for the next one. */
const SONG_END_GRACE = 1.5;
const NEXT_SONG_ATTEMPTS = 3;

/** Below this a recording is effectively silence — not worth a recognition. */
const MIN_AUDIBLE_RMS = 0.0025;

/** After this long paused, let go of the microphone. */
const RELEASE_MIC_AFTER_MS = 10 * 60 * 1000;

export interface NoticeState {
  kind: string;
  title: string;
  detail?: string;
  tone?: 'neutral' | 'danger';
}

class TooQuietError extends Error {
  constructor() {
    super('Nothing audible was recorded.');
    this.name = 'TooQuietError';
  }
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * Whether two recognitions are the same song. The recogniser's id settles it
 * when both have one; otherwise the names have to agree, in any script.
 */
function sameSong(a: Track | null, b: Track | null): boolean {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  return (
    similarity(cleanTitle(a.title), cleanTitle(b.title)) >= 0.8 &&
    similarity(primaryArtist(a.artist), primaryArtist(b.artist)) >= 0.6
  );
}

/**
 * Everything worth searching the lyric database for. The recogniser often
 * lists one recording more than once — under another release, or in another
 * script — so the names of every candidate that is plainly the same song are
 * pooled together.
 */
function lyricTarget(id: Identification): LyricTarget {
  const top = id.candidates[0] ?? id.track;
  const same = id.candidates.filter(
    (c) => c === top || similarity(cleanTitle(c.title), cleanTitle(top.title)) >= 0.7,
  );
  return {
    titles: uniqueNames(same.flatMap((c) => [c.title, ...(c.titleVariants ?? [])])),
    artists: uniqueNames(same.flatMap((c) => [...(c.artistVariants ?? []), c.artist])),
    album: top.album,
    duration: top.duration,
  };
}

/**
 * The listening, recognition and sync engine.
 *
 * One rule keeps the asynchronous parts safe: every flow reads current state
 * from `live` (a ref), never from variables captured when it started. A mic
 * callback registered minutes ago, or a background check that has been
 * waiting for ten seconds, therefore always acts on what is true now — not on
 * a stale snapshot of some earlier render.
 */
export function useLiveLyrics() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [track, setTrack] = useState<Track | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [synced, setSynced] = useState(true);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [hold, setHold] = useState<number | null>(null);
  const [calibration, setCalibration] = useState(loadCalibration);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [level, setLevel] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);

  const live = useRef({
    phase: 'idle' as AppPhase,
    track: null as Track | null,
    lines: [] as LyricLine[],
    synced: true,
    anchor: null as Anchor | null,
    hold: null as number | null,
    calibration,
  });

  const micRef = useRef<MicSession | null>(null);
  /** The foreground flow: listening for a song after a button press. */
  const flowRef = useRef<AbortController | null>(null);
  /** Background work: sync re-checks, listening for the next song. */
  const bgRef = useRef<AbortController | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clock = useSongClock(anchor, calibration, hold);
  const spans = useMemo(() => computeSungSpans(lines), [lines]);
  const activeIndex = useMemo(
    () => (synced ? findActiveIndex(lines, clock.position + LINE_LEAD) : -1),
    [synced, lines, clock.position],
  );

  /*
   * The engine is built once. Because it only reads state through `live` and
   * only writes through stable setters, the functions created on the first
   * render stay correct forever — and their identities never change, so the
   * memoised lyric view isn't re-rendered by the clock ticking.
   */
  const engine = useMemo(() => {
    /** Writes go to the ref and to React together, so the two can't disagree. */
    const set = {
      phase: (v: AppPhase) => { live.current.phase = v; setPhase(v); },
      track: (v: Track | null) => { live.current.track = v; setTrack(v); },
      lines: (v: LyricLine[]) => { live.current.lines = v; setLines(v); },
      synced: (v: boolean) => { live.current.synced = v; setSynced(v); },
      anchor: (v: Anchor | null) => { live.current.anchor = v; setAnchor(v); },
      hold: (v: number | null) => { live.current.hold = v; setHold(v); },
    };

    /** The song position at wall-clock time `ts`, without the calibration. */
    const rawAt = (ts: number) => {
      const a = live.current.anchor;
      return a ? a.songPosition + (ts - a.startedAt) / 1000 : 0;
    };

    const clearReleaseTimer = () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    };

    const closeMic = () => {
      clearReleaseTimer();
      micRef.current?.close();
      micRef.current = null;
      setLevel(0);
    };

    const show = (n: NoticeState, p: AppPhase) => {
      setNotice(n);
      setCaption(null);
      setActivity(null);
      set.phase(p);
    };

    /** Turns any thrown error into a screen with a way forward. */
    const reportError = (err: unknown, found?: Track) => {
      if (err instanceof TooQuietError) {
        return show({
          kind: 'too quiet',
          title: 'It’s too quiet to hear anything.',
          detail: 'Start the music first, then press Listen — and bring the device closer to the speaker.',
        }, 'nomatch');
      }

      if (err instanceof MicError) {
        return show({ kind: 'microphone', title: 'I can’t hear anything.', detail: err.detail.message, tone: 'danger' }, 'error');
      }

      if (err instanceof IdentifyError) {
        if (err.kind === 'nomatch') {
          return show({
            kind: 'no match',
            title: 'Heard it, couldn’t place it.',
            detail:
              'It listened twice without a match. Getting closer to the speaker helps far more than turning it up — and live takes, remixes and very local releases often aren’t in the recogniser’s catalogue at all.',
          }, 'nomatch');
        }
        const HEADINGS: Record<string, { kind: string; title: string; hint?: string }> = {
          quota: { kind: 'limit reached', title: 'Out of recognitions this month.' },
          unconfigured: {
            kind: 'setup',
            title: 'This site isn’t connected to a recogniser yet.',
            hint: 'Visitors never need an account or keys — this is a one-time step for whoever runs the site.',
          },
          auth: {
            kind: 'credentials',
            title: 'The server’s keys were rejected.',
            hint: 'This is a setup problem on the site itself, not something you did. Whoever deployed it needs to check the ACRCloud values in the hosting environment variables.',
          },
        };
        const heading = HEADINGS[err.kind] ?? { kind: 'connection', title: 'Couldn’t reach the server.' };
        return show({
          kind: heading.kind,
          title: heading.title,
          detail: heading.hint ? `${err.message} ${heading.hint}` : err.message,
          tone: 'danger',
        }, 'error');
      }

      if (err instanceof LyricsError) {
        // Name the song. "Not recognised" and "recognised, but no lyrics exist"
        // are completely different problems, and the second one is not the
        // recogniser's fault.
        const name = found ? `“${found.title}” by ${found.artist}` : 'This track';
        if (err.kind === 'network') {
          return show({ kind: 'no lyrics', title: 'Couldn’t reach the lyric database.', detail: err.message }, 'nomatch');
        }
        if (err.kind === 'instrumental') {
          return show({ kind: 'instrumental', title: 'That’s an instrumental.', detail: `${name} has no vocals to follow.` }, 'nomatch');
        }
        return show({
          kind: 'no lyrics',
          title: 'Found it — but there are no words on file.',
          detail: `${name} was recognised, but LRCLIB, the free lyric database this uses, has no lyrics for it yet.`,
        }, 'nomatch');
      }

      show({
        kind: 'error',
        title: 'Something went wrong.',
        detail: err instanceof Error ? err.message : 'An unexpected error occurred.',
        tone: 'danger',
      }, 'error');
    };

    /* ---- pause and resume ---------------------------------------------- */

    const handleQuiet = (since: number) => {
      const s = live.current;
      if (s.phase !== 'synced' || !s.synced || !s.anchor) return;
      bgRef.current?.abort();
      // Held at the moment the silence BEGAN. Holding at the moment it was
      // noticed — three seconds later — put the lyrics three seconds ahead
      // every time the music was paused and resumed.
      set.hold(rawAt(since) + s.calibration);
      set.phase('paused');
      clearReleaseTimer();
      releaseTimer.current = setTimeout(() => {
        if (live.current.phase === 'paused') closeMic();
      }, RELEASE_MIC_AFTER_MS);
    };

    const handleSound = (at: number) => {
      const s = live.current;
      if (s.phase !== 'paused' || s.hold === null) return;
      clearReleaseTimer();
      // Continue from exactly where it was held — right for a real pause —
      // then check against the room, which fixes the other cases: a quiet
      // passage mistaken for a pause, a scrub, or a different song.
      set.anchor({ startedAt: at, songPosition: s.hold - s.calibration });
      set.hold(null);
      set.phase('synced');
      const mic = micRef.current;
      if (mic) void resync('resume', mic.secondsCaptured);
    };

    const ensureMic = async () => {
      if (micRef.current) return micRef.current;
      micRef.current = await MicSession.open({
        // The meter is only on screen while listening; don't re-render the app
        // twenty times a second for a value nobody can see.
        onLevel: (l) => { if (live.current.phase === 'listening') setLevel(l); },
        onQuiet: handleQuiet,
        onSound: handleSound,
      });
      return micRef.current;
    };

    /* ---- recognition ---------------------------------------------------- */

    /**
     * Listens until the recogniser names the song, or gives up.
     *
     * Near-silent windows are skipped without being sent: a recording of an
     * empty room can't match anything, and each attempt costs one of the
     * month's free recognitions.
     */
    const recognise = async (
      mic: MicSession,
      signal: AbortSignal,
      onStage?: (stage: 'listening' | 'identifying', attempt: number) => void,
    ) => {
      let until = mic.secondsCaptured + SAMPLE_SECONDS;
      let heardAnything = false;

      for (let attempt = 1; attempt <= LISTEN_ATTEMPTS; attempt++) {
        onStage?.('listening', attempt);
        await mic.waitUntil(until, signal);
        const snap = await mic.snapshot(SAMPLE_SECONDS);

        if (snap.rms >= MIN_AUDIBLE_RMS) {
          heardAnything = true;
          onStage?.('identifying', attempt);
          try {
            return { id: await identify(snap.wav, signal), snap };
          } catch (err) {
            if (!(err instanceof IdentifyError && err.kind === 'nomatch')) throw err;
          }
        }
        until += RETRY_SLIDE_SECONDS;
      }

      if (!heardAnything) throw new TooQuietError();
      throw new IdentifyError('Heard the audio, but matched nothing.', 'nomatch');
    };

    const applySong = (top: Track, record: LrclibRecord, startedAt: number) => {
      setNotice(null);
      setCaption(null);
      setActivity(null);
      set.track(top);
      set.hold(null);

      if (record.syncedLyrics) {
        set.lines(parseLrc(record.syncedLyrics).lines);
        set.synced(true);
        set.anchor({ startedAt, songPosition: top.offset ?? 0 });
        set.phase('synced');
        // One confirming measurement a little later. It catches a first match
        // that landed on the wrong repeat of a chorus, and halves the ordinary
        // error of a single measurement.
        const mic = micRef.current;
        if (mic) void resync('confirm', mic.secondsCaptured + CONFIRM_AFTER_SECONDS - RESYNC_SECONDS);
      } else {
        set.lines((record.plainLyrics ?? '').split(/\r?\n/).map((text) => ({ time: 0, text: text.trim() })));
        set.synced(false);
        set.anchor(null);
        set.phase('synced');
        // Nothing to follow without timings, so nothing to listen for.
        closeMic();
      }
    };

    /** The room moved on to another song mid-session. */
    const switchSong = async (id: Identification, snap: Snapshot, signal: AbortSignal) => {
      setActivity('new song');
      try {
        applySong(id.track, await findLyrics(lyricTarget(id), signal), snap.startedAt);
      } catch (err) {
        if (isAbort(err)) throw err;
        // Better to say what's playing than leave the old song's words scrolling.
        closeMic();
        reportError(err, id.track);
      }
    };

    /**
     * A background check of the sync against the room.
     *
     * 'confirm' runs once, shortly after a match. A small disagreement is split
     *   down the middle — two independent measurements beat one. A large one
     *   usually means one of them matched the wrong repeat of a chorus, so a
     *   third measurement decides.
     * 'resume' runs after a pause. The held clock can legitimately be out by
     *   however long a quiet passage lasted, so the fresh measurement is taken
     *   as it is.
     *
     * Failures are silent: the lyrics are already running, and a background
     * check that couldn't hear clearly is no reason to interrupt them.
     */
    const resync = async (reason: 'confirm' | 'resume', from: number) => {
      bgRef.current?.abort();
      const ctrl = new AbortController();
      bgRef.current = ctrl;
      const { signal } = ctrl;
      const mic = micRef.current;
      if (!mic) return;

      const measure = async () => {
        const snap = await mic.snapshot(RESYNC_SECONDS);
        if (snap.rms < MIN_AUDIBLE_RMS) return null;
        try {
          return { id: await identify(snap.wav, signal), snap };
        } catch (err) {
          if (isAbort(err)) throw err;
          return null;
        }
      };

      try {
        await mic.waitUntil(from + RESYNC_SECONDS, signal);
        if (live.current.phase !== 'synced' || !live.current.synced) return;

        setActivity('checking sync');
        const before = live.current.anchor;
        const current = live.current.track;
        const first = await measure();
        // Nothing heard, or the listener moved the clock by hand meanwhile —
        // their correction outranks an automatic one.
        if (!first || live.current.anchor !== before || !before) return;

        if (!sameSong(first.id.track, current)) return await switchSong(first.id, first.snap, signal);

        const diff = (first.id.track.offset ?? 0) - rawAt(first.snap.startedAt);
        if (Math.abs(diff) <= 0.25) return;

        if (reason === 'resume') {
          set.anchor({ startedAt: first.snap.startedAt, songPosition: first.id.track.offset ?? 0 });
          return;
        }
        if (Math.abs(diff) <= 2.5) {
          set.anchor({ startedAt: before.startedAt, songPosition: before.songPosition + diff / 2 });
          return;
        }

        await mic.waitUntil(mic.secondsCaptured + RESYNC_SECONDS, signal);
        const second = await measure();
        if (!second || live.current.anchor !== before || !sameSong(second.id.track, current)) return;
        const diff2 = (second.id.track.offset ?? 0) - rawAt(second.snap.startedAt);
        if (Math.abs(diff2 - diff) <= 1.5) {
          set.anchor({ startedAt: second.snap.startedAt, songPosition: second.id.track.offset ?? 0 });
        }
      } catch (err) {
        if (!isAbort(err)) console.warn('Background sync check failed', err);
      } finally {
        if (bgRef.current === ctrl) {
          bgRef.current = null;
          setActivity(null);
        }
      }
    };

    /** The song has run past its end: find out what's playing now. */
    const listenForNext = async () => {
      bgRef.current?.abort();
      const ctrl = new AbortController();
      bgRef.current = ctrl;
      const { signal } = ctrl;
      const mic = micRef.current;
      if (!mic) return;

      setActivity('listening for the next song');
      try {
        for (let i = 0; i < NEXT_SONG_ATTEMPTS; i++) {
          await mic.waitUntil(mic.secondsCaptured + SAMPLE_SECONDS, signal);
          // Paused: when sound returns, the resume check identifies it anyway.
          if (live.current.phase !== 'synced') return;

          const snap = await mic.snapshot(SAMPLE_SECONDS);
          if (snap.rms < MIN_AUDIBLE_RMS) continue;

          let id: Identification;
          try {
            id = await identify(snap.wav, signal);
          } catch (err) {
            if (isAbort(err)) throw err;
            continue;
          }

          if (sameSong(id.track, live.current.track)) {
            // Still the same track — its reported length was short, or it's on
            // repeat. Re-anchor and carry on.
            set.anchor({ startedAt: snap.startedAt, songPosition: id.track.offset ?? 0 });
            return;
          }
          return await switchSong(id, snap, signal);
        }
        // Nothing recognisable followed. The last song stays on screen.
        closeMic();
      } catch (err) {
        if (!isAbort(err)) console.warn('Listening for the next song failed', err);
      } finally {
        if (bgRef.current === ctrl) {
          bgRef.current = null;
          setActivity(null);
        }
      }
    };

    /* ---- actions -------------------------------------------------------- */

    /** Listen for a song: the Listen button, Try again, and Again. */
    const listen = async () => {
      flowRef.current?.abort();
      bgRef.current?.abort();
      const flow = new AbortController();
      flowRef.current = flow;
      const { signal } = flow;

      setNotice(null);
      setCaption(null);
      setActivity(null);
      clearReleaseTimer();
      set.hold(null);
      set.anchor(null);
      set.phase('listening');

      let found: Track | undefined;
      try {
        const mic = await ensureMic();
        const { id, snap } = await recognise(mic, signal, (stage, attempt) => {
          set.phase(stage);
          if (stage === 'identifying') setLevel(0);
          setCaption(stage === 'listening' && attempt > 1 ? 'Not sure yet — listening a few seconds longer…' : null);
        });

        found = id.track;
        set.phase('fetching');
        setCaption(`Found “${id.track.title}” — fetching the words…`);
        applySong(id.track, await findLyrics(lyricTarget(id), signal), snap.startedAt);
      } catch (err) {
        if (signal.aborted || isAbort(err)) return;
        closeMic();
        reportError(err, found);
      } finally {
        if (flowRef.current === flow) flowRef.current = null;
      }
    };

    const stop = () => {
      flowRef.current?.abort();
      flowRef.current = null;
      bgRef.current?.abort();
      bgRef.current = null;
      closeMic();
      setCaption(null);
      setActivity(null);
      set.hold(null);
      set.phase('idle');
    };

    const reset = () => {
      stop();
      setNotice(null);
      set.track(null);
      set.lines([]);
      set.anchor(null);
      // Calibration deliberately survives: it describes this device, not this song.
    };

    const nudge = (delta: number) => {
      const next = clamp(live.current.calibration + delta);
      live.current.calibration = next;
      setCalibration(next);
      saveCalibration(next);
    };

    /** Clicking a lyric line says "the song is here, right now". */
    const seekToLine = (index: number) => {
      const line = live.current.lines[index];
      if (!line) return;
      // A hand correction outranks an automatic one still in flight.
      bgRef.current?.abort();
      if (live.current.phase === 'paused') {
        set.hold(line.time);
        return;
      }
      // Subtracting the calibration means the clicked line lands exactly on
      // "now", instead of having the saved correction applied a second time.
      set.anchor({ startedAt: performance.now(), songPosition: line.time - live.current.calibration });
    };

    const dispose = () => {
      flowRef.current?.abort();
      bgRef.current?.abort();
      clearReleaseTimer();
      micRef.current?.close();
      micRef.current = null;
    };

    return { listen, stop, reset, nudge, seekToLine, listenForNext, dispose };
  }, []);

  // Release the microphone and cancel everything on unmount.
  useEffect(() => engine.dispose, [engine]);

  // When the song runs past its end, listen for whatever comes next.
  useEffect(() => {
    if (phase !== 'synced' || !synced || !track?.duration || !micRef.current) return;
    if (clock.position < track.duration + SONG_END_GRACE) return;
    if (bgRef.current) return;
    void engine.listenForNext();
  }, [phase, synced, track, clock.position, engine]);

  const busy = phase === 'listening' || phase === 'identifying' || phase === 'fetching';

  return {
    phase,
    track,
    lines,
    spans,
    synced,
    activeIndex,
    position: clock.position,
    getPosition: clock.getPosition,
    calibration,
    notice,
    level,
    caption,
    activity,
    busy,
    showLyrics: (phase === 'synced' || phase === 'paused') && lines.length > 0,
    listen: engine.listen,
    stop: engine.stop,
    reset: engine.reset,
    nudge: engine.nudge,
    seekToLine: engine.seekToLine,
  };
}
