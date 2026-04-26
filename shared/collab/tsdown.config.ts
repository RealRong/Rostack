import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx'],
  unbundle: true,
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: 'neutral'
})
