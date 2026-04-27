import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import type { DataDoc } from '@dataview/core/types'
import { createEngine } from '@dataview/engine'
import { dataviewSpec } from '@dataview/react'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

test('external version bump does not create undo history', () => {
  const engine = createEngine({
    spec: dataviewSpec,
    document: createEmptyDocument()
  })

  const result = engine.apply([{
    type: 'external.version.bump',
    source: 'test'
  }])

  assert.equal(result.ok, true)
  assert.equal(engine.history.get().canUndo, false)
  assert.equal(engine.history.get().canRedo, false)
})
