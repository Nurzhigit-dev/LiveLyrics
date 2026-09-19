import { respondToHealth } from '../../server/identify.mjs';

/** GET /api/health — see api/health.js for what it reports and why. */
export default async () => {
  const { status, body, headers } = respondToHealth(process.env);
  return new Response(JSON.stringify(body), { status, headers });
};

export const config = { path: '/api/health' };
