import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'types/index': 'src/types/index.ts',
    'result/index': 'src/result/index.ts',
    'id/index': 'src/id/index.ts',
    'value/index': 'src/value/index.ts',
    'equality/index': 'src/equality/index.ts',
    'geometry/index': 'src/geometry/index.ts',
    'node/index': 'src/node/index.ts',
    'mindmap/index': 'src/mindmap/index.ts',
    'edge/index': 'src/edge/index.ts',
    'schema/index': 'src/schema/index.ts',
    'kernel/index': 'src/kernel/index.ts',
    'config/index': 'src/config/index.ts',
    'document/index': 'src/document/index.ts',
    'selection/index': 'src/selection/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true
})
