import type { CSSProperties } from 'react';
import { ListenButton } from './ListenButton';
import type { AppPhase } from '../types';
import './Stage.css';

/** What the caption under the button says at each stage of the pipeline. */
const CAPTION: Partial<Record<AppPhase, string>> = {
  listening: 'Listening — hold steady and stay near the speaker',
  identifying: 'Working out what this is…',
  fetching: 'Got it. Fetching the timed lyrics…',
};

const STEPS = [
  { name: 'Hears', detail: 'a few seconds through your microphone' },
  { name: 'Knows', detail: 'the track and how far into it you are' },
  { name: 'Follows', detail: 'every line, in time with the room' },
];

interface Props {
  onListen: () => void;
  listening: boolean;
  phase: AppPhase;
  level: number;
}

/**
 * The idle screen.
 *
 * There is exactly one thing to do here, so the layout says so: a single large
 * control in the middle, a line of copy above it, and the explanation demoted
 * to a quiet row underneath. An earlier version buried the button in the
 * corner of a poster layout, which looked striking and read as decoration.
 */
export function Stage({ onListen, listening, phase, level }: Props) {
  const caption = CAPTION[phase];
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
          {caption ?? 'Your browser will ask for microphone access'}
        </p>
      </div>

      <ol className="stage__steps" aria-label="How it works">
        {STEPS.map((step, i) => (
          <li key={step.name} className="stage__step" style={delay(5 + i)}>
            <span className="stage__step-name">{step.name}</span>
            <span className="stage__step-detail">{step.detail}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
