import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createEngine } from '@dataview/engine'
import { createDataViewRuntime } from '@dataview/runtime'
import {
  PERF_PRESETS,
  applyPerfPreset,
  readPerfPresetMeta,
  type PerfPresetId
} from '@dataview/react/page/perfPresets'

const getPreset = (presetId: PerfPresetId) => {
  const preset = PERF_PRESETS.find(item => item.id === presetId)
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`)
  }

  return preset
}

const assertResolvedTableRows = (runtime: ReturnType<typeof createDataViewRuntime>) => {
  const body = runtime.model.table.body.get()
  const items = runtime.source.active.items.list.get()

  assert.ok(body)
  assert.ok(body.columns.length > 0)
  assert.ok(items.ids.length > 0)

  items.ids.slice(0, 32).forEach(itemId => {
    const row = runtime.model.table.row.get(itemId)
    const recordId = row?.recordId
    assert.ok(recordId, `Missing recordId for item ${itemId}`)
    assert.ok(runtime.source.document.records.get(recordId), `Missing record ${recordId} for item ${itemId}`)
  })
}

test('switching perf presets keeps table rows resolvable', () => {
  const engine = createEngine({
    document: getPreset('roadmap-1k').createDocument()
  })
  const runtime = createDataViewRuntime({
    engine
  })

  assertResolvedTableRows(runtime)

  applyPerfPreset({
    engine,
    presetId: 'roadmap-10k'
  })
  assertResolvedTableRows(runtime)

  applyPerfPreset({
    engine,
    presetId: 'engineering-50k'
  })
  assertResolvedTableRows(runtime)

  applyPerfPreset({
    engine,
    presetId: 'dense-20k'
  })
  assertResolvedTableRows(runtime)

  applyPerfPreset({
    engine,
    presetId: 'roadmap-1k'
  })
  assertResolvedTableRows(runtime)

  runtime.dispose()
})

test('switching perf presets updates runtime document meta', () => {
  const engine = createEngine({
    document: getPreset('roadmap-1k').createDocument()
  })
  const runtime = createDataViewRuntime({
    engine
  })

  assert.equal(readPerfPresetMeta(runtime.source.document.meta.get())?.id, 'roadmap-1k')

  applyPerfPreset({
    engine,
    presetId: 'engineering-50k'
  })

  assert.equal(readPerfPresetMeta(runtime.source.document.meta.get())?.id, 'engineering-50k')

  runtime.dispose()
})
