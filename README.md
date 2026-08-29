# Lyricwave

Listens to whatever music is playing in the room, works out what it is **and how
far into it you already are**, then shows the lyrics in time with the song.

Point it at a speaker, press Listen, and the words scroll along with the music.

---

## How it works

Three steps, three seconds of your attention:

| Step | What happens |
| --- | --- |
| **Capture** | Eight seconds of mono audio at 8 kHz, straight from the microphone, encoded to WAV in the browser. Nothing is written to disk or uploaded anywhere except the recogniser. |
| **Match** | The sample goes to [ACRCloud](https://www.acrcloud.com), which returns the track *and* `play_offset_ms` — the position in the song the sample came from. |
| **Sync** | Time-coded lyrics come from [LRCLIB](https://lrclib.net), and that offset becomes the anchor the on-screen clock runs from. |

The offset is the part that matters. Plenty of apps can tell you *what* is
playing; knowing *where* in the track you are is what makes it possible to put
the right line on screen at the right moment.

## Cost

Free, with no card at any point.

- **LRCLIB** — genuinely free. No key, no account, no quota.
- **ACRCloud** — free tier, no credit card. You bring your own key (see below).

## Getting a key

Identification needs an ACRCloud key. It is free and takes a few minutes.

1. Sign up at [acrcloud.com](https://www.acrcloud.com).
2. Create a project under **Audio & Video Recognition**.
3. Set **Audio Source** to *Recorded Audio* — the sample comes from a
   microphone in a real room, not a clean audio file.
4. Set **Audio Engine** to *Audio Fingerprinting*.
5. Copy the **Host**, **Access Key** and **Secret Key** from the project list.
6. Open the app, click the gear icon, and paste all three in.

### Where the keys are stored

In your browser's `localStorage`, and nowhere else.

This is deliberate. The obvious alternative — a `.env` file read through
`import.meta.env.VITE_*` — is a trap with Vite: those values are **inlined into
the production bundle at build time**, so the moment you deployed the site your
secret key would be sitting in a public JavaScript file for anyone to read.

Keeping keys in `localStorage` means nothing secret is ever in the repository or
the build output, the site is safe to publish, and each person who uses it
brings their own free key.

The trade-off: the key is readable by anyone with access to that browser
profile. Fine for a personal key on your own machine; not a model for a
multi-user product.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open the URL it prints. A microphone needs a secure context, so it works on
`localhost` and on any `https://` site, but not over plain `http://` to another
machine.

To build for production:

```bash
npm run build
```

The output lands in `dist/` with relative asset paths, so it can be served from
a domain root or a GitHub Pages project subpath without changes.

## Layout

```
src/
  lib/
    audio.ts        microphone capture and WAV encoding
    acrcloud.ts     request signing (HMAC-SHA1) and identification
    lrclib.ts       lyric lookup, with duration-weighted fallback search
    lrc.ts          LRC format parser and active-line search
    credentials.ts  localStorage for the user's own keys
  hooks/
    useSongClock.ts turns a match offset into a live playback position
  components/       the interface
  styles/           design tokens and base styles
```

## Notes on a few decisions

**Every browser audio "enhancement" is switched off.** Echo cancellation, noise
suppression and auto gain are all tuned to isolate a human voice and discard
everything else — which is exactly the music being fingerprinted. Left on,
recognition rates collapse.

**WAV, not the browser's native WebM/Opus.** `MediaRecorder` produces a
different codec in every browser, and a lossy one, which smears the spectral
detail the fingerprint depends on.

**The clock is anchored to when recording started**, not to when the API
replied. ACRCloud reports the offset for the *start* of the submitted sample, so
anchoring there makes the recording duration and the network round trip cancel
out instead of accumulating into a permanent lag.

**Position is derived, never accumulated.** It is recomputed from the wall clock
every frame, so backgrounding the tab (where `requestAnimationFrame` stops
entirely) doesn't desynchronise anything — on return it simply reads the current
time and lands in the right place.

**Sync can be nudged.** Ambient matching is never sample-accurate, so the
transport bar has a ±0.5 s stepper, and clicking any lyric line re-anchors the
clock to that moment.

## Limits

- Needs a reasonably clear signal. A loud room, a quiet speaker or heavy chatter
  over the top will all defeat the fingerprint.
- Only matches what is in ACRCloud's catalogue — live versions, remixes and
  obscure releases often are not.
- Lyrics depend on LRCLIB having an entry. Many tracks have plain lyrics but no
  timed ones; those are shown unsynced, and clearly labelled as such.
- The free tier is capped per month, so it is not built for constant polling.

## Licence

MIT. Lyrics are fetched at runtime from LRCLIB and are not distributed with this
software.
