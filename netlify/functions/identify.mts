import { MAX_BYTES, bodyFailure, methodNotAllowed, respondToIdentify } from '../../server/identify.mjs';

/**
 * POST /api/identify — the Netlify function.
 *
 * Netlify's Functions v2 API is built on the standard Request/Response objects
 * rather than Node's (req, res), so it needs its own thin adapter. The decision
 * itself — config checks, size limits, the ACRCloud call, the status codes —
 * comes from server/identify.mjs, the same code the Vercel function and the
 * dev server run.
 *
 * `config.path` maps this to /api/identify, so the frontend's
 * fetch('api/identify') works unchanged on every host.
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return toResponse(methodNotAllowed('POST'));

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) {
    return toResponse(bodyFailure(new Error('too-large')));
  }

  let audio: ArrayBuffer;
  try {
    audio = await req.arrayBuffer();
  } catch (err) {
    return toResponse(bodyFailure(err));
  }

  return toResponse(await respondToIdentify(audio, process.env));
};

export const config = { path: '/api/identify' };

function toResponse({ status, body, headers }: { status: number; body: unknown; headers: Record<string, string> }) {
  return new Response(JSON.stringify(body), { status, headers });
}
