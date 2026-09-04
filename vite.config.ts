import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? '/bookshelf_manager/' : '/',
  build: {
    outDir: process.env.BUILD_OUTPUT_DIR ?? 'dist'
  }
}))
