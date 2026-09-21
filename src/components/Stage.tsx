import type { CSSProperties } from 'react';
import { ListenButton } from './ListenButton';
import type { AppPhase, SourceId } from '../types';
import './Stage.css';

/** What the caption under the button says at each stage of the pipeline. */
const CAPTION: Record<SourceId, Partial<Record<AppPhase, string>>> = {
  mic: {
    listening: 'Listening — hold steady and stay near the speaker',
    identifying: 'Working out what this is…',
    fetching: 'Got it. Fetching the timed lyrics…',
  },
  device: {
    listening: 'Listening to the shared tab…',
    identifying: 'Working out what this is…',
    fetching: 'Got it. Fetching the timed lyrics…',
  },
};

/** What the screen says when nothing is happening yet. */
const IDLE_HINT: Record<SourceId, string> = {
  mic: 'Your browser will ask for microphone access',
  device: 'Your browser will ask which tab to listen to',
};

const STEPS = [
  { name: 'Hears', detail: 'a few seconds of whatever is playing' },
  { name: 'Knows', detail: 'the track and how far into it you are' },
  { name: 'Follows', detail: 'every line, in time with the music' },
];

interface Props {
  onListen: () => void;
  /** Start listening to this device's own sound instead of the room. */
  onListenToDevice?: () => void;
  /** False where the browser has no screen-sharing API to offer. */
  canUseDevice?: boolean;
  listening: boolean;
  phase: AppPhase;
  source: SourceId;
  level: number;
  /** Overrides the default caption — a second attempt, a song's name, etc. */
  caption?: string | null;
}

/**
 * The idle screen.
 *
 * There is exactly one thing to do here, so the layout says so: a single large
 * control in the middle, a line of copy above it, and the explanation demoted
 * to a quiet row underneath. An earlier version buried the button in the
 * corner of a poster layout, which looked striking and read as decoration.
 */
export function Stage({
  onListen, onListenToDevice, canUseDevice = false,
  listening, phase, source, level, caption: override,
}: Props) {
  const caption = override ?? CAPTION[source][phase];
  const delay = (i: number) => ({ '--i': i }) as CSSProperties;

  return (
    <main className="stage screen-in" id="main">
      <div className="stage__center">
        <p className="label stage__eyebrow" style={delay(0)}>Real-time lyric sync</p>

        <h1 className="stage__headline" style={delay(1)}>
          Play something <em>out loud</em>
        </h1>

        <p className="stage__blurb" style={delay(2)}>
          Point this at whatever is playing. It works out the song and where you
          are in it, then follows along.
        </p>

        <div className="stage__action" style={delay(3)}>
          <ListenButton onClick={onListen} active={listening} level={level} />
        </div>

        {/* aria-live so progress is announced as it changes, not just shown. */}
        <p className="stage__caption" aria-live="polite" style={delay(4)}>
          {caption ?? IDLE_HINT[source]}
        </p>

        {/*
          The second way in, offered quietly rather than as an equal.

          Through the microphone is what the app is for and what works
          everywhere. But if the music is coming out of this same computer —
          a video, a stream, anything in another tab — sending it the sound
          directly beats holding a microphone up to a speaker by a distance:
          the recogniser gets the file as it was made, silence is really
          silence, and a track change is heard the instant it happens.

          Hidden rather than disabled where the browser has no such API,
          because "you can't do this here" is not an offer.
        */}
        {canUseDevice && !listening && onListenToDevice && (
          <button type="button" className="stage__alt" onClick={onListenToDevice} style={delay(5)}>
            Playing on this computer? Use its sound instead
          </button>
        )}
      </div>

      <ol className="stage__steps" aria-label="How it works">
        {STEPS.map((step, i) => (
          <li key={step.name} className="stage__step" style={delay(6 + i)}>
            <span className="stage__step-name">{step.name}</span>
            <span className="stage__step-detail">{step.detail}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
