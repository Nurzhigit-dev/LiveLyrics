import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { identify, readCredentials } from './server/identify.mjs'

/**
 * Serves /api/identify during `npm run dev`.
 *
 * In production that route is a serverless function (api/identify.js). This
 * plugin runs the same core logic inside the dev server so local development
 * and the deployed site behave identically — no "works on my machine" gap, and
 * no need to run a second process.
 *
 * The credentials are read here, in the Node process. They are deliberately
 * NOT exposed through `import.meta.env`: anything Vite exposes to the client
 * gets inlined into the production bundle, which would publish the secret.
 */
function identifyApi(env: Record<string, string>): Plugin {
  return {
    name: 'lyricwave-identify-api',
    configureServer(server) {
      server.middlewares.use('/api/identify', async (req, res) => {
        const json = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(body))
        }

        if (req.method !== 'POST') return json(405, { kind: 'unknown', message: 'Use POST.' })

        const credentials = readCredentials({ ...process.env, ...env })
        if (!credentials) {
          return json(503, {
            kind: 'unconfigured',
            message:
              'Recognition is not configured. Copy .env.example to .env.local and fill in your ACRCloud keys, then restart the dev server.',
          })
        }

        const chunks: Buffer[] = []
        let total = 0
        try {
          for await (const chunk of req) {
            total += chunk.length
            if (total > 2 * 1024 * 1024) return json(413, { kind: 'unknown', message: 'Recording too large.' })
            chunks.push(chunk as Buffer)
          }
        } catch {
          return json(400, { kind: 'unknown', message: 'Could not read the recording.' })
        }

        const audio = Buffer.concat(chunks)
        if (audio.length < 1000) {
          return json(400, { kind: 'nomatch', message: 'That recording was empty.' })
        }

        const result = await identify(audio, credentials)
        if (!result.ok) {
          return json(result.kind === 'nomatch' ? 200 : 502, {
            kind: result.kind,
            message: result.message,
          })
        }
        return json(200, { kind: 'ok', track: result.track })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The empty prefix loads every var, not just VITE_*. Safe because this object
  // is only ever read inside the dev-server middleware above.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), identifyApi(env)],
    // Relative asset paths, so a build works from a domain root or a subpath.
    base: './',
  }
})
