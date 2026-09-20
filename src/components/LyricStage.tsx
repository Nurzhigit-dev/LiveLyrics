import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { formatTime } from '../lib/time';
import './LyricStage.css';

interface Props {
  lines: LyricLine[];
  /** How long each line is actually sung for — see computeSungSpans. */
  spans?: number[];
  /** Index of the line currently being sung, or -1 before the first. */
  activeIndex: number;
  /** False when only unsynced plain lyrics were available. */
  synced: boolean;
  /** True while the listener is scrolling freely to choose a line. */
  picking?: boolean;
  /** Reads the exact song position without triggering a render. */
  getPosition: () => number;
  /** Called when a line is clicked, to re-anchor the clock to that moment. */
  onSeekToLine?: (index: number) => void;
  /** The second language under each line, when the study view is on. */
  translate?: (text: string) => string | undefined;
  /** The language code those translations are in. */
  translationLang?: string;
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


/** Assumed length of the final line, which has no following timestamp. */
const LAST_LINE_SECONDS = 4;

/** How often the picker re-reads the clock, to keep the shift preview true. */
const PICK_TICK_MS = 250;

/** A shift smaller than this isn't worth previewing as a correction. */
const SHIFT_FLOOR = 0.1;

/** "+3.2s" / "−1.4s": how far the sync moves if this line is chosen. */
function formatShift(seconds: number): string {
  const sign = seconds < 0 ? '−' : '+';
  return `${sign}${Math.abs(seconds).toFixed(1)}s`;
}

/* ---------------------------------------------------------------------------
 * One line.
 *
 * memo() matters more than it looks. When the active line changes, only about
 * four rows actually change appearance, but without this every row in the song
 * — often two hundred of them — would re-render and have its styles
 * recalculated. That work landed in the same frames as the scroll animation,
 * which is exactly when it is most visible as a stutter.
 *
 * Which is also why the translation arrives as a plain string rather than as a
 * lookup function: a function prop changes identity whenever new translations
 * land and would invalidate every row at once, where a string prop only
 * invalidates the rows whose text actually changed.
 * ------------------------------------------------------------------------ */

interface RowProps {
  line: LyricLine;
  index: number;
  distance: number;
  isActive: boolean;
  isPast: boolean;
  seekable: boolean;
  /** Show the line's timestamp — used while choosing a line. */
  showTime?: boolean;
  /** The line in the reader's own language, when there is one. */
  translation?: string;
  /** Which language that is, so assistive tech reads it correctly. */
  translationLang?: string;
  /** Words are individually tappable. */
  studyOn?: boolean;
  /** Picker only: the line the clock believes is playing right now. */
  isNow?: boolean;
  /** Picker only: the line under the pointer or the keyboard cursor. */
  isCursor?: boolean;
  /** Picker only: how far the sync would move, shown on the cursor row. */
  shift?: number;
  onSeek?: (index: number) => void;
  onWord?: (word: string, line: string, index: number) => void;
  onCursor?: (index: number) => void;
  attach: (index: number, el: HTMLElement | null) => void;
}

const LyricRow = memo(function LyricRow({
  line, index, distance, isActive, isPast, seekable, showTime, translation, translationLang,
  studyOn, isNow, isCursor, shift, onSeek, onWord, onCursor, attach,
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
    'data-timed': showTime || undefined,
    'data-now': isNow || undefined,
    'data-cursor': isCursor || undefined,
    'aria-current': isActive ? ('true' as const) : undefined,
  };

  // Under the line, never beside it: a translation reads as a second line of
  // the same thought, and putting it in a column would halve the width
  // available to both.
  const under = translation ? (
    <span className="lyrics__translation" lang={translationLang}>{translation}</span>
  ) : null;

  // While choosing a line, every line is laid out the same way — timestamp
  // beside text — so the list reads as something to scan rather than follow.
  if (showTime) {
    return (
      <button
        type="button"
        className="lyrics__line lyrics__line--seek"
        onClick={() => onSeek?.(index)}
        onPointerEnter={() => onCursor?.(index)}
        onFocus={() => onCursor?.(index)}
        title="Play the lyrics from this line"
        {...shared}
      >
        <span className="lyrics__time readout">{formatTime(line.time)}</span>
        <span className="lyrics__body">
          <span className="lyrics__text">{line.text}</span>
          {under}
        </span>
        <span className="lyrics__tag" aria-hidden="true">
          {isNow ? 'now' : isCursor && shift !== undefined && Math.abs(shift) >= SHIFT_FLOOR
            ? formatShift(shift)
            : ''}
        </span>
      </button>
    );
  }

  // Studying: each word is its own target, so one can be looked up. The line
  // can't also be a button — a button inside a button isn't valid, and it
  // would swallow the tap. Choosing a line keeps its own view, one press away.
  if (studyOn) {
    return (
      <p className="lyrics__line lyrics__line--study" {...shared}>
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
        {under}
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
      title="Set the sync to this line"
      {...shared}
    >
      {content}
      {under}
    </button>
  ) : (
    <p className="lyrics__line" {...shared}>{content}{under}</p>
  );
});

/* ------------------------------------------------------------------------ */

function LyricStageInner({
  lines, spans, activeIndex, synced, picking = false, getPosition, onSeekToLine,
  translate, translationLang, studyOn = false, onWord,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const litFrame = useRef(0);

  /** How far the reel is shifted, in pixels. Negative moves it upward. */
  const [shift, setShift] = useState(0);
  /** Picker only: the line under the pointer or the keyboard cursor. */
  const [cursor, setCursor] = useState(-1);
  /** Picker only: the clock, re-read a few times a second for the preview. */
  const [now, setNow] = useState(0);

  // Stable identity, so memoised rows are not invalidated on every render.
  const attach = useCallback((index: number, el: HTMLElement | null) => {
    lineRefs.current[index] = el;
  }, []);

  const moveCursor = useCallback((index: number) => setCursor(index), []);

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
    // While picking, the reel is an ordinary scrollable list and the listener
    // drives it. Moving it under them would be exactly wrong.
    if (!synced || picking) return;
    const viewport = viewportRef.current;
    const el = lineRefs.current[Math.max(0, activeIndex)];
    if (!viewport || !el) return;

    const focal = viewport.clientHeight * FOCAL_RATIO;
    setShift(focal - (el.offsetTop + el.offsetHeight / 2));
  }, [activeIndex, synced, picking]);

  // useLayoutEffect so the reel is never painted at the old position first.
  useLayoutEffect(align, [align]);

  /*
   * Re-measure when the geometry shifts underneath us.
   *
   * A window resize is only one of the ways that happens, and it stopped being
   * the common one: the webfont finishing its swap changes every line's
   * height, translations arriving add a second line of text to every row, and
   * the word card opening takes a slice off the bottom of the viewport without
   * the window changing size at all. A ResizeObserver on the viewport catches
   * all of those, because every one of them ends in this box being a different
   * size or the reel inside it being a different height.
   */
  useEffect(() => {
    if (!synced) return;
    let cancelled = false;
    const settle = () => { if (!cancelled) align(); };

    void document.fonts?.ready.then(settle);

    const viewport = viewportRef.current;
    const reel = viewport?.firstElementChild;
    const observer = new ResizeObserver(settle);
    if (viewport) observer.observe(viewport);
    if (reel) observer.observe(reel);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [align, synced]);

  /**
   * Scrolls a line to the middle of the picker.
   *
   * Used on the way in and by the keyboard, and deliberately instant rather
   * than smooth: opening the picker on a long song would otherwise be a
   * second-long slide from the top of the track past everything in between.
   */
  const revealInPicker = useCallback((index: number, behavior: ScrollBehavior = 'auto') => {
    const viewport = viewportRef.current;
    const el = lineRefs.current[Math.max(0, index)];
    if (!viewport || !el) return;
    // `behavior: 'smooth'` is not covered by the reduced-motion media query the
    // rest of the app answers to — that only governs CSS — so it is checked
    // here as well, or arrow keys would glide for someone who asked for stillness.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    viewport.scrollTo({
      top: el.offsetTop + el.offsetHeight / 2 - viewport.clientHeight / 2,
      behavior: still ? 'auto' : behavior,
    });
  }, []);

