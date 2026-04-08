import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'types/index': 'src/types/index.ts',
    'utils/index': 'src/utils/index.ts',
    'geometry/index': 'src/geometry/index.ts',
    'node/index': 'src/node/index.ts',
    'group/index': 'src/group/index.ts',
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
