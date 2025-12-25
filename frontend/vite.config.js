import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` (development, production, etc.)
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '')
  
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      allowedHosts: ['e4a.khaldosh.dev', 'api.e4a.khaldosh.dev'],
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/media': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
