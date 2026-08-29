import './Ambience.css';

/**
 * The lit colour field behind everything.
 *
 * Four large, heavily blurred pools of colour that drift slowly past each
 * other. This is where all the softness in the design lives — which is
 * deliberate, because it means the *type* never has to be blurred.
 *
 * That distinction matters for performance as much as for looks. An earlier
 * version blurred the distant lyric lines to create depth, and animating a
 * filter on text forces the browser to re-rasterise every glyph on every
 * frame — the single biggest cause of the stutter. Here the blur is set once
 * on four elements and never animated; only `transform` changes, which the
 * compositor handles without repainting anything.
 */
export function Ambience() {
  return (
    <div className="ambience" aria-hidden="true">
      <span className="ambience__pool ambience__pool--1" />
      <span className="ambience__pool ambience__pool--2" />
      <span className="ambience__pool ambience__pool--3" />
      <span className="ambience__pool ambience__pool--4" />
      {/* Darkens the outer edges so the centre reads as the lit area. */}
      <span className="ambience__vignette" />
    </div>
  );
}
