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
| **Hears** | Ten seconds from the microphone, captured at the device's own rate and converted to 8 kHz mono in the browser. Nothing is stored or kept. |
| **Knows** | The clip goes to this app's own `/api/identify`, which asks [ACRCloud](https://www.acrcloud.com) what it is and whereabouts in the track the clip came from. |
| **Finds the words** | Time-coded lyrics come from [LRCLIB](https://lrclib.net). The lookup searches under every spelling it knows, in Latin and Cyrillic, and picks the entry that matches by title, artist *and* song length. |
| **Follows** | That position becomes the anchor for the on-screen clock, and the words follow the music. |

After that it keeps listening, quietly:

- **It notices when the music stops.** The lyrics hold at the moment the silence began, and pick up from there when sound comes back.
- **It double-checks itself.** Shortly after a match it takes a second measurement and corrects the timing. That also catches a first match that landed on the wrong repeat of a chorus.
- **It won't show a guess.** The recogniser scores matches from 70 to 100. Anything below 85 is only shown if a second, later listen names the same song.
- **It follows you to the next song.** When a track ends, or the room changes song while paused, it identifies the new one and swaps the lyrics over.

---

## Features

- **Pause and resume**, by button or the space bar, holding the lyrics exactly where they were
- **Find line**: scroll the lyrics freely, tap the line that's playing, and it carries on from there — with the timestamps beside each line, the line the clock believes in marked `now`, and a preview of how far the sync is about to move
- **Read along in Russian or Kazakh**, and tap any word for what it means — see [Studying English with it](#studying-english-with-it)
- **Word-by-word highlighting**, paced to each song's own tempo rather than smeared across instrumental breaks
- **Russian and Kazakh songs** match even when the recogniser and the lyric database spell the names in different scripts: `Zemfira` finds `Земфира`
- **Stop detection**, with an automatic re-sync on resume
- **Timing correction that sticks**: nudge it once with the arrow keys or the `‹ ›` stepper and it's remembered for every song after that
- **Click any line** to re-anchor the sync to that exact moment
- **Nothing to sign up for**: visitors need no account and no keys
- **Fully keyboard accessible**, with reduced-motion support throughout

---

## Studying English with it

Press **Translate** in the bar. It cycles: off → **RU** → **KK** → off.

With it on, two things change.

**Every line gets its meaning underneath it.** Not just the line being sung —
the whole song is translated at once, so you can read ahead, and the line
picker shows the translations too, which turns out to be the easiest way to
find your place in a song you don't fully understand.

**Every word becomes tappable.** Tap one and a card opens under the lyrics
with:

- what it means, in your language
- its other meanings, grouped by part of speech — a song almost never wants a
  word's first meaning
- what it means in *English*, from Wiktionary, with an example sentence. This
  is the part that teaches rather than just swapping one word for another
- the line it came from, in both languages, so the word keeps its context

Inflected words are followed to their root: tap **hid** and you get the entry
for **hide**, not "simple past of hide". Tapping a word is a lookup, not a
seek, so while you're reading, **Play from here** on the card does what
tapping a line does when translation is off.

**Which way it translates is decided by the song, not the setting.** English
lyrics go into the language you picked. A Russian song with **RU** selected
goes to English instead, because translating it into the language it is
already in would tell you nothing. A Kazakh song with **RU** selected goes to
Russian. The Kazakh letters — `ә ғ қ ң ө ұ ү һ і` — are what tells Kazakh and
Russian apart; without that check, a Kazakh line sent to a Russian translator
doesn't fail, it quietly comes back as nonsense.

Everything translated is remembered in your browser, so a chorus costs one
translation however many times it comes round, and a song you play again
tomorrow costs nothing.

---

## Cost

Free, with no card at any point.

- **LRCLIB**: genuinely free. No key, no account, no quota.
- **ACRCloud**: free tier, no credit card required.

The ACRCloud key belongs to **whoever deploys the site**, not to visitors. That's what makes it usable by anyone, but it also means the free tier's monthly recognition limit is a *shared pool across all your visitors combined*.

A typical song uses about two recognitions: the match, plus one confirming check. A doubtful match, a song change, or resuming after a pause each add one. Silent recordings are never sent, so an empty room costs nothing. When the pool runs out, the app says so politely rather than breaking.

**Translation is free too, and costs the deployer nothing at all.** It is the one part of the app that does *not* go through this server: the page talks to the translators directly, so the usage counts against each visitor's own address rather than pooling into one. There is no key to hold and nothing to configure — the Translate button simply works on any deployment.

---

## Running it locally

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your ACRCloud values, then:

```bash
npm run dev
```

Microphones require a secure context, so this works on `localhost` and on any `https://` site, but not over plain `http://` to another machine.

### Getting a key (one time, for whoever deploys it)

1. Sign up at [acrcloud.com](https://www.acrcloud.com). It's free and needs no card.
2. Create a project under **Audio & Video Recognition**.
3. Set **Audio Source** to *Recorded Audio*, because the sample comes from a microphone in a real room, not a clean audio file.
4. Set **Audio Engine** to *Audio Fingerprinting*.
5. Copy the **Host**, **Access Key** and **Secret Key** into `.env.local`.

---

## Deploying

The app needs one server route, so it wants a host that can run a function. Vercel and Netlify both work on their free tiers, and this repo is set up for both. **Plain GitHub Pages will not work**: it serves static files only and cannot keep a secret.

### Vercel

1. Import the repo. Vercel detects Vite and picks up the functions in `api/` automatically.
2. **Settings → Environment Variables**: add `ACR_HOST`, `ACR_ACCESS_KEY` and `ACR_ACCESS_SECRET`. Paste the bare values, with no quotes, and tick both **Production** and **Preview**.
3. **Redeploy** (Deployments → the latest one → ⋯ → Redeploy). A deployment only sees the variables that existed when it was built, so adding them afterwards does nothing until you redeploy.
4. Open `https://<your-site>/api/health`. It should say `"configured": true`. If it doesn't, it names exactly which variable is missing or still holds placeholder text.

**If visitors are asked to log in to Vercel**, that's Vercel's *Deployment Protection*, not this app. It guards every URL except your production domain. Share the production domain (the one listed under **Domains** on the project page), or turn protection off under **Settings → Deployment Protection**.

### Netlify

Import the repo. `netlify.toml` sets up the build, and the functions in `netlify/functions/` serve the same `/api/*` routes. Add the same three variables under **Site configuration → Environment variables**, redeploy, and check `/api/health`.

### Why the key lives on the server

An earlier version had each visitor paste their own ACRCloud keys into the page. That kept the secret out of the repository, but it made the site unusable for anyone who hadn't already signed up for ACRCloud, which is everyone.

The obvious alternative is worse. A `.env` file read through `import.meta.env.VITE_*` gets **inlined into the production bundle at build time**, so the secret would ship inside a public JavaScript file for anyone to read. That's why none of these variables carry a `VITE_` prefix: they're read in the server process and never handed to the client.

All three hosts (the Vercel function, the Netlify function and the dev server) run the same handler from `server/`, so local and production behave identically.

---

## Layout

```
api/                 Vercel functions (identify, health)
netlify/functions/   Netlify functions (identify, health)
server/
  identify.mjs       config checks, request signing, the ACRCloud call, and
                     every HTTP decision, shared by all three hosts
  node-http.mjs      reading a request body however the platform left it
src/
  lib/
    mic.ts           one continuous microphone session with a rolling buffer
    audio.ts         resampling, levelling and WAV encoding
    identify.ts      thin client for this app's own /api/identify
    lrclib.ts        the multi-spelling lyric search and scoring
    translit.ts      Cyrillic ↔ Latin, and script-neutral name comparison
    lrc.ts           LRC parsing, active-line search, sung-length estimates
    calibration.ts   the persistent timing correction
    translate.ts     batched line translation, word lookup, and the cache
    dictionary.ts    English definitions from Wiktionary, for the word card
    demo.ts          an invented song for working on the UI (dev builds only)
  hooks/
    useLiveLyrics.ts the listening, recognition and sync engine
    useSongClock.ts  turns a match position into a live playback position
    useStudy.ts      the second language, and the word card
  components/        the interface
  styles/            design tokens and base styles
```

### Working on the lyric view without music

Everything on screen after a match — the reel, the word-by-word highlight, the
line picker, the translations — needs a song playing in the room to appear at
all, which makes it awkward to work on.

So `npm run dev` accepts `?demo`:

| | |
| --- | --- |
| `localhost:5173/?demo` | an English song |
| `localhost:5173/?demo=ru` | a Russian one |
| `localhost:5173/?demo=kk` | a Kazakh one |

Each drops straight into the synced view, mid-verse, with no microphone and no
recognition spent. The words are invented — no real lyrics live in this
repository, not even as test data — and the whole thing is behind
`import.meta.env.DEV`, so none of it reaches a production build.

---

## Notes on a few decisions

**Every browser audio "enhancement" is switched off.** Echo cancellation, noise suppression and auto gain are all tuned to isolate a human voice and discard everything else, which is exactly the music being fingerprinted. Left on, recognition rates collapse.

**Captured at the device's rate, converted afterwards.** Asking the browser for an 8 kHz microphone works in Chrome but throws in Firefox. Recording at the native rate and resampling with an `OfflineAudioContext` works everywhere. The level is normalised first, so a quiet, distant recording keeps its detail.

**One microphone session, with a 30-second rolling buffer.** A failed match retries by sliding the window six seconds forward rather than recording ten fresh ones, and background re-checks reuse audio that has already been heard.

**A weak match is confirmed before it is shown.** The recogniser reports its confidence from 70 to 100, and offers a 70 as readily as a 100. Low-confidence matches are where wrong songs come from, so they are held back until a second listen agrees. If the two disagree, the app says it couldn't place the song rather than showing a guess.

**The lyric search requires the performer to match, not just the title.** A search by title alone also returns every other song with that title, and short common ones — "Любовь", "Мама", "Ночь" — have dozens. An earlier version accepted any of them whose length happened to land within three seconds of ours, which among pop songs is close to a coin flip, and produced confident lyrics for entirely the wrong song.

**Names are matched across scripts.** The recogniser and the lyric database often write the same song differently (a romanised name against the Cyrillic original), which made Russian and Kazakh songs look unrecognised when they had been identified fine. The lookup searches in both scripts and compares names in a script-neutral form. It also retries politely when LRCLIB throttles it, rather than reporting "no lyrics" for a song whose lyrics are right there.

**The position is read from the matched slice.** The recogniser reports which part of the clip it matched and where that part sits in the track. The difference between the two is the position at the clip's first moment, which is what the clock is anchored to.

**A pause holds the lyrics where the silence began**, not where it was noticed a few seconds later. Holding at the noticing point put the lyrics seconds ahead after every pause.

**Silence is judged relative to the music, not in absolute terms.** An earlier version required near-digital silence before it would call a track stopped, which essentially never happens — a fan, a laptop, traffic outside all sit well above it — so a stopped track went unnoticed. The test is now how far the level has fallen below how loud the music has been. A quiet passage inside a song can trip it, which is tolerated deliberately: the lyrics hold for a moment, and the resume check re-measures against the room and corrects itself.

**Lines arrive a quarter-second early; words light up on time.** The glide to a new line takes a moment, and a line that starts moving exactly on its timestamp visibly lands after the singer has begun. So lines lead slightly, while the word-by-word highlight stays on the beat.

**Words are paced by each song's tempo.** LRC files only say when a line starts. Assuming a line lasts until the next one made the highlight crawl across instrumental breaks. Instead, the song's own seconds-per-character is measured from its consecutive lines, and each line is paced from that.

**Position is derived, never accumulated.** It's recomputed from the wall clock every frame, so a backgrounded tab (where `requestAnimationFrame` stops entirely) doesn't desynchronise anything.

**The lyric reel moves by `transform`, and nothing blurs the text.** Transforms are animated by the compositor, off the main thread. Animating a `filter` on text would re-rasterise every glyph on every frame, so all the softness lives in the background instead.

**The edge fades hang off a frame, not off the scroller.** They used to be children of the scrolling element, and an absolutely positioned child of a scroll container is placed against its *unscrolled* box — so both fades travelled with the content. Nothing showed while following, because nothing scrolls there. But in the line picker, which really does scroll, the bottom fade's hard lower edge was dragged into the middle of the screen: a black band lying across the lyrics that looked like a rendering fault. The scrolling now happens one element in, and the fades are positioned against an outer frame that cannot scroll.

**Cyrillic has its own typeface, chosen by the browser one character at a time.** Archivo — which carries the whole design — ships no Cyrillic at all, so every Russian and Kazakh lyric was quietly falling through to Arial: a different skeleton, a different weight, none of the variable axes, and the Kazakh letters at the mercy of whatever the device happened to have installed. Golos Text, a ParaType face drawn for Russian and covering Kazakh, now sits *behind* Archivo in the stack rather than replacing it. Font fallback is resolved per character, so the Cyrillic lands in Golos while the Latin stays in Archivo, with no class to toggle and no language to detect — which is also exactly what a translated line needs, with both scripts on screen at once. Google serves each family split by script, so a page of English lyrics never downloads the Cyrillic and a page of Kazakh ones never downloads the Latin.

**The translators are called from the page, not from this server.** They meter by IP address, so proxying them would pool every visitor into a single daily allowance and the first person to open the site would spend it for everyone. Called from the browser, each visitor spends only their own — and there is no key for the deployer to obtain, which keeps the Translate button working on any deployment with no setup.

**Lines are translated in one batch, and the count is checked on the way back.** A whole song joined by newlines is one request instead of forty, which is the difference between the study view being instant and it trickling in. But a translator is free to merge two sentences into one, and a silent off-by-one would put every remaining line against the wrong words — so if the number of lines doesn't survive the round trip, the batch is redone one line at a time, which always lines up.

---

## Limits

Worth being honest about what this can and can't do:

- It needs a reasonably clear signal. A loud room, a distant speaker, or people talking over the top will all defeat the fingerprint. **Proximity matters far more than volume.**
- It only matches what's in ACRCloud's catalogue. Live takes, remixes and very local releases often aren't there, and that includes a lot of Kazakh music.
- Lyrics depend on LRCLIB having an entry. When a song is recognised but has no lyrics, the app names the song and says so, rather than pretending it didn't hear it.
- Ambient sync is never sample-accurate. That's why the self-check, the timing correction and **Find line** exist.
- Whether a song is recognised at all is ACRCloud's catalogue, not something this code can fix. What it can do — and does — is refuse to show a match it isn't sure of.
- The free tier is capped per month and shared by all visitors.
- **The translations are machine translations of song lyrics**, which is close to the hardest thing you can hand a translator: metaphor, ellipsis, deliberate ambiguity, and lines that only mean anything next to the one before. Expect the sense, not the poetry. Kazakh is noticeably weaker than Russian in both directions, because there is far less of it for the translators to have learned from.
- The better of the two translators is an **undocumented endpoint**. It is the one with the dictionary — parts of speech, several senses per word — and it has no practical daily limit, but nobody promised it would keep working. If it stops, the app falls back to MyMemory, which is documented and free but knows nothing about parts of speech and allows roughly 5,000 characters a day per address. The lyrics themselves are unaffected either way: a failed translation is one quiet line above the transport bar, and the song keeps scrolling underneath it.

---

## Licence

MIT. See [LICENSE](LICENSE).

Lyrics are fetched at runtime from LRCLIB and are not distributed with this software.
