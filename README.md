# LiveLyrics

**Point it at a speaker. It works out what's playing, where in the song you
are, and shows the words in time with the music.**

No account, no API key, no signing in. Open it, press Listen, done.

---

## Why I built this

I kept running into the same small, stupid problem.

Music would be playing on my speaker — not from my phone, not from my laptop,
just *playing in the room* — and I'd want to know the words. Every tool I tried
solved a different problem to the one I actually had. Lyrics sites assume you
already know the song. Music apps only show lyrics for tracks *they* are
playing. Song identifiers tell you the title and then leave you there.

So every single time it was the same routine: pick up my phone, work out what
the song was, search for the lyrics, scroll to roughly the right place, and try
to follow along while the track kept moving without me. By the time I'd found
the right line, the song had moved on.

Nothing did the obvious thing — listen to the room and follow along
automatically. So I built it.

The part that makes it work is a detail most people never think about: it isn't
enough to know *what* is playing, you have to know **how far into it you
already are**. That single number is what turns "here are the lyrics" into
"here is the line being sung right now."

---

## How it works

| Step | What happens |
| --- | --- |
| **Hears** | Ten seconds of mono audio at 8 kHz, straight from the microphone, encoded to WAV in the browser. Nothing is stored or kept. |
| **Knows** | The sample goes to this app's own `/api/identify`, which asks [ACRCloud](https://www.acrcloud.com) what it is — and, crucially, whereabouts in the track the sample came from. |
| **Follows** | Time-coded lyrics come from [LRCLIB](https://lrclib.net). That offset becomes the anchor the on-screen clock runs from, and the words follow the music. |

It also **notices when the music stops.** A lightweight level monitor watches
the room; if it goes quiet, the lyrics hold exactly where they are instead of
running on without you. When sound comes back, they pick up from that same
point.

---

## Features

- **Word-by-word highlighting** — the active line lights up as it's sung, so
  you can see the song moving, not just which line is current
- **Stop detection** — goes quiet, lyrics pause; sound returns, they resume
- **Timing correction that sticks** — nudge it once with the arrow keys or the
  `‹ ›` stepper and it's remembered for every song after that
- **Click any line** to re-anchor the sync to that exact moment
- **Nothing to sign up for** — visitors need no account and no keys
- **Fully keyboard accessible**, with reduced-motion support throughout

---

## Cost

Free, with no card at any point.

- **LRCLIB** — genuinely free. No key, no account, no quota.
- **ACRCloud** — free tier, no credit card required.

One thing worth understanding if you deploy your own copy: the ACRCloud key
belongs to **whoever deploys the site**, not to visitors. That's what makes it
usable by anyone — but it also means the free tier's monthly recognition limit
is a *shared pool across all your visitors combined*, not per person. Fine for
personal use and for showing people. If it ever gets real traffic, that ceiling
is the thing you'll hit first, and the app degrades politely when you do rather
than breaking.

---

## Running it locally

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your ACRCloud values, then:

```bash
npm run dev
```

Microphones require a secure context, so this works on `localhost` and on any
`https://` site — but not over plain `http://` to another machine.

### Getting a key (one time, for whoever deploys it)

1. Sign up at [acrcloud.com](https://www.acrcloud.com) — free, no card.
2. Create a project under **Audio & Video Recognition**.
3. Set **Audio Source** to *Recorded Audio* — the sample comes from a
   microphone in a real room, not a clean audio file.
4. Set **Audio Engine** to *Audio Fingerprinting*.
5. Copy the **Host**, **Access Key** and **Secret Key** into `.env.local`.

---

## Deploying

The app needs one server route, so it wants a host that can run a function —
Vercel, Netlify and Cloudflare all do this on their free tiers. **Plain GitHub
Pages will not work**, because it serves static files only and cannot keep a
secret.

On Vercel: import the repo, then set `ACR_HOST`, `ACR_ACCESS_KEY` and
`ACR_ACCESS_SECRET` as Environment Variables. `api/identify.js` is picked up
automatically.

### Why the key lives on the server

An earlier version of this app had each visitor paste their own ACRCloud keys
into the page. That kept the secret out of the repository, but it made the site
unusable for anyone who hadn't already signed up for ACRCloud — which is
everyone. Bad trade.

The obvious alternative is worse: a `.env` file read through
`import.meta.env.VITE_*` gets **inlined into the production bundle at build
time**, so the secret would ship inside a public JavaScript file for anyone to
read. That's why none of these variables carry a `VITE_` prefix — they're read
in the Node process and never handed to the client.

`vite.config.ts` runs the same handler as the deployed function during
`npm run dev`, so local and production behave identically with no second
process to start.

---

## Layout

```
api/identify.js      serverless route (Vercel-style)
server/identify.mjs  request signing and the ACRCloud call, shared by both
                     the deployed function and the dev server
src/
  lib/
    audio.ts         microphone capture and WAV encoding
    monitor.ts       continuous level monitor for stop detection
    identify.ts      thin client for this app's own /api/identify
    lrclib.ts        lyric lookup, with duration-weighted fallback search
    lrc.ts           LRC parser and active-line search
    calibration.ts   the persistent timing correction
  hooks/
    useSongClock.ts  turns a match offset into a live playback position
  components/        the interface
  styles/            design tokens and base styles
```

---

## Notes on a few decisions

**Every browser audio "enhancement" is switched off.** Echo cancellation, noise
suppression and auto gain are all tuned to isolate a human voice and discard
everything else — which is exactly the music being fingerprinted. Left on,
recognition rates collapse.

**WAV, not the browser's native WebM/Opus.** `MediaRecorder` produces a
different codec in every browser, and a lossy one, which smears the spectral
detail the fingerprint depends on.

**The clock is anchored to when recording started**, not to when the server
replied, so the recording duration and the network round trip cancel out
instead of accumulating into a permanent lag. The capture is timestamped on the
first audio frame that actually arrives — worklet start-up and device warm-up
were otherwise being counted as elapsed song time.

**Position is derived, never accumulated.** It's recomputed from the wall clock
every frame, so backgrounding the tab — where `requestAnimationFrame` stops
entirely — doesn't desynchronise anything. On return it reads the current time
and lands in the right place.

**Lines light up word by word.** LRC files only carry per-line timings, so word
positions are interpolated across each line's duration — which is why words
brighten on a soft ramp rather than snapping on like a hard karaoke wipe. This
also solved a real usability problem: with only line-level highlighting,
nudging the timing usually produced no visible change at all, so the control
felt broken even though it was working.

**The lyric reel moves by `transform`, not `scrollTop`.** Scroll offsets can't
be handed to the compositor, so a per-frame JavaScript scroll animation runs on
the main thread and competes with React — the glide between lines never felt
clean. A CSS transition on `transform` is composited off the main thread.

**Nothing blurs the text.** Distant lines used to fade out of focus with
`filter: blur()`, but animating a filter on text re-rasterises every glyph on
every frame. All the softness now lives in the background instead.

---

## Limits

Worth being honest about what this can and can't do:

- It needs a reasonably clear signal. A loud room, a distant speaker, or people
  talking over the top will all defeat the fingerprint. **Proximity matters far
  more than volume.**
- It only matches what's in ACRCloud's catalogue — live takes, remixes and
  obscure releases often aren't.
- Lyrics depend on LRCLIB having an entry. Plenty of tracks have plain lyrics
  but no timed ones; those are shown unsynced and clearly labelled.
- Ambient sync is never sample-accurate. That's why the timing correction and
  click-to-re-anchor exist.
- The free tier is capped per month, so this isn't built for constant polling.

---

## Licence

MIT — see [LICENSE](LICENSE).

Lyrics are fetched at runtime from LRCLIB and are not distributed with this
software.
