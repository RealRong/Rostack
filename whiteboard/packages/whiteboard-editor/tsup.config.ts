import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/draw.ts',
    'src/insert.ts'
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true
})
