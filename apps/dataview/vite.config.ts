import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  root: __dirname,
  plugins: [react(), tsconfigPaths()],
  server: {
    host: '127.0.0.1',
    port: 4177
  },
  preview: {
    host: '127.0.0.1',
    port: 4177
  }
})
