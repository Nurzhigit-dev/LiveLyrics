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

## Hard rules

- **Never commit `.env.local`.** It holds real ACRCloud credentials. It is
  git-ignored; keep it that way, and check `git status` before committing.
- **Never give these variables a `VITE_` prefix.** Vite inlines anything
  `VITE_*` into the public bundle, which would publish the secret key.
  They are read in the server process only.
- **Never put song lyrics in the repo**, including as test fixtures. Lyrics are
  fetched at runtime from LRCLIB. Test data is invented placeholder text.

## Shape of it

One shared brain, three thin adapters:

- `server/identify.mjs` — config checks, request signing, the ACRCloud call,
  and every HTTP decision (status codes, error wording).
- `server/node-http.mjs` — reading a request body whichever way the host left it.
- `api/*.js` (Vercel), `netlify/functions/*.mts` (Netlify), and the plugin in
  `vite.config.ts` (dev) are each a few lines that call those.

Client: `src/hooks/useLiveLyrics.ts` is the engine (listening, recognition,
sync, pause, song changes). `src/App.tsx` only renders.

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
  can't be composited; the glide stuttered. Exception: "find line" mode is a
  real scroll container.
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

## Not yet verified

The full path with real music through a real microphone. Everything else —
signing, offsets, lyric matching, silence detection, resampling, the UI states
— has been exercised directly. Sync accuracy in a real room is the open
question.

## Working style

Nurzhigit is learning as he goes. Explain what changed in plain language, say
which part is his to do (dashboard settings, keys) versus mine, and be honest
about what is a limit of the free services rather than something code can fix.
