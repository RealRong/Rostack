import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { MutationEngine } from '@shared/mutation'
import type { DataDoc } from '@dataview/core/types'
import {
  dataviewMutationKeyCodec,
  dataviewOperationTable,
  dataviewReduceSpec
} from '@dataview/core/operations'
import {
  DATAVIEW_OPERATION_DEFINITIONS
} from '@dataview/core/operations/definitions'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

const operationsRuntime = {
  table: dataviewOperationTable,
  serializeKey: dataviewMutationKeyCodec.serialize,
  ...(dataviewMutationKeyCodec.conflicts
    ? {
        conflicts: dataviewMutationKeyCodec.conflicts
      }
    : {}),
  ...(dataviewReduceSpec.createContext
    ? {
        createContext: dataviewReduceSpec.createContext
      }
    : {}),
  ...(dataviewReduceSpec.validate
    ? {
        validate: dataviewReduceSpec.validate
      }
    : {}),
  ...(dataviewReduceSpec.settle
    ? {
        settle: dataviewReduceSpec.settle
      }
    : {}),
  done: dataviewReduceSpec.done
} as const

test('MutationEngine.reduce returns shared mutation shape', () => {
  const result = MutationEngine.reduce({
    document: createEmptyDocument(),
    ops: [{
      type: 'document.field.put',
      field: {
        id: 'field_notes',
        name: 'Notes',
        kind: 'text'
      }
    }],
    operations: operationsRuntime
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

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
