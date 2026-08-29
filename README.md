# Lyricwave

Listens to whatever music is playing in the room, works out what it is **and how
far into it you already are**, then shows the lyrics in time with the song.

Point it at a speaker, press Listen, and the words follow along — lighting up
word by word as they're sung.

---

## How it works

| Step | What happens |
| --- | --- |
| **Hears** | Seven seconds of mono audio at 8 kHz, straight from the microphone, encoded to WAV in the browser. Nothing is stored. |
| **Knows** | The sample goes to our own `/api/identify`, which forwards it to [ACRCloud](https://www.acrcloud.com) and gets back the track *and* `play_offset_ms` — the position in the song the sample came from. |
| **Follows** | Time-coded lyrics come from [LRCLIB](https://lrclib.net), and that offset becomes the anchor the on-screen clock runs from. |

The offset is the part that matters. Plenty of apps can tell you *what* is
playing; knowing *where* in the track you are is what makes it possible to put
the right line on screen at the right moment.

## Cost

Free, with no card at any point.

- **LRCLIB** — genuinely free. No key, no account, no quota.
- **ACRCloud** — free tier, no credit card.

**Visitors need no account and no keys.** The key belongs to whoever deploys the
site, and lives in a server environment variable.

## Running it locally

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your ACRCloud values, then:

```bash
npm run dev
```

A microphone needs a secure context, so this works on `localhost` and on any
`https://` site, but not over plain `http://` to another machine.

### Getting a key (one time, for whoever deploys it)

1. Sign up at [acrcloud.com](https://www.acrcloud.com) — free, no card.
2. Create a project under **Audio & Video Recognition**.
3. Set **Audio Source** to *Recorded Audio* — the sample comes from a
   microphone in a real room, not a clean audio file.
4. Set **Audio Engine** to *Audio Fingerprinting*.
5. Copy the **Host**, **Access Key** and **Secret Key** into `.env.local`.

## Deploying

The app needs one server route, so it wants a host that can run a function —
Vercel, Netlify and Cloudflare all do this free. **Plain GitHub Pages will not
work**, because it serves static files only and cannot keep a secret.

On Vercel: import the repo, then set `ACR_HOST`, `ACR_ACCESS_KEY` and
`ACR_ACCESS_SECRET` as Environment Variables. `api/identify.js` is picked up
automatically.

### Why the key is server-side

An earlier version of this app had each visitor paste their own ACRCloud keys
into the page. That kept the secret out of the repository, but it made the site
unusable for anyone who had not signed up for ACRCloud — which is everyone. Bad
trade.

The obvious alternative is worse: a `.env` file read through
`import.meta.env.VITE_*` gets **inlined into the production bundle at build
time**, so the secret would ship inside a public JavaScript file for anyone to
read. That is why none of these variables carry a `VITE_` prefix — they are read
in the Node process, never handed to the client.

`vite.config.ts` runs the same handler as the deployed function during
`npm run dev`, so local and production behave identically with no second process
to start.

## Layout

```
api/identify.js     serverless route (Vercel-style)
server/identify.mjs request signing and the ACRCloud call, shared by both
                    the deployed function and the dev server
src/
  lib/
    audio.ts        microphone capture and WAV encoding
    identify.ts     thin client for our own /api/identify
    lrclib.ts       lyric lookup, with duration-weighted fallback search
    lrc.ts          LRC parser and active-line search
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

**The clock is anchored to when recording started**, not to when the server
replied. ACRCloud reports the offset for the *start* of the submitted sample, so
anchoring there makes the recording duration and the network round trip cancel
out instead of accumulating into a permanent lag.

**Position is derived, never accumulated.** It is recomputed from the wall clock
every frame, so backgrounding the tab (where `requestAnimationFrame` stops
entirely) doesn't desynchronise anything — on return it reads the current time
and lands in the right place.

**Lines light up word by word.** LRC files only carry per-line timings, so word
positions are interpolated across each line's duration — which is why words
brighten on a soft ramp rather than snapping on like a hard karaoke wipe. This
also solved a UX problem: with only line-level highlighting, nudging the timing
usually produced no visible change at all, so the control felt broken.

**Sync can be corrected.** Ambient matching is never sample-accurate. The
transport bar has a ±0.25 s stepper, the left and right arrow keys do the same
thing, and clicking any lyric line re-anchors the clock to that moment.

**The lyric reel is a real scroll container.** An earlier version computed
`offsetTop` by hand and drove a CSS transform, which went stale on webfont swap,
on rewrap and on resize — drifting by hundreds of pixels. Letting the browser
own the geometry fixed it, and means you can scroll back to re-read a line.

## Limits

- Needs a reasonably clear signal. A loud room, a quiet speaker or heavy chatter
  over the top will all defeat the fingerprint.
- Only matches what is in ACRCloud's catalogue — live takes, remixes and obscure
  releases often are not.
- Lyrics depend on LRCLIB having an entry. Many tracks have plain lyrics but no
  timed ones; those are shown unsynced and clearly labelled.
- The free tier is capped per month, so it is not built for constant polling.

## Licence

MIT. Lyrics are fetched at runtime from LRCLIB and are not distributed with this
software.
