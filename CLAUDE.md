# LiveLyrics — working notes

Listens to music playing in the room, identifies it, and shows time-synced
lyrics that follow along. Built by Nurzhigit (GitHub: `Nurzhigit-dev`).

Read `README.md` first — it explains what the app does and why. This file is
the part that isn't obvious from reading the code, and the mistakes that are
easy to make when changing it.

## Commands

```bash
npm run dev      # dev server; serves /api/* with the same handlers as production
npm run build    # tsc -b && vite build
npm run lint     # oxlint — keep it at zero warnings
```

There are no unit tests. Things are verified by running them: server logic with
small Node scripts, browser logic by importing modules in the browser pane
(`await import('/src/lib/…')`) and driving them with synthetic audio.

**For anything on screen after a match, use `?demo`** — `?demo`, `?demo=ru` or
`?demo=kk` in `npm run dev` opens straight into the synced view with an
invented song playing. Without it the lyric reel, the timeline, the word
highlight and the translations can only be reached by playing real music at a
real microphone. It lives in `src/lib/demo.ts`, is imported dynamically behind
`import.meta.env.DEV`, and never reaches a production build. When importing a
module into the pane to test it, add a cache-buster (`?bust=${Date.now()}`) or
Vite hands back the copy from before your edit.

## Hard rules

- **Never commit `.env.local`.** It holds real ACRCloud credentials. It is
  git-ignored; keep it that way, and check `git status` before committing.
- **Never give these variables a `VITE_` prefix.** Vite inlines anything
  `VITE_*` into the public bundle, which would publish the secret key.
  They are read in the server process only.
- **Never put song lyrics in the repo**, including as test fixtures. Lyrics are
  fetched at runtime from LRCLIB. Test data is invented placeholder text —
  which is exactly what the three songs in `src/lib/demo.ts` are.
- **Never proxy the translators through `server/`.** They meter by IP, so one
  server address would be one daily allowance shared by every visitor. Called
  from the page they cost each visitor only their own, and the deployer
  nothing. This is the opposite of the rule for ACRCloud, and for the opposite
  reason: that one has a secret to protect, these have no key at all.

## Shape of it

One shared brain, three thin adapters:

- `server/identify.mjs` — config checks, request signing, the ACRCloud call,
  and every HTTP decision (status codes, error wording).
- `server/node-http.mjs` — reading a request body whichever way the host left it.
- `api/*.js` (Vercel), `netlify/functions/*.mts` (Netlify), and the plugin in
  `vite.config.ts` (dev) are each a few lines that call those.

Client: `src/hooks/useLiveLyrics.ts` is the engine (listening, recognition,
sync, pause, song changes). `src/App.tsx` only renders.

Interface: `LyricStage` is the reel, `SyncBar` the timeline, `Controls` the
three control groups (top bar / bottom centre / bottom end), `WordCard` one
looked-up word, `MiniLyrics` the floating window's three lines.

Listening has two sources behind one session: `MicSession.open({ source })`
opens the microphone or a shared tab, and everything downstream — the ring
buffer, silence detection, recognition, song changes — is identical for both.

The study layer is deliberately a separate hook, `src/hooks/useStudy.ts`, over
`src/lib/translate.ts` (lines and words) and `src/lib/dictionary.ts` (English
definitions). It touches nothing in the engine, so a translation failing in any
way leaves the lyrics running exactly as before. Keep it that way.

## Decisions that look wrong but aren't

Each of these was a bug once. Please don't "simplify" them back.

- **The clock is anchored to when the recording started**, not when the server
  replied, so the recording length and network round trip cancel out.
- **Song position is `db_begin_time_offset_ms − sample_begin_time_offset_ms`.**
  `play_offset_ms` marks the *end* of the matched audio, not the start; using
  it directly puts the lyrics a whole clip-length ahead.
- **A pause holds at the moment the silence began**, not when it was detected
  seconds later.
