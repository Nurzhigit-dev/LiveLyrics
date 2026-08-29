import { identify, readCredentials } from '../server/identify.mjs';

/**
 * POST /api/identify
 *
 * Body: raw WAV bytes (application/octet-stream).
 *
 * Taking the audio as a raw body rather than multipart form-data is a
 * deliberate simplification: multipart would need a parser dependency on the
 * server, whereas a raw body is just a stream to collect. The multipart
 * envelope ACRCloud wants is built here instead, where FormData is native.
 */
export const config = {
  api: {
    // The platform's JSON body parser would mangle binary audio.
    bodyParser: false,
  },
};

/** Hard ceiling so a malicious client can't stream us an unbounded upload. */
const MAX_BYTES = 2 * 1024 * 1024;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ kind: 'unknown', message: 'Use POST.' });
  }

  const credentials = readCredentials();
  if (!credentials) {
    // Aimed at whoever deployed the site, not at a visitor.
    return res.status(503).json({
      kind: 'unconfigured',
      message:
        'Recognition is not configured on this deployment. Set ACR_HOST, ACR_ACCESS_KEY and ACR_ACCESS_SECRET.',
    });
  }

  let audio;
  try {
    audio = await readRawBody(req);
  } catch (err) {
    const tooLarge = err instanceof Error && err.message === 'too-large';
    return res.status(tooLarge ? 413 : 400).json({
      kind: 'unknown',
      message: tooLarge ? 'That recording was too large.' : 'Could not read the recording.',
    });
  }

  if (!audio || audio.length < 1000) {
    return res.status(400).json({ kind: 'nomatch', message: 'That recording was empty.' });
  }

  const result = await identify(audio, credentials);

  if (!result.ok) {
    // 200 for "no match": it is a normal outcome, not a transport failure.
    const status = result.kind === 'nomatch' ? 200 : 502;
    return res.status(status).json({ kind: result.kind, message: result.message });
  }

  // Never cache a recognition — the answer is different every few seconds.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ kind: 'ok', track: result.track });
}
