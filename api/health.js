import { handleHealth } from '../server/node-http.mjs';

/**
 * GET /api/health — is this deployment wired up?
 *
 * Open it in a browser after deploying. It says whether the ACRCloud variables
 * are present and plausible, without revealing them and without spending a
 * recognition from the monthly quota.
 */
export default function handler(req, res) {
  return handleHealth(req, res, process.env);
}
