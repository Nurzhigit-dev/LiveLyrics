import { useState } from 'react';
import { Grain } from './components/Grain';
import { StatusBar } from './components/StatusBar';
import { Stage } from './components/Stage';
import { TransportBar } from './components/TransportBar';
import type { AppPhase, Track } from './types';

/**
 * The whole app is a function of one piece of state: which phase we're in.
 *
 * Keeping `phase` here — rather than scattering booleans like `isLoading`,
 * `hasError`, `isListening` across components — means impossible combinations
 * (listening AND errored at the same time) simply cannot be represented.
 */
export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [track] = useState<Track | null>(null);
  const [position] = useState(0);

  const listening = phase === 'listening';

  /**
   * Phase 1 wires the state machine but not the microphone. Toggling here
   * exercises every visual state the shell has; the real capture and
   * identification pipeline replaces this body in a later phase.
   */
  function handleListen() {
    setPhase(listening ? 'idle' : 'listening');
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <StatusBar phase={phase} readouts={['src / mic']} />

      <Stage onListen={handleListen} listening={listening} />

      <TransportBar track={track} position={position} />

      <Grain />
    </>
  );
}
