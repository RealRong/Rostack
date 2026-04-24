import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { meta as mutationMeta } from '@shared/mutation'
import type { DataDoc } from '@dataview/core/contracts'
import { operation } from '@dataview/core/operation'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

test('operation apply returns shared mutation shape', () => {
  const result = operation.apply(createEmptyDocument(), [{
    type: 'document.field.put',
    field: {
      id: 'field_notes',
      name: 'Notes',
      kind: 'text'
    }
  }])

  assert.ok(result.doc.fields.byId.field_notes)
  assert.equal(result.forward.length, 1)
  assert.equal(result.forward[0]?.type, 'document.field.put')
  assert.equal(result.inverse.length, 1)
  assert.equal(result.inverse[0]?.type, 'document.field.remove')
  assert.ok(result.extra.impact.fields?.inserted?.has('field_notes'))
})

test('operation meta marks external bump as non-history', () => {
  assert.equal(
    mutationMeta.tracksHistory(operation.meta, {
      type: 'external.version.bump',
      source: 'test'
    }),
    false
  )
})
