/**
 * Choosing which input to listen through.
 *
 * This exists for one reason: Chrome's screen-sharing bar. Capturing a tab's
 * audio puts a banner across the top of the page being shared and a title
 * strip on the floating window, and neither can be removed — they are security
 * indicators, and a page being able to hide the fact that it is recording
 * would defeat the point of having them.
 *
 * What a page *can* do is not need the share. Many sound cards expose a
 * loopback input — Windows calls it Stereo Mix, some Realtek drivers call it
 * What U Hear, and virtual cables (VB-Audio, VoiceMeeter, BlackHole) add one
 * on any machine. To the browser that is simply a microphone. Picked here, it
 * hands over exactly the same thing a tab share would: this computer's own
 * sound, clean — with no banner, no picker and no permission beyond the
 * microphone one the app already asks for.
 */

const REMEMBERED = 'livelyrics.input';

/**
 * Names that mean "this is the computer's own output, fed back in".
 *
 * Matching on names is crude, and it is only ever used to *suggest* — the
 * device is chosen by its id, and a device this misses is still in the list to
 * be picked by hand.
 */
const LOOPBACK =
  /stereo\s*mix|what\s*u\s*hear|wave\s*out|loopback|vb[-\s]?(audio|cable)|cable\s*output|voicemeeter|blackhole|soundflower|monitor of /i;

export interface AudioInput {
  id: string;
  label: string;
  /** True when the name says it carries this computer's own sound. */
  loopback: boolean;
}

/**
 * The audio inputs this browser will name.
 *
 * Before microphone permission has ever been granted, the browser reports that
 * inputs exist but not what they are called — an unlabelled list is no use to
 * anyone, so it comes back empty and the picker stays hidden until there is
 * something worth showing.
 */
export async function listAudioInputs(): Promise<AudioInput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId && d.label)
      // 'default' and 'communications' are the same hardware under another
      // name; listing them as separate choices only invites picking wrong.
      .filter((d) => d.deviceId !== 'communications')
      .map((d) => ({ id: d.deviceId, label: d.label, loopback: LOOPBACK.test(d.label) }));
  } catch {
    return [];
  }
}

export function loadInput(): string | null {
  try {
    return localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

export function saveInput(id: string | null): void {
  try {
    if (id) localStorage.setItem(REMEMBERED, id);
    else localStorage.removeItem(REMEMBERED);
  } catch {
    // Private window, or storage disabled. The choice holds for this session.
  }
}
