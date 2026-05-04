import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  root: __dirname,
  plugins: [react(), tsconfigPaths()],
  build: {
    rollupOptions: {
      input: {
        whiteboard: path.resolve(__dirname, 'index.html'),
        dataview: path.resolve(__dirname, 'dataview.html')
      }
    }
  },
  server: {
    port: 5173
  }
})
