import { identify, readCredentials } from '../../server/identify.mjs';

/**
 * POST /api/identify — Netlify Functions build.
 *
 * Netlify's newer "Functions v2" API is built on the standard Request/Response
 * objects, unlike Vercel's Node-style (req, res) streaming handler used in
 * api/identify.js. That difference is exactly why this file exists separately
 * rather than sharing one handler: the two platforms disagree on the function
 * signature, but both can call the same identify()/readCredentials() from
 * server/identify.mjs, so none of the actual logic is duplicated.
 *
 * `config.path` maps this function to /api/identify, so the frontend's
 * fetch('api/identify') call works unchanged — no Netlify-specific URL
 * (/.netlify/functions/...) leaks into the client code.
 */

/** Hard ceiling so a malicious client can't stream us an unbounded upload. */
const MAX_BYTES = 2 * 1024 * 1024;

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return json(405, { kind: 'unknown', message: 'Use POST.' });
  }

  // process.env rather than Netlify.env: it works in Netlify's Node runtime
  // too, and keeps this adapter identical to the Vercel one.
  const credentials = readCredentials(process.env);
  if (!credentials) {
    return json(503, {
      kind: 'unconfigured',
      message:
        'Recognition is not configured on this deployment. Set ACR_HOST, ACR_ACCESS_KEY and ACR_ACCESS_SECRET.',
    });
  }

  let audio: ArrayBuffer;
  try {
    audio = await req.arrayBuffer();
  } catch {
    return json(400, { kind: 'unknown', message: 'Could not read the recording.' });
  }

  if (audio.byteLength > MAX_BYTES) {
    return json(413, { kind: 'unknown', message: 'That recording was too large.' });
  }
  if (audio.byteLength < 1000) {
    return json(400, { kind: 'nomatch', message: 'That recording was empty.' });
  }

  const result = await identify(audio, credentials);

  if (!result.ok) {
    // 200 for "no match": it is a normal outcome, not a transport failure.
    const status = result.kind === 'nomatch' ? 200 : 502;
    return json(status, { kind: result.kind, message: result.message });
  }

  return json(200, { kind: 'ok', track: result.track }, { 'Cache-Control': 'no-store' });
};

export const config = { path: '/api/identify' };

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
