import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { useWordLight } from '../hooks/useWordLight';
import './LyricStage.css';

interface Props {
  lines: LyricLine[];
  /** How long each line is actually sung for — see computeSungSpans. */
  spans?: number[];
  /** Index of the line currently being sung, or -1 before the first. */
  activeIndex: number;
  /** False when only unsynced plain lyrics were available. */
  synced: boolean;
  /** Reads the exact song position without triggering a render. */
  getPosition: () => number;
  /** Called when a line is clicked, to re-anchor the clock to that moment. */
  onSeekToLine?: (index: number) => void;
  /** True when words should be tappable rather than whole lines. */
  studyOn?: boolean;
  /** Called with a tapped word, the line it came from, and that line's index. */
  onWord?: (word: string, line: string, index: number) => void;
}

/** The active line sits above centre — reading is easier with more of the
 *  song visible ahead than behind. */
const FOCAL_RATIO = 0.40;

/** Past this many lines away, everything looks the same. */
const MAX_DISTANCE = 5;

/**
 * How far from the active line words stay individually tappable.
 *
 * Every line in the song used to be split into a button per word. On a
 * forty-line track that is several hundred elements, and it showed: the lyric
 * view went from 32 nodes to 243 and the layout each line change costs nearly
 * tripled — a hitch at exactly the moment the reel is gliding. Two lines out,
 * a line is already down to 30% opacity and nobody is aiming at it, so this is
 * the window where tapping is a real gesture rather than a theoretical one.
 */
const TAP_DISTANCE = 2;

/* ---------------------------------------------------------------------------
 * One line.
 *
 * memo() matters more than it looks. When the active line changes, only about
 * four rows actually change appearance, but without this every row in the song
 * — often two hundred of them — would re-render and have its styles
 * recalculated. That work landed in the same frames as the scroll animation,
 * which is exactly when it is most visible as a stutter.
 *
 * Every prop here is a primitive or a stable callback for the same reason: one
 * prop that changes identity on each render would undo all of it.
 * ------------------------------------------------------------------------ */

interface RowProps {
  line: LyricLine;
  index: number;
  distance: number;
  isActive: boolean;
  isPast: boolean;
  seekable: boolean;
  /** Words in this line can be tapped to look one up. Only lines near the
   *  active one are: see TAP_DISTANCE. */
  tappable?: boolean;
  onSeek?: (index: number) => void;
  onWord?: (word: string, line: string, index: number) => void;
  attach: (index: number, el: HTMLElement | null) => void;
}

const LyricRow = memo(function LyricRow({
  line, index, distance, isActive, isPast, seekable, tappable, onSeek, onWord, attach,
}: RowProps) {
  const ref = useCallback(
    (el: HTMLElement | null) => attach(index, el),
    [attach, index],
  );

  // An empty LRC line is an instrumental gap, not a bug.
  if (!line.text) {
    return (
      <div ref={ref} className="lyrics__rest" data-active={isActive || undefined} aria-hidden="true">
        <span /><span /><span />
      </div>
    );
  }

  const words = line.text.split(/\s+/);
  const shared = {
    ref,
    'data-distance': distance,
    'data-active': isActive || undefined,
    'data-past': isPast || undefined,
    'data-words': words.length,
    'aria-current': isActive ? ('true' as const) : undefined,
  };

  // Studying: each word is its own target, so one can be looked up. The line
  // can't also be a button — a button inside a button isn't valid, and it
  // would swallow the tap. Moving the clock keeps the timeline, and the word
  // card offers the same line as a starting point.
  if (tappable) {
    return (
      <p className="lyrics__line" {...shared}>
        <span className="lyrics__text">
          {words.map((word, w) => (
            /* The space between words is a real text node outside the button,
               not padding on it: that is what lets a long line wrap between
               words exactly as ordinary text does. */
            <Fragment key={`${w}-${word}`}>
              <button
                type="button"
                className="lyrics__word lyrics__word--tap"
                style={{ '--i': w } as React.CSSProperties}
                onClick={() => onWord?.(word, line.text, index)}
                title={`What does “${word}” mean?`}
              >
                {word}
              </button>
              {w < words.length - 1 ? ' ' : ''}
            </Fragment>
          ))}
        </span>
      </p>
    );
  }

  const content = isActive && seekable ? (
    words.map((word, w) => (
      <span
        key={`${w}-${word}`}
        className="lyrics__word"
        style={{ '--i': w } as React.CSSProperties}
      >
        {word}{w < words.length - 1 ? ' ' : ''}
      </span>
    ))
  ) : (
    line.text
  );

  return seekable && onSeek ? (
    <button
      type="button"
      className="lyrics__line lyrics__line--seek"
      onClick={() => onSeek(index)}
      title="Play the song from this line"
      {...shared}
    >
      {content}
    </button>
  ) : (
    <p className="lyrics__line" {...shared}>{content}</p>
  );
});

/* ------------------------------------------------------------------------ */

