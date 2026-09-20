import type { Track } from '../types';

/**
 * A fake song, for working on the lyric view without music in the room.
 *
 * Opening `?demo` (or `?demo=ru`, `?demo=kk`) in `npm run dev` drops straight
 * into the synced view with a track already playing, so the reel, the
 * word-by-word highlight, the line picker and the translations can all be
 * seen and changed without a speaker, a microphone or a recognition from the
 * monthly quota.
 *
 * Every word below is INVENTED. Real lyrics are never committed to this
 * repository — not even as test data — which is why these read like a song
 * without being one.
 *
 * This module is only ever reached behind `import.meta.env.DEV`, and it is
 * imported dynamically, so none of it reaches a production build.
 */

export interface DemoSong {
  track: Track;
  /** Raw LRC, parsed by the caller exactly as a real lyric file would be. */
  lrc: string;
  /** Seconds into the song to start, so the view opens mid-verse. */
  startAt: number;
}

const ENGLISH = `[00:08.00]I keep the porch light on for nobody
[00:12.40]You said the winter here would treat us kind
[00:17.10]Counting every streetlight on the drive back home
[00:22.30]And I wish that I had asked you what you meant
[00:27.80]
[00:31.20]Oh, hold the line, hold the line
[00:35.60]The morning always finds us where we hid
[00:40.90]Oh, hold the line, hold the line
[00:45.30]I never learned the name of what we did
[00:50.70]Nothing in this house remembers how it started
[00:56.10]A borrowed coat, a letter that I never sent
[01:01.50]You were only ever passing through the doorway
[01:07.00]And the radio kept playing to an empty room
[01:12.40]
[01:18.80]Oh, hold the line, hold the line
[01:23.20]The morning always finds us where we hid
[01:28.50]Oh, hold the line, hold the line
[01:33.90]I never learned the name of what we did
[01:39.20]So put the kettle on and tell me it was nothing
[01:45.60]Tell me that the cold was only in the wire
[01:51.00]I have got a hundred ways of saying nothing
[01:56.40]And every one of them begins with your name`;

const RUSSIAN = `[00:07.50]Я оставил свет на кухне до утра
[00:12.00]Ты сказала, что зима у нас добрее
[00:16.80]Я считаю фонари по дороге назад
[00:21.90]И не спросил тогда, что это значит
[00:27.20]
[00:30.60]Подожди меня, подожди меня
[00:35.00]Нас всегда находит утро там, где мы прятались
[00:40.30]Подожди меня, подожди меня
[00:45.70]Я так и не узнал, как это назвать
[00:51.00]В этом доме ничего не помнит, с чего всё началось
[00:56.40]Чужое пальто и письмо, что я не отправил
[01:01.80]Ты всегда была только в дверях
[01:07.20]А радио играло в пустоту`;

const KAZAKH = `[00:07.50]Дәлізде шам жанып тұр ешкімге емес
[00:12.00]Қыс бізге мейірімді деп айттың сен
[00:16.80]Үйге қайтар жолда шамдарды санаймын
[00:21.90]Сол кезде сұрамадым не дегеніңді
[00:27.20]
[00:30.60]Күте тұр мені, күте тұр мені
[00:35.00]Таң бізді тығылған жерімізден табады
[00:40.30]Күте тұр мені, күте тұр мені
[00:45.70]Мұның атын ешқашан білмедім мен
[00:51.00]Бұл үйде ештеңе басын есіне алмайды
[00:56.40]Бөтен пальто және жібермеген хатым
[01:01.80]Сен тек есік алдында ғана болдың
[01:07.20]Ал радио бос бөлмеге ойнап тұрды`;

const SONGS: Record<string, DemoSong> = {
  en: {
    track: { title: 'Hold the Line (demo)', artist: 'Placeholder', duration: 148, score: 100 },
    lrc: ENGLISH,
    startAt: 33,
  },
  ru: {
    track: { title: 'Подожди меня (демо)', artist: 'Заглушка', duration: 132, score: 100 },
    lrc: RUSSIAN,
    startAt: 32,
  },
  kk: {
    track: { title: 'Күте тұр (демо)', artist: 'Үлгі', duration: 132, score: 100 },
    lrc: KAZAKH,
    startAt: 32,
  },
};

/** `?demo`, `?demo=ru`, `?demo=kk`. An unknown name falls back to English. */
export function demoSong(id: string | null): DemoSong {
  return SONGS[id || 'en'] ?? SONGS.en;
}
