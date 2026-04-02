import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repoRoot = path.resolve(__dirname, '../..')
const resolveFromRoot = (relativePath: string) =>
  path.resolve(repoRoot, relativePath)

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@ui$/,
        replacement: resolveFromRoot('ui/index.ts')
      },
      {
        find: /^@ui\/(.+)$/,
        replacement: `${resolveFromRoot('ui')}/$1`
      },
      {
        find: /^@dataview$/,
        replacement: resolveFromRoot('dataview/index.ts')
      },
      {
        find: /^@dataview\/(.+)$/,
        replacement: `${resolveFromRoot('dataview/src')}/$1`
      },
      {
        find: /^@whiteboard$/,
        replacement: resolveFromRoot('whiteboard/index.ts')
      }
    ]
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
