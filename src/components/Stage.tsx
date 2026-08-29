import type { CSSProperties } from 'react';
import { ListenButton } from './ListenButton';
import type { AppPhase } from '../types';
import './Stage.css';

/** The three steps, written as an equipment spec sheet rather than feature cards. */
const CHAIN = [
  { n: '01', name: 'Capture', detail: 'A few seconds of audio from the microphone. Nothing is stored.' },
  { n: '02', name: 'Match',   detail: 'An acoustic fingerprint returns the track and how far into it you are.' },
  { n: '03', name: 'Sync',    detail: 'Timed lines are pulled from LRCLIB and driven by that offset.' },
];

/** What the caption under the button says at each stage of the pipeline. */
const BUSY_CAPTION: Partial<Record<AppPhase, string>> = {
  listening: 'Recording — hold steady, and get near the speaker.',
  identifying: 'Matching the fingerprint…',
  fetching: 'Found it. Fetching the timed lyrics…',
};

interface Props {
  onListen: () => void;
  /** True while the pipeline is running, so the button shows its stop state. */
  listening: boolean;
  phase: AppPhase;
}

/**
 * The idle screen.
 *
 * The grid is deliberately asymmetric — headline hard against the left gutter,
 * technical rail hanging off the right — because centred-hero-with-subtitle is
 * the single most template-looking arrangement on the web.
 */
export function Stage({ onListen, listening, phase }: Props) {
  const caption = BUSY_CAPTION[phase];
  const step = (i: number) => ({ '--i': i }) as CSSProperties;

  return (
    <main className="stage" id="main">
      <div className="stage__lead">
        <p className="label stage__eyebrow" style={step(0)}>Real-time lyric sync</p>

        {/* One <h1> for the page. The line breaks are structural to the poster
            layout, so each line is a span and the whole reads as one heading. */}
        <h1 className="stage__headline">
          <span className="stage__line" style={step(1)}>Play</span>
          <span className="stage__line" style={step(2)}>it out</span>
          <span className="stage__line stage__line--accent" style={step(3)}>loud.</span>
        </h1>

        <p className="stage__blurb" style={step(4)}>
          Point this at whatever is playing in the room. It listens for a moment,
          works out which song it is <em>and how far in you already are</em>, then
          puts the words on screen in time with the music.
        </p>

        <div className="stage__action" style={step(5)}>
          <ListenButton onClick={onListen} active={listening} />
          {/* aria-live so the caption's progress is announced as it changes,
              rather than only being visible. */}
          <p className="stage__consent" aria-live="polite">
            {caption ?? 'Your browser will ask for microphone access first.'}
          </p>
        </div>
      </div>

      <aside className="stage__rail" aria-label="How it works">
        <ol className="stage__chain">
          {CHAIN.map((entry, i) => (
            <li key={entry.n} className="stage__step" style={step(6 + i)}>
              <span className="label readout stage__step-n">{entry.n}</span>
              <span className="stage__step-name">{entry.name}</span>
              <span className="stage__step-detail">{entry.detail}</span>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
