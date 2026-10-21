import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any URL prefix.
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
