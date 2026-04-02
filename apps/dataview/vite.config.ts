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
        replacement: resolveFromRoot('ui/src/index.ts')
      },
      {
        find: /^@ui\/css\/(.+)$/,
        replacement: `${resolveFromRoot('ui/css')}/$1`
      },
      {
        find: /^@ui\/(.+)$/,
        replacement: `${resolveFromRoot('ui/src')}/$1`
      },
      {
        find: /^@dataview$/,
        replacement: resolveFromRoot('dataview/src/index.ts')
      },
      {
        find: /^@dataview\/(.+)$/,
        replacement: `${resolveFromRoot('dataview/src')}/$1`
      },
      {
        find: /^@whiteboard$/,
        replacement: resolveFromRoot('whiteboard/packages/whiteboard-react/src/index.ts')
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
