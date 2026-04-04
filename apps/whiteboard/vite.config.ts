import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '../..')
const whiteboardRoot = path.resolve(repoRoot, 'whiteboard')
const resolveFromRoot = (relativePath: string) =>
  path.resolve(repoRoot, relativePath)
const resolveWhiteboard = (relativePath: string) =>
  path.resolve(whiteboardRoot, relativePath)

const coreSrc = resolveWhiteboard('packages/whiteboard-core/src')
const collabSrc = resolveWhiteboard('packages/whiteboard-collab/src')
const editorSrc = resolveWhiteboard('packages/whiteboard-editor/src')
const engineSrc = resolveWhiteboard('packages/whiteboard-engine/src')
const reactSrc = resolveWhiteboard('packages/whiteboard-react/src')

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
      },
      {
        find: /^@whiteboard\/react$/,
        replacement: path.join(reactSrc, 'index.ts')
      },
      {
        find: /^@whiteboard\/collab$/,
        replacement: path.join(collabSrc, 'index.ts')
      },
      {
        find: /^@whiteboard\/editor$/,
        replacement: path.join(editorSrc, 'index.ts')
      },
      {
        find: /^@whiteboard\/editor\/draw$/,
        replacement: path.join(editorSrc, 'draw.ts')
      },
      {
        find: /^@whiteboard\/engine$/,
        replacement: path.join(engineSrc, 'index.ts')
      },
      {
        find: '@engine-types',
        replacement: path.join(engineSrc, 'types', 'index.ts')
      },
      {
        find: /^@engine-types\/(.*)$/,
        replacement: path.join(engineSrc, 'types', '$1')
      },
      {
        find: /^@whiteboard\/core\/(types|utils|geometry|node|mindmap|edge|schema|kernel|perf|runtime|config|document|read)$/,
        replacement: `${coreSrc}/$1/index.ts`
      },
      {
        find: /^types(\/.*)?$/,
        replacement: `${reactSrc}/types$1`
      }
    ]
  },
  server: {
    port: 5173
  }
})
