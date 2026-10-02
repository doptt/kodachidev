import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'

export default defineConfig(({ mode }) => {
  // Load .env.local into the Node process so api/contact.ts can read it in dev.
  // None of this reaches the browser, Vite only exposes VITE_ variables.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value

  return {
    base: '/',
    plugins: [cleanUrls(), devApi(), react(), tailwindcss()],
    build: {
      // index.html is /, terms/index.html is /terms
      rolldownOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          terms: path.resolve(__dirname, 'terms/index.html'),
        },
      },
    },
    server: { port: 5173, open: true },
    preview: { port: 4173 },
  }
})

// Serve /terms without the trailing slash locally, like Vercel does
function cleanUrls(): Plugin {
  const rewrite = (req: IncomingMessage, _res: unknown, next: () => void) => {
    if (req.url && /^\/terms(\?.*)?$/.test(req.url)) req.url = req.url.replace('/terms', '/terms/')
    next()
  }
  return {
    name: 'clean-urls',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  }
}

// Runs api/contact.ts inside the dev server so the form works locally
// without the Vercel CLI. Production uses Vercel Functions instead.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/contact', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' }).end()
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)

          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value)
          }

          const request = new Request(`http://${req.headers.host}${req.originalUrl}`, {
            method: 'POST',
            headers,
            body: new Uint8Array(Buffer.concat(chunks)),
          })

          const { POST } = await server.ssrLoadModule('/api/contact.ts')
          const response: Response = await POST(request)

          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (err) {
          console.error('[dev-api]', err)
          res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Dev server error.' }))
        }
      })
    },
  }
}