  /**
   * Entering and leaving the free-scrolling view.
   *
   * On entry the list is scrolled so the line the clock believes is playing
   * sits in the middle, which is the obvious place to start looking from, and
   * the cursor starts there too so the keyboard has somewhere to move from. On
   * exit the scroll is returned to zero, because the following view positions
   * itself with a transform and any leftover scroll would offset it.
   */
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!picking) {
      viewport.scrollTop = 0;
      setCursor(-1);
      return;
    }
    setCursor(activeIndex);
    revealInPicker(activeIndex);
    // Focus the list itself so the arrow keys work without tabbing into it.
    viewport.focus({ preventScroll: true });
    // Only on entry: re-centring on every tick would fight the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, revealInPicker]);

  /**
   * The shift preview needs the live clock, but the picker is otherwise
   * static, so it is sampled four times a second rather than every frame —
   * enough for a number shown to one decimal place, and nothing at all when
   * the picker is closed.
   */
  useEffect(() => {
    if (!picking) return;
    const read = () => setNow(getPosition());
    read();
    const timer = setInterval(read, PICK_TICK_MS);
    return () => clearInterval(timer);
  }, [picking, getPosition]);

  /** Indices that can actually be chosen — instrumental gaps have no words. */
  const pickable = useMemo(
    () => lines.flatMap((line, i) => (line.text ? [i] : [])),
    [lines],
  );

  /**
   * Arrow keys walk the list while picking.
   *
   * Without this the only way to reach a line from the keyboard was to Tab
   * through every line above it, which on a long song is dozens of presses —
   * so in practice the picker was mouse-only. Enter chooses the line the
   * cursor is on. Escape is handled at the window level, with everything else
   * that closes.
   */
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!picking || pickable.length === 0) return;

    const at = pickable.indexOf(cursor);
    let next: number | null = null;

    if (event.key === 'ArrowDown') next = pickable[Math.min(pickable.length - 1, at + 1)];
    else if (event.key === 'ArrowUp') next = pickable[Math.max(0, at - 1)];
    else if (event.key === 'Home') next = pickable[0];
    else if (event.key === 'End') next = pickable[pickable.length - 1];
    else if (event.key === 'Enter') {
      // Only when the list itself has focus: a row button handles its own
      // Enter, and acting here as well would fire the seek twice.
      // Space is deliberately left alone — it pages a focused scroll container,
      // which is what anyone pressing it in a long list actually wants, and it
      // is the key most easily hit by accident.
      if (event.target !== viewportRef.current) return;
      event.preventDefault();
      if (cursor >= 0) onSeekToLine?.(cursor);
      return;
    } else return;

    event.preventDefault();
    if (next === undefined || next === null) return;
    setCursor(next);
    revealInPicker(next, 'smooth');
  }, [picking, pickable, cursor, onSeekToLine, revealInPicker]);

  /**
   * Lights the active line up word by word as it is sung.
   *
   * LRC carries per-line timings only, so word positions are interpolated
   * across the line's duration — an approximation, which is why words brighten
   * on a ramp rather than snapping on like a hard karaoke wipe.
   *
   * It writes one CSS custom property straight to the DOM each frame rather
   * than going through React state, so it runs at a true 60fps and the lyric
   * list never re-renders. The per-word arithmetic is done in CSS from that
   * single number.
   */
  useEffect(() => {
    const el = lineRefs.current[activeIndex];
    if (!synced || picking || !el || activeIndex < 0) return;

    const start = lines[activeIndex]?.time ?? 0;
    // The SUNG length of the line, not the gap to the next one: across an
    // instrumental break the gap would drag the highlight far behind the voice.
    const gap = (lines[activeIndex + 1]?.time ?? start + LAST_LINE_SECONDS) - start;
    const span = Math.max(0.35, spans?.[activeIndex] ?? gap);
    const words = Number(el.dataset.words ?? 1);

    const tick = () => {
      const progress = Math.min(1, Math.max(0, (getPosition() - start) / span));
      // +0.85 so the first word is already lit as the line arrives, rather
      // than the line sitting dark for a beat.
      el.style.setProperty('--lit', String(progress * words + 0.85));
      litFrame.current = requestAnimationFrame(tick);
    };

    litFrame.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(litFrame.current);
      el.style.removeProperty('--lit');
    };
  }, [activeIndex, lines, spans, synced, picking, getPosition]);

  if (lines.length === 0) return null;

  const mode = !synced ? 'static' : picking ? 'pick' : 'synced';

  return (
    <div className="lyrics screen-in" data-mode={mode}>
      {/*
        The scrolling happens here, one level in from the frame.
        The edge fades below are positioned against the frame, which does not
        scroll — when they were children of the scroller itself they moved with
        the content, and the bottom one's hard lower edge dragged a black band
        across the middle of the line picker.
      */}
      <div
        className="lyrics__scroll"
        ref={viewportRef}
        id="main"
        tabIndex={0}
        role="region"
        aria-label={picking ? 'Choose the line that is playing' : 'Lyrics'}
        onKeyDown={onKeyDown}
      >
        {!synced && (
          <p className="label lyrics__notice">Only unsynced lyrics exist for this track</p>
        )}

        <div
          className="lyrics__reel"
          style={synced && !picking ? { transform: `translate3d(0, ${shift}px, 0)` } : undefined}
        >
          {lines.map((line, i) => (
            <LyricRow
              key={`${line.time}-${i}`}
              line={line}
              index={i}
              distance={Math.min(MAX_DISTANCE, Math.abs(i - activeIndex))}
              isActive={i === activeIndex}
              isPast={i < activeIndex}
              seekable={synced && Boolean(onSeekToLine)}
              showTime={picking}
              translation={line.text ? translate?.(line.text) : undefined}
              translationLang={translationLang}
              studyOn={studyOn && !picking}
              isNow={picking && i === activeIndex}
              isCursor={picking && i === cursor}
              shift={picking && i === cursor ? line.time - now : undefined}
              onSeek={onSeekToLine}
              onWord={onWord}
              onCursor={moveCursor}
              attach={attach}
            />
          ))}
        </div>
      </div>

      {picking && (
        /* Somewhere to come back to. Scrolling a long song quickly loses the
           one line that gives the list its meaning — where the clock thinks
           the song is — and hunting for it again by eye is the moment the
           picker stopped feeling usable. */
        <button
          type="button"
          className="lyrics__recentre"
          onClick={() => { setCursor(activeIndex); revealInPicker(activeIndex, 'smooth'); }}
        >
          <span aria-hidden="true">◎</span>
          Back to now
        </button>
      )}

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
