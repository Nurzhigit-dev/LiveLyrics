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

- **Listen to this computer instead of the room** — share the tab your music is in and the recogniser gets the audio as it was made, not re-recorded off a speaker
- **Pop the lyrics out** into a small window that floats over everything else, so you can watch the video and read along
- **Pause and resume**, by button or the space bar, holding the lyrics exactly where they were
- **Adjust**: drag until the words on screen are the ones you can hear — a ten-second fine shift for the correction you almost always need, and the whole song underneath for the times you are on the wrong verse entirely
- **Read along in Russian or English**, whatever the song is sung in, and tap any word for what it means — see [Studying English with it](#studying-english-with-it)
- **Word-by-word highlighting**, paced to each song's own tempo rather than smeared across instrumental breaks
- **Russian and Kazakh songs** match even when the recogniser and the lyric database spell the names in different scripts: `Zemfira` finds `Земфира`
- **Stop detection**, with an automatic re-sync on resume
- **Timing correction that sticks**: nudge it once with the arrow keys or the `‹ ›` stepper and it's remembered for every song after that
- **Click any line** to re-anchor the sync to that exact moment
- **Nothing to sign up for**: visitors need no account and no keys
- **Fully keyboard accessible**, with reduced-motion support throughout

---

## Two ways to listen

**The room, through the microphone.** The default, and the one that works
everywhere: point it at a speaker and press Listen.

**This computer's own sound.** If the music is already playing on the machine
you're reading on — a video, a stream, anything in another tab — press
*"Playing on this computer? Use its sound instead"* and pick that tab.

The second one is better whenever it applies, and by a distance:

- The recogniser gets the audio as the file was made, instead of a recording
  of a speaker made by a microphone in a room. Far more songs match, and the
  position it reports is more accurate.
- Silence is *really* silence, so a pause is noticed the instant it happens
  rather than when the level drops below the room's noise floor.
- **It follows the next video on its own.** When one track ends and another
  starts, the gap is heard, the new song is identified, and its lyrics swap in.
- It works with headphones on, which the microphone obviously cannot.

The catch is browser support: sharing a tab's audio needs Chrome or Edge on a
computer. Safari can't, Firefox can't, and phones can't — so the option is
simply not offered there rather than offered and broken. On Windows you can
also share your whole screen with **system audio** and catch sound from
outside the browser entirely; macOS only allows tab audio.

### Without the sharing banner

Sharing a tab makes Chrome put a banner across the top of it, and there is no
way for this app to remove that — it is a security indicator, and a page being
able to hide the fact that it is recording would be the whole problem such
indicators exist to prevent. The same goes for the strip along the top of the
floating window.

There is, though, a way to not need the share at all. Many sound cards expose
a **loopback input** — Windows calls it *Stereo Mix*, some Realtek drivers say
*What U Hear*, and virtual cables (VB-Audio, VoiceMeeter, BlackHole) add one
to any machine. To a browser that is just a microphone. Pick it under **Listen
through** on the front screen and you get exactly what a tab share gets — this
computer's own sound, clean — with no banner, no picker, and nothing beyond
the microphone permission the app already asks for.

Whether you have one depends on your sound hardware. If the list shows only
your actual microphone, your card does not expose it, and a virtual cable is
the way to add one. The picker itself only appears once the browser will tell
the page what the inputs are called, which is after microphone permission has
been granted at least once.

Nothing is recorded or kept, and the video half of the share is never looked
at — the API refuses to hand over audio without it, so it is capped at one
frame a second and dropped on the floor.

---

## The floating window

Press **Pop out**. The lyrics move into a small window that stays on top of
whatever you do next, which is the point: you are there to watch the video,
not to watch a lyrics site.

It shows the line before, the line being sung and the line coming, plus the
track and a pause button. The line being sung keeps the **word-by-word light**
from the main view, which is the one piece of motion that earns its place in a
window this small: it tells you where in the line the singer is, and that is
exactly what you lose by not being able to watch the reel move.

Just the words — no translation. The band under the main lyrics is for
reading; this is for glancing at while you watch something else, and two
languages in four lines is not a glance.

Resize it to taste. Everything is sized off one number that tracks the window,
and it follows the *smaller* of width and height — drag it wide and short, the
natural shape for a strip of lyrics over a video, and type sized off the width
alone would run straight out of the bottom.

It is the same app, not a copy: one clock, one track, one set of
translations, rendered into a second window through a portal. Nothing has to
be kept in step because there is nothing to keep in step.

One thing this needed underneath: **a browser stops giving a hidden tab
animation frames**, so the moment you switch to YouTube the clock would freeze
and the lyrics with it. The pop-out window is visible even when the tab isn't,
so the app takes its heartbeat from whichever window is actually on screen.

The strip along its top with the site's name on it is Chrome's own, and cannot
be removed for the same reason the sharing banner cannot.

Chrome and Edge only, again — it's the Document Picture-in-Picture API, and
there is no honest way to fake it elsewhere.

---

## Studying English with it

Press **Translate** in the bar, and pick **RU** or **EN** beside it.

With it on, two things change.

**A band appears under the lyrics with the meaning of the line being sung.**
Like subtitles: the lyrics themselves are untouched — same size, same
spacing, exactly as they look with translation off — and there is one fixed
place to glance at. It never moves, because the band is always the same
height whatever is in it.

The line you are on is translated first, in a request small enough to come
back almost immediately, and the rest of the song streams in behind it. So
pressing Translate halfway through a track fills the band in at once rather
than after the whole song has been fetched.

**Words near the line being sung become tappable.** Tap one and a card opens
under the lyrics with:

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

What this gives up is reading ahead — you see the line being sung, not the
next one. That's the right trade for something used while music is playing:
the English of what's coming is already on screen above, and if you want to
sit with a line, Pause is one press away.

### It doesn't care what the song is in

You choose the language you're reading *in* — Russian or English. The song's
own language is never assumed: it is detected, every time, by the translator
itself. So a French track, or Spanish, or Kazakh, reads exactly as well as an
English one. There is no list of supported languages to fall off the end of.

The one case that needs a decision is a song already in the language you
picked, and it makes it for you: a Russian song with **RU** selected is shown
in English instead, because translating it into the language it is already
written in would tell you nothing. The button for that language then greys
out, and says why.

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
    mic.ts           one continuous listening session with a rolling buffer,
                     from the microphone or from a shared tab
    frames.ts        which window the animation loops beat on
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
    usePopOut.ts     the floating window, and getting the styles into it
  components/
    LyricStage.tsx   the reel, the word-by-word highlight, the translations
    SyncBar.tsx      the timeline, and the fine timing stepper
    Controls.tsx     the three control groups, and where each one lives
    WordCard.tsx     one word: meaning, senses, definition, context
    MiniLyrics.tsx   three lines, for the floating window
    …                the rest of the interface
  styles/            design tokens and base styles
```

### Working on the lyric view without music

Everything on screen after a match — the reel, the word-by-word highlight, the
timeline, the translations — needs a song playing in the room to appear at
all, which makes it awkward to work on.

So `npm run dev` accepts `?demo`:

| | |
| --- | --- |
| `localhost:5173/?demo` | an English song |
| `localhost:5173/?demo=ru` | a Russian one |
| `localhost:5173/?demo=kk` | a Kazakh one — the case where neither reading language is the song's own |

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

**The edge fades hang off a frame, not off the scroller.** They used to be children of the scrolling element, and an absolutely positioned child of a scroll container is placed against its *unscrolled* box — so both fades travelled with the content. Nothing showed while following, because nothing scrolls there. But in anything that really scrolled, the bottom fade's hard lower edge was dragged into the middle of the screen: a black band lying across the lyrics that looked like a rendering fault. The scrolling now happens one element in, and the fades are positioned against an outer frame that cannot scroll.

**A correction made by hand is never undone by one made automatically.** The confirming re-check that runs shortly after a match used to compare against whatever the anchor was when it *started measuring* — so a correction made before that simply became the new baseline, and the check then dragged it halfway back towards the recogniser's own estimate a few seconds later. From the outside that looks exactly like fixing the sync and having nothing happen, which is what it was. It hid for as long as it did because through a microphone that check usually heard nothing worth acting on; give it clean audio from a shared tab and it succeeds nearly every time.

**One slider spanning the whole song was the wrong instrument.** Almost every correction anyone actually needs is a second or two, and on a bar three minutes wide that is about ten pixels — asking someone to land a two-second fix by moving ten pixels is asking them to move a pin ten metres using a map of the world. The control you reach for first now spans ten seconds instead, roughly a fiftieth of the travel per second. It also writes to the *persistent* correction rather than to this song's anchor, which means it is remembered for every song afterwards and no background re-check can reach it. The whole-song bar is still there, one row down and half the height, for the other job: being on completely the wrong part of the track.

**Fixing the sync is a drag, not a choice from a list.** The first version of this was a scrollable list of every line with its timestamp, and you tapped the one you could hear. It was precise and it was hard work: you had to read a list of lines you didn't recognise, find the words, and commit — and being out by a verse meant scrolling, hunting and trying again. The timeline is the ordinary gesture for "the song is further along than you think", and the trick that makes it work is that the clock is *held* at the dragged position, so the lyrics behind the panel move with your thumb. You never read a timecode. You drag until the line on screen is the line in the room, and let go.

**The controls are in three places, by what they are for.** They were one row of six in the bottom-right corner, which meant reading all six every time you wanted one, and nothing said which of them would end the session. Now: starting over and finishing live in the top bar, out of the way; the one control you reach for while listening — pause — sits alone in the middle of the bottom bar where it can be hit without looking; and the two that change how the lyrics read are at the end. The fine timing stepper left the bar altogether and lives inside the timeline, next to the coarse correction it belongs with. Only one control in the bar is filled with the accent colour, and it is the play button: when the tools were filled too, four solid shapes sat in a row and none of them looked more important than the others.

**Cyrillic has its own typeface, chosen by the browser one character at a time.** Archivo — which carries the whole design — ships no Cyrillic at all, so every Russian and Kazakh lyric was quietly falling through to Arial: a different skeleton, a different weight, none of the variable axes, and the Kazakh letters at the mercy of whatever the device happened to have installed. Golos Text, a ParaType face drawn for Russian and covering Kazakh, now sits *behind* Archivo in the stack rather than replacing it. Font fallback is resolved per character, so the Cyrillic lands in Golos while the Latin stays in Archivo, with no class to toggle and no language to detect — which is also exactly what a translated line needs, with both scripts on screen at once. Google serves each family split by script, so a page of English lyrics never downloads the Cyrillic and a page of Kazakh ones never downloads the Latin.

**The translators are called from the page, not from this server.** They meter by IP address, so proxying them would pool every visitor into a single daily allowance and the first person to open the site would spend it for everyone. Called from the browser, each visitor spends only their own — and there is no key for the deployer to obtain, which keeps the Translate button working on any deployment with no setup.

**The translation is a subtitle, not a second line of the song.** The first version put it under every lyric line, which read as clutter and measured as clutter: forty extra elements took the lyric view from 32 DOM nodes to 243 and nearly tripled the layout cost of every line change — a hitch at exactly the moment the reel is gliding. It also pushed the lyrics themselves down a size to make room, so the main thing got worse to serve the secondary one. One band at the bottom, fixed height, showing the line being sung, is how subtitles have always solved the same problem, and it leaves the lyrics completely alone. Word buttons went the same way: they exist only within two lines of the one being sung, which is the window where tapping is a real gesture rather than a theoretical one — the other two hundred were pure weight. Together: 243 nodes down to 76, and the per-line-change layout cost from 2.8× the no-translation baseline to 1.9×.

**Lines are translated in one batch, and the count is checked on the way back.** A whole song joined by newlines is one request instead of forty, which is the difference between the study view being instant and it trickling in. But a translator is free to merge two sentences into one, and a silent off-by-one would put every remaining line against the wrong words — so if the number of lines doesn't survive the round trip, the batch is redone one line at a time, which always lines up.

---

## Limits

Worth being honest about what this can and can't do:

- It needs a reasonably clear signal. A loud room, a distant speaker, or people talking over the top will all defeat the fingerprint. **Proximity matters far more than volume.**
- It only matches what's in ACRCloud's catalogue. Live takes, remixes and very local releases often aren't there, and that includes a lot of Kazakh music.
- Lyrics depend on LRCLIB having an entry. When a song is recognised but has no lyrics, the app names the song and says so, rather than pretending it didn't hear it.
- Ambient sync is never sample-accurate. That's why the self-check, the timing correction and **Adjust** exist.
- Whether a song is recognised at all is ACRCloud's catalogue, not something this code can fix. What it can do — and does — is refuse to show a match it isn't sure of.
- The free tier is capped per month and shared by all visitors.
- **The translations are machine translations of song lyrics**, which is close to the hardest thing you can hand a translator: metaphor, ellipsis, deliberate ambiguity, and lines that only mean anything next to the one before. Expect the sense, not the poetry. Quality also varies a lot by source language — a Kazakh or Georgian track will read more roughly than a French or Spanish one, simply because there is less of it for the translators to have learned from.
- The better of the two translators is an **undocumented endpoint**. It is the one with the dictionary — parts of speech, several senses per word — and it has no practical daily limit, but nobody promised it would keep working. If it stops, the app falls back to MyMemory, which is documented and free but knows nothing about parts of speech and allows roughly 5,000 characters a day per address. The lyrics themselves are unaffected either way: a failed translation is one quiet line above the transport bar, and the song keeps scrolling underneath it.

---

## Licence

MIT. See [LICENSE](LICENSE).

Lyrics are fetched at runtime from LRCLIB and are not distributed with this software.
