import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { MutationEngine } from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from '@dataview/core/types'
import {
  compile,
  dataviewMutationModel
} from '@dataview/core/mutation'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

test('MutationEngine.compile lowers field.create into executable operations', () => {
  const mutation = new MutationEngine({
    document: createEmptyDocument(),
    normalize: document => document,
    model: dataviewMutationModel,
    createReader: compile.createReader,
    createProgram: compile.createProgram,
    compile: compile.handlers,
  })
  const result = mutation.execute([{
    type: 'field.create',
    input: {
      name: 'Notes'
    }
  } satisfies Intent])

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.ok(result.commit.document.fields.ids.length === 1)
  const fieldId = result.commit.document.fields.ids[0]
  assert.ok(fieldId)
  assert.equal(result.commit.document.fields.byId[fieldId!]?.name, 'Notes')
})