function LyricStageInner({
  lines, spans, activeIndex, synced, getPosition, onSeekToLine,
  studyOn = false, onWord,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);

  /** How far the reel is shifted, in pixels. Negative moves it upward. */
  const [shift, setShift] = useState(0);

  // Stable identity, so memoised rows are not invalidated on every render.
  const attach = useCallback((index: number, el: HTMLElement | null) => {
    lineRefs.current[index] = el;
  }, []);

  /**
   * Positions the reel so the active line sits on the focal point.
   *
   * The movement itself is a CSS transition on `transform`, not a JavaScript
   * animation. That is the whole point of this rewrite: the previous version
   * wrote `scrollTop` on every frame from a requestAnimationFrame loop, and
   * scroll offsets cannot be handed to the compositor — every step ran on the
   * main thread and competed with React, so the glide between lines never felt
   * clean. A transform transition is composited off the main thread and stays
   * smooth even while the app is busy.
   *
   * Measurement uses `offsetTop`, which is a layout value and is unaffected by
   * the transform currently applied. That means it stays correct even when a
   * new line becomes active mid-transition — reading `getBoundingClientRect`
   * instead would measure the element's in-flight animated position and the
   * error would compound with every interruption.
   */
  const align = useCallback(() => {
    if (!synced) return;
    const viewport = viewportRef.current;
    const el = lineRefs.current[Math.max(0, activeIndex)];
    if (!viewport || !el) return;

    const focal = viewport.clientHeight * FOCAL_RATIO;
    const next = focal - (el.offsetTop + el.offsetHeight / 2);
    // Only when it actually moved. The observer below fires for changes that
    // leave the focal point exactly where it was, and each of those would
    // otherwise be a render of the whole reel for nothing.
    setShift((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, [activeIndex, synced]);

  // useLayoutEffect so the reel is never painted at the old position first.
  useLayoutEffect(align, [align]);

  /*
   * Re-measure when the geometry shifts underneath us.
   *
   * A window resize is only one of the ways that happens, and it stopped being
   * the common one: the webfont finishing its swap changes every line's height,
   * and the translation band, the word card or the timeline opening takes a
   * slice off the bottom of the viewport without the window changing size at
   * all. A ResizeObserver on the viewport catches all of those.
   *
   * The reel itself is deliberately NOT observed. It was, back when
   * translations were inserted into it line by line and its height really did
   * change under us; now nothing changes the reel's height that does not also
   * change the viewport's, and observing a four-thousand-pixel box that is
   * always the same size only bought extra callbacks.
   */
  useEffect(() => {
    if (!synced) return;
    let cancelled = false;
    const settle = () => { if (!cancelled) align(); };

    void document.fonts?.ready.then(settle);

    const viewport = viewportRef.current;
    const observer = new ResizeObserver(settle);
    if (viewport) observer.observe(viewport);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [align, synced]);

  /* The word-by-word light, shared with the floating window so the two can't
     drift apart. The element it writes to is the active row of this reel. */
  const activeEl = useCallback(() => lineRefs.current[activeIndex] ?? null, [activeIndex]);
  useWordLight({ getEl: activeEl, lines, spans, activeIndex, getPosition, enabled: synced });

  if (lines.length === 0) return null;

  return (
    <div className="lyrics screen-in" data-mode={synced ? 'synced' : 'static'}>
      {/*
        The scrolling happens here, one level in from the frame.
        The edge fades below are positioned against the frame, which does not
        scroll — when they were children of the scroller itself they moved with
        the content, and the bottom one's hard lower edge dragged a black band
        across the middle of anything that really scrolled.
      */}
      <div
        className="lyrics__scroll"
        ref={viewportRef}
        id="main"
        tabIndex={0}
        role="region"
        aria-label="Lyrics"
      >
        {!synced && (
          <p className="label lyrics__notice">Only unsynced lyrics exist for this track</p>
        )}

        <div
          className="lyrics__reel"
          style={synced ? { transform: `translate3d(0, ${shift}px, 0)` } : undefined}
        >
          {lines.map((line, i) => (
            <LyricRow
              key={`${line.time}-${i}`}
              line={line}
              index={i}
              distance={Math.min(MAX_DISTANCE, Math.abs(i - activeIndex))}
              isActive={i === activeIndex}
              isPast={i < activeIndex}
              /* While studying, a tap means "what does this mean" — everywhere,
                 not only on the lines close enough to have word buttons. A far
                 line that still jumped the song would be a nasty surprise for
                 anyone who misjudged the distance by one. */
              seekable={synced && Boolean(onSeekToLine) && !studyOn}
              tappable={studyOn && Math.abs(i - activeIndex) <= TAP_DISTANCE}
              onSeek={onSeekToLine}
              onWord={onWord}
              attach={attach}
            />
          ))}
        </div>
      </div>

      <div className="lyrics__fade lyrics__fade--top" aria-hidden="true" />
      <div className="lyrics__fade lyrics__fade--bottom" aria-hidden="true" />
    </div>
  );
}

/*
 * The app re-renders ten times a second to drive the clock. Without this the
 * entire lyric view would be reconciled on every one of those ticks, even
 * though none of its props changed — all of them are either stable values or
 * memoised callbacks, and activeIndex only changes a few times a minute.
 */
export const LyricStage = memo(LyricStageInner);
