import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { MutationEngine } from '@shared/mutation'
import type {
  DataDoc,
  DocumentOperation,
  Intent
} from '@dataview/core/types'
import {
  compile,
  dataviewMutationModel,
  type DataviewMutationPorts
} from '@dataview/core/mutation'
import {
  document as documentApi
} from '@dataview/core/document'

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
  DocumentOperation,
  ReturnType<typeof compile.createReader>
>({
  document: createEmptyDocument(),
  normalize: documentApi.normalize,
  model: dataviewMutationModel
})

const createExecuteMutation = () => new MutationEngine<
  DataDoc,
  {
    'field.create': {
      intent: Extract<Intent, { type: 'field.create' }>
      output: {
        id: string
      }
    }
  },
  DocumentOperation,
  ReturnType<typeof compile.createReader>,
  void,
  string,
  DataviewMutationPorts
>({
  document: createEmptyDocument(),
  normalize: documentApi.normalize,
  model: dataviewMutationModel,
  createReader: compile.createReader,
  createProgram: compile.createProgram,
  compile: {
    'field.create': compile.handlers['field.create']
  }
})

test('MutationEngine applies program field.create with typed model inverse', () => {
  const mutation = createMutation()
  const result = mutation.apply({
    steps: [{
      type: 'entity.create',
      entity: {
        kind: 'entity',
        type: 'field',
        id: 'field_notes'
      },
      value: {
        id: 'field_notes',
        name: 'Notes',
        kind: 'text'
      }
    }]
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.ok(result.commit.document.fields.byId.field_notes)
  assert.equal(result.commit.inverse.steps[0]?.type, 'entity.delete')
  assert.ok(Boolean(result.commit.delta.changes['field.create']))
})

test('field.create compiles through typed query reader and emits create delta', () => {
  const mutation = createExecuteMutation()
  const result = mutation.execute({
    type: 'field.create',
    input: {
      name: 'Status',
      kind: 'text'
    }
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(result.commit.outputs.length, 1)
  assert.ok(Boolean(result.commit.delta.changes['field.create']))
})
