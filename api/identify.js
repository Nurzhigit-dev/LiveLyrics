import { handleIdentify } from '../server/node-http.mjs';

/**
 * POST /api/identify — the Vercel function.
 *
 * Body: raw WAV bytes (application/octet-stream).
 *
 * Deliberately a one-liner: reading the body (including the case where
 * Vercel has already consumed the stream), deciding the answer and writing
 * the response all live in server/, shared with the dev server, so this
 * deployment cannot drift from what runs locally.
 */
export default function handler(req, res) {
  return handleIdentify(req, res, process.env);
}
