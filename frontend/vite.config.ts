import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned (not Vite's default 5173): the Auth0 Application's registered
    // callback URL is http://localhost:3000/callback.
    port: 3000,
    strictPort: true,
  },
})
