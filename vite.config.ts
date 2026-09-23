import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Serve /terms (no trailing slash) as terms/index.html in dev + preview,
// matching how static hosts resolve it in production.
function cleanUrls(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url && /^\/terms(\?.*)?$/.test(req.url)) req.url = req.url.replace('/terms', '/terms/')
    next()
  }
  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [cleanUrls(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Multi-page build: index.html -> /, terms/index.html -> /terms
    rolldownOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        terms: path.resolve(__dirname, 'terms/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    port: 4173,
  },
})
