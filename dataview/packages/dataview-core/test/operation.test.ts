import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { MutationEngine } from '@shared/mutation'
import type { DataDoc } from '@dataview/core/types'
import {
  custom
} from '@dataview/core/custom'
import {
  entities
} from '@dataview/core/entities'
import {
  document as documentApi
} from '@dataview/core/document'
import type {
  DocumentOperation
} from '@dataview/core/op'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

const createMutation = () => new MutationEngine<
  DataDoc,
  {
    noop: {
      intent: {
        type: 'noop'
      }
      output: void
    }
  },
  DocumentOperation
>({
  document: createEmptyDocument(),
  normalize: documentApi.normalize,
  entities,
  custom
})

test('MutationEngine applies canonical field.create with shared inverse', () => {
  const mutation = createMutation()
  const result = mutation.apply([{
    type: 'field.create',
    value: {
      id: 'field_notes',
      name: 'Notes',
      kind: 'text'
    }
  }])

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.ok(result.commit.document.fields.byId.field_notes)
  assert.equal(result.commit.inverse[0]?.type, 'field.delete')
  assert.ok(Boolean(result.commit.delta.changes['field.create']))
})

test('custom external.version.bump skips history and emits delta', () => {
  const mutation = createMutation()
  const result = mutation.apply([{
    type: 'external.version.bump',
    source: 'remote'
  }])

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(result.commit.inverse.length, 0)
  assert.ok(Boolean(result.commit.delta.changes['external.version']))
})
