import { memo } from 'react';
import { TARGET_LABEL, type TargetLang } from '../lib/translate';
import './TranslationStrip.css';

interface Props {
  /** The translation of the line being sung, if there is one yet. */
  text?: string;
  /** The language it is in, for the tag and for assistive tech. */
  to: TargetLang;
  /** True while the song is still being translated. */
  loading: boolean;
}

/**
 * One line of translation, in one fixed place.
 *
 * The first version of this put the translation under every lyric line. It
 * read as clutter and it measured as clutter: forty extra elements in the reel
 * took the lyric view from 32 DOM nodes to 243 and nearly tripled the layout
 * cost of every line change — which is a hitch at exactly the moment the reel
 * is gliding. It also forced the lyrics themselves down a size to make room,
 * so the main thing got worse to serve the secondary one.
 *
 * This is the way subtitles have always solved the same problem: leave the
 * thing you are watching alone, and put the words in a band underneath that
 * never moves. The lyric reel is now identical whether translation is on or
 * off. The eye has one place to glance at, the layout never shifts because the
 * band is always the same height, and only the text inside it changes.
 *
 * What it gives up is reading ahead — you see the line being sung, not the
 * next one. That is the right trade for something you use while music is
 * playing: the English of the next line is already on screen above, and if you
 * want to sit with a line, Pause is one press away.
 */
export const TranslationStrip = memo(function TranslationStrip({ text, to, loading }: Props) {
  return (
    <section className="tstrip" aria-live="polite" aria-label="Translation of the line playing">
      <span className="label tstrip__tag" aria-hidden="true">{TARGET_LABEL[to]}</span>

      {text ? (
        /* Keyed on the text so React swaps the element when the line changes,
           which restarts the fade. Only opacity animates — the band's height
           is fixed, so nothing around it can be pushed about. */
        <p key={text} className="tstrip__text" lang={to}>{text}</p>
      ) : (
        <p className="tstrip__text tstrip__text--empty">
          {loading ? 'Translating…' : ''}
        </p>
      )}
    </section>
  );
});
