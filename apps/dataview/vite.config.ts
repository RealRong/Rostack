import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('./', import.meta.url))
const src = fileURLToPath(new URL('../src', import.meta.url))

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      '@': src
    }
  },
  server: {
    host: '127.0.0.1',
    port: 4177
  },
  preview: {
    host: '127.0.0.1',
    port: 4177
  }
})
