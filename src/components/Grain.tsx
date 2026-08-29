import './Grain.css';

/**
 * A static film-grain and vignette layer stretched over the whole viewport.
 *
 * Why bother: a flat near-black background looks like an empty div. Grain gives
 * the screen a physical surface, so the huge type reads as *printed on* something
 * instead of floating in a void. It is the single cheapest way to stop a dark UI
 * looking like a default template.
 *
 * `feTurbulence` is an SVG filter that generates procedural noise — no image
 * file to download. It renders once and never animates, so it costs nothing
 * after the first paint. `pointer-events: none` keeps it from swallowing clicks.
 */
export function Grain() {
  return (
    <div className="grain" aria-hidden="true">
      <svg className="grain__noise" xmlns="http://www.w3.org/2000/svg">
        <filter id="grain-filter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves={3}
            stitchTiles="stitch"
          />
          {/* Drop the noise to greyscale so it tints nothing. */}
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter)" />
      </svg>
      <div className="grain__vignette" />
    </div>
  );
}