- **Silence is relative** (about −12 dB below the music's own level), not
  absolute. A real room's noise floor sits far above digital silence.
- **Lines activate ~0.28s early; words light up on time.** The glide needs a
  moment to land, so a line switching exactly on its timestamp reads as late.
- **Word timing uses `computeSungSpans`**, measured from the song's own pace —
  not the gap to the next line, which smears words across instrumental breaks.
- **The lyric reel moves by `transform`, never `scrollTop`.** Scroll offsets
  can't be composited; the glide stuttered. Exception: unsynced ("static")
  lyrics are a real scroll container.
- **The edge fades are children of `.lyrics`, and `.lyrics__scroll` inside it
  does the scrolling.** An absolutely positioned child of a scroll container is
  placed against its *unscrolled* box, so fades inside the scroller travel with
  the content — invisible while following, but anywhere that really scrolled it
  dragged the bottom fade's hard edge across the middle of the screen as a
  black band. Don't collapse the two elements back into one.
- **The timeline holds the clock at the dragged position** (`scrub ?? hold`
  into `useSongClock`), which is the whole reason the lyrics follow your thumb
  instead of you having to read timecodes. Letting go re-anchors to that
  instant. It replaced a list of lines you tapped one of; don't bring the list
  back as "precision" — the drag is precise, because you are matching what you
  can hear, not what you can read.
- **Nothing that identifies may fire while `adjusting` or `scrub` is set.**
  Scrubbing to the end of a track looks exactly like the track finishing, and
  `listenForNext` would spend a recognition on a song that is still playing.
- **`--f-display` lists Archivo *then* Golos Text.** Archivo has no Cyrillic, so
  that ordering is what puts Russian and Kazakh in a real typeface instead of
  Arial, per character, with no language detection anywhere. Reordering or
  trimming the stack silently breaks every Cyrillic lyric — and the
  translations, which are Cyrillic beneath Latin on the same screen.
- **The song's language is detected, never guessed.** `sl=auto`, and the code
  the translator reports back is what the UI trusts. An earlier version worked
  it out from the script, which is fine until a French song turns up — and
  worse for Kazakh, which a Russian translator does not reject but
  transliterates, confidently and wrongly. Only the two *targets* are fixed
  (RU and EN); the source is whatever the song is.
- **Cache keys are target + text, never source + target + text.** The source is
  a property of the text, so putting it in the key only splits one entry into
  two identical ones. The detected language is cached separately under the
  song's opening line, because a fully cached song fetches nothing and would
  otherwise have no idea what language it is in.
- **The line being sung is translated before the rest of the song.** `useStudy`
  reorders the request to start there and streams each batch into the band as
  it lands. Translating from the top and waiting for all of it meant pressing
  Translate and watching nothing happen — worst of all mid-song, where the line
  you were on was in the last batch to arrive. The active index reaches the
  effect through a ref, never a dependency, or every line change would restart
  the whole translation.
- **Lines are translated in one newline-joined batch, and the line count is
  checked on the way back.** A translator may merge two sentences; an unchecked
  off-by-one puts every later line under the wrong words. On a mismatch it
  redoes the batch one line at a time.
- **The translation is one band under the lyrics, not a line under every line.**
  Putting it on every line took the lyric view from 32 DOM nodes to 243 and
  nearly tripled the layout cost of each line change — which lands exactly when
  the reel is gliding — and it forced the lyrics a size smaller to fit. Word
  buttons exist only within `TAP_DISTANCE` of the active line for the same
  reason. Don't reintroduce per-line translations "so you can read ahead";
  that is what Pause is for.
- **The band is a fixed height and only its text changes.** A band that grew
  with the length of the translation would resize the viewport, which
  re-aligns the reel, which is the expensive part. Two lines of room, clamped.
- **Studying makes words the tap target, so a lyric line is a `<p>` then, not a
  `<button>`.** A button inside a button is invalid and swallows the tap.
  Moving the clock keeps the timeline, and "Play from here" on the word card.
  Lines too far out to have word buttons are not seek buttons either: one tap
  meaning "look this up" near the middle and "jump the song" a line further
  out is a trap for anyone who misjudges the distance.
- **Animation loops go through `useFrameHost()`, never bare `requestAnimationFrame`.**
  A hidden tab is not rendered, so it gets no frames — and with the pop-out
  open the tab is *exactly* what is hidden. The loops beat on whichever window
  is on screen. Callbacks still run in this realm, so `performance.now()` is
  unchanged; only the heartbeat moves. Listing the host in the effect's
  dependencies is what migrates a running loop to the new window.
- **The pop-out is a portal, not a second React root.** One clock, one track,
  one set of translations. A second root would need every one of them kept in
  step, and they would drift the first time something was forgotten.
- **A picture-in-picture document inherits no styles at all**, so `usePopOut`
  copies every sheet into it — as text where it can read the rules, and by
  re-linking the URL where it can't (the webfonts are cross-origin and throw).
- **`documentPictureInPicture` existing is not permission to use it.** An
  embedded webview reports the API and then rejects with "no window". Always
  catch `requestWindow`; an unhandled rejection leaves the button looking
  simply broken.
- **Screen capture must keep its video track.** `getDisplayMedia` will not hand
  over audio alone, and on Chrome stopping the video track can take the whole
  capture down. It is capped at one frame a second and never drawn.
- **A share with no audio track is the normal mistake, not an edge case** —
  picking a window, or missing the tick box. Check `getAudioTracks().length`
  and name the box, or the app sits listening to a picture.
- **A track 'ended' event is the only word that "Stop sharing" was pressed.**
  That button is in the browser's own chrome, outside the page entirely.
- **One filled accent control per bar, and it is the play button.** The tools
  beside it light up as outlines. Filled, they read as equals and the bar
  became four solid shapes with no focus.
- **Nothing blurs the lyric text.** Animating a filter on text re-rasterises
  every glyph every frame. Softness lives in the background (`Ambience`).
- **`LyricStage` and its rows are memoised.** The app re-renders ~10×/sec for
  the clock; without memo the whole lyric list re-rendered with it.
- **Matches scoring under 85 are confirmed by a second listen** before being
  shown. ACRCloud scores 70–100 and returns weak matches happily.
- **Lyric matching requires the artist to match**, not just the title. Titles
  alone return every other song with that name.

### The refs rule in `useLiveLyrics`

Every async flow reads current state from `live.current`, never from closed-over
variables, and writes through the `set.*` helpers (which update the ref *and*
React together). That's what lets a mic callback registered minutes ago, or a
background check that has been waiting 10 seconds, act on what is true now.
Breaking this rule reintroduces stale-closure bugs that are painful to find.

## Testing gotcha

When the browser pane is hidden, `requestAnimationFrame` and CSS transitions
**freeze**. Anything clock- or animation-driven will look broken. Force a frame
by taking a screenshot between reads, and never `await` an rAF there. Don't
mistake this for an app bug — it has wasted time twice.

## Deployment

Live at **https://live-lyrics-ashy.vercel.app** (Vercel account `jigan`,
project `live-lyrics`). Pushing to `main` deploys automatically.

