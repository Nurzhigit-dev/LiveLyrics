import { ListenButton } from './ListenButton';
import './Stage.css';

/** The three steps, written as an equipment spec sheet rather than feature cards. */
const CHAIN = [
  { n: '01', name: 'Capture',  detail: 'A few seconds of audio from the microphone. Nothing is stored.' },
  { n: '02', name: 'Match',    detail: 'An acoustic fingerprint returns the track and how far into it you are.' },
  { n: '03', name: 'Sync',     detail: 'Timed lines are pulled from LRCLIB and driven by that offset.' },
];

interface Props {
  onListen: () => void;
  /** True while the mic is open, so the button can show its stop state. */
  listening: boolean;
}

/**
 * The idle screen.
 *
 * Layout is deliberately asymmetric — the headline sits hard against the left
 * gutter and the technical rail hangs off the right, rather than everything
 * being stacked and centred. Centred-hero-with-subtitle is the single most
 * template-looking arrangement on the web, so the grid avoids it on purpose.
 */
export function Stage({ onListen, listening }: Props) {
  return (
    <main className="stage" id="main">
      <div className="stage__lead">
        <p className="label stage__eyebrow" style={{ '--i': 0 } as React.CSSProperties}>
          Real-time lyric sync
        </p>

        {/*
          One <h1> for the page. The line breaks are structural to the poster
          layout, so each line is its own span and the whole thing reads as a
          single heading to a screen reader.
        */}
        <h1 className="stage__headline">
          <span className="stage__line" style={{ '--i': 1 } as React.CSSProperties}>Play</span>
          <span className="stage__line" style={{ '--i': 2 } as React.CSSProperties}>it out</span>
          <span className="stage__line stage__line--accent" style={{ '--i': 3 } as React.CSSProperties}>
            loud.
          </span>
        </h1>

        <p className="stage__blurb" style={{ '--i': 4 } as React.CSSProperties}>
          Point this at whatever is playing in the room. It listens for a moment,
          works out which song it is <em>and how far in you already are</em>, then
          puts the words on screen in time with the music.
        </p>

        <div className="stage__action" style={{ '--i': 5 } as React.CSSProperties}>
          <ListenButton onClick={onListen} active={listening} />
          <p className="stage__consent">
            Your browser will ask for microphone access first.
          </p>
        </div>
      </div>

      <aside className="stage__rail" aria-label="How it works">
        <ol className="stage__chain">
          {CHAIN.map((step, i) => (
            <li
              key={step.n}
              className="stage__step"
              style={{ '--i': 6 + i } as React.CSSProperties}
            >
              <span className="label readout stage__step-n">{step.n}</span>
              <span className="stage__step-name">{step.name}</span>
              <span className="stage__step-detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
