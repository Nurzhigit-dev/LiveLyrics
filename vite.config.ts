import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { handleHealth, handleIdentify } from './server/node-http.mjs'

/**
 * Serves /api/identify and /api/health during `npm run dev`.
 *
 * In production those routes are serverless functions (api/ on Vercel,
 * netlify/functions/ on Netlify). This plugin runs the very same handlers
 * from server/ inside the dev server, so local development and the deployed
 * site behave identically — no "works on my machine" gap, and no second
 * process to start.
 *
 * The credentials are read here, in the Node process. They are deliberately
 * NOT exposed through `import.meta.env`: anything Vite exposes to the client
 * gets inlined into the production bundle, which would publish the secret.
 */
function api(env: Record<string, string>): Plugin {
  const merged = () => ({ ...process.env, ...env })

  return {
    name: 'livelyrics-api',
    configureServer(server) {
      server.middlewares.use('/api/health', (req, res) => handleHealth(req, res, merged()))
      server.middlewares.use('/api/identify', (req, res) =>
        handleIdentify(req, res, merged(), {
          setupHint: 'Copy .env.example to .env.local, fill in your ACRCloud values, then restart npm run dev.',
        }),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The empty prefix loads every var, not just VITE_*. Safe because this object
  // is only ever read inside the dev-server middleware above.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), api(env)],
    // Relative asset paths, so a build works from a domain root or a subpath.
    base: './',
  }
})