- Env vars live in Vercel → the project's **Environment Variables** page (in the
  main project sidebar, not inside Settings). Changing them requires a
  **redeploy** — existing deployments never see new values.
- **`/api/health`** reports whether the deployment is configured, names what's
  wrong, and spends no recognition quota. Check it first when something fails.
- Only the production domain is free of Vercel's login wall. Other generated
  URLs redirect to `vercel.com/sso-api` unless Deployment Protection is off.

## Cost

ACRCloud's free tier is a monthly pool shared by *all* visitors. Roughly two
recognitions per song, plus one each for a doubtful match, a song change, or
resuming from a pause. Silent audio is never sent. Be deliberate about adding
anything that identifies more often.

Translation costs the deployer nothing (see the hard rule above), but it is
still someone's free service. The whole song is translated once, deduplicated
by line text so a repeated chorus is one translation, and cached in
`localStorage` across sessions. Don't add anything that re-translates text
already on screen.

## Not yet verified

The full path with real music through a real microphone. Everything else —
signing, offsets, lyric matching, silence detection, resampling, the UI states,
the timeline, the translations and the word card — has been exercised
directly. Sync accuracy in a real room is the open question.

Also unverified: how the two translators behave once the day's allowance is
actually spent. The quota path is written from their documented responses, not
from having hit it.

And the floating window itself. The browser pane inside the Claude desktop app
reports `documentPictureInPicture` and then refuses to open one ("Internal
error: no window"), so `MiniLyrics` has only been checked by mounting its
markup inline against the real stylesheet. The portal, the style copying and
the frame-host switch are unexercised — test them in a real Chrome.

Likewise the screen-capture path: both of its failures (picker dismissed, share
with no audio) are verified by stubbing `getDisplayMedia`, but a real share has
never run in this environment.

## Working style

Nurzhigit is learning as he goes. Explain what changed in plain language, say
which part is his to do (dashboard settings, keys) versus mine, and be honest
about what is a limit of the free services rather than something code can fix.
