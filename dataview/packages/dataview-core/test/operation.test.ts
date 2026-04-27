import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import type { DataDoc } from '@dataview/core/contracts'
import {
  reduceDataviewOperations
} from '@dataview/core/mutation'
import {
  DATAVIEW_OPERATION_DEFINITIONS
} from '@dataview/core/operation/definition'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

test('operation apply returns shared mutation shape', () => {
  const result = reduceDataviewOperations(createEmptyDocument(), [{
    type: 'document.field.put',
    field: {
      id: 'field_notes',
      name: 'Notes',
      kind: 'text'
    }
  }])

  assert.ok(result.doc.fields.byId.field_notes)
  assert.equal(result.inverse.length, 1)
  assert.equal(result.inverse[0]?.type, 'document.field.remove')
  assert.ok(result.extra.trace.fields?.inserted?.has('field_notes'))
})

test('operation spec marks external bump as non-history', () => {
  assert.equal(
    DATAVIEW_OPERATION_DEFINITIONS['external.version.bump'].history,
    false
  )
})
