import {
  MAX_BYTES,
  bodyFailure,
  methodNotAllowed,
  respondToHealth,
  respondToIdentify,
} from './identify.mjs';

/**
 * Node-style (req, res) plumbing, shared by the Vercel function and the Vite
 * dev server so both run the exact same code path.
 *
 * Nothing here depends on a platform's response helpers (`res.status()`,
 * `res.json()`): those exist on Vercel only while its "Node helpers" are
 * enabled, and not at all on a plain Node server. Writing the status, headers
 * and body directly works everywhere.
 */

/** How long to wait on a request stream before giving up on it. */
const STREAM_TIMEOUT_MS = 10000;

/**
 * Collects the request body, however the platform has left it.
 *
 * This is the fix for the Vercel deployment. Vercel's Node runtime can read
 * the request body BEFORE the handler runs, so that it can offer a parsed
 * `req.body`. When that happens the stream is already drained: waiting for
 * 'data' and 'end' events that have already fired means waiting forever, and
 * the function just hangs until the platform kills it. The visitor sees a
 * generic "couldn't reach the server" after twenty seconds.
 *
 * So: use the pre-read body when there is one (for application/octet-stream
 * Vercel hands over the raw bytes), and only read the stream if nobody else
 * has. The stream read also has its own timeout, so no path can hang.
 */
export async function readBody(req) {
  let preRead;
  try {
    // A lazy getter on Vercel; reading it can throw on a malformed header.
    preRead = req.body;
  } catch {
    preRead = undefined;
  }

  if (preRead instanceof Uint8Array) return preRead;
  if (preRead instanceof ArrayBuffer) return new Uint8Array(preRead);

  if (req.readableEnded) return new Uint8Array(0);

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    const onData = (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        cleanup();
        req.destroy();
        reject(new Error('too-large'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, STREAM_TIMEOUT_MS);

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/** Writes a `{ status, body, headers }` decision to a Node response. */
export function send(res, { status, body, headers }) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers ?? {})) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

/** POST /api/identify for any Node-style host. */
export async function handleIdentify(req, res, env = process.env, options = {}) {
  if (req.method !== 'POST') return send(res, methodNotAllowed('POST'));

  let audio;
  try {
    audio = await readBody(req);
  } catch (err) {
    return send(res, bodyFailure(err));
  }

  return send(res, await respondToIdentify(audio, env, options));
}

/** GET /api/health for any Node-style host. */
export function handleHealth(req, res, env = process.env) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, methodNotAllowed('GET'));
  return send(res, respondToHealth(env));
}
