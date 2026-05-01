import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { MutationEngine } from '@shared/mutation'
import type { DataDoc } from '@dataview/core/types'
import {
  compile
} from '@dataview/core/mutation'
import {
  dataviewMutationRegistry,
  type DataviewMutationPorts
} from '@dataview/core/mutation'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  createDocumentReader,
  type DocumentReader
} from '@dataview/core/document/reader'
import type {
  DocumentOperation,
  Intent
} from '@dataview/core/types'

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
  DocumentReader
>({
  document: createEmptyDocument(),
  normalize: documentApi.normalize,
  createReader: createDocumentReader,
  registry: dataviewMutationRegistry
})

const createExecuteMutation = () => new MutationEngine<
  DataDoc,
  {
    'external.version.bump': {
      intent: Extract<Intent, { type: 'external.version.bump' }>
      output: void
    }
  },
  DocumentOperation,
  DocumentReader,
  void,
  string,
  DataviewMutationPorts
>({
  document: createEmptyDocument(),
  normalize: documentApi.normalize,
  createReader: createDocumentReader,
  registry: dataviewMutationRegistry,
  compile: {
    'external.version.bump': compile.handlers['external.version.bump']
  }
})

test('MutationEngine applies program field.create with shared inverse', () => {
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

test('external.version.bump compiles to semantic delta without history', () => {
  const mutation = createExecuteMutation()
  const result = mutation.execute({
    type: 'external.version.bump',
    source: 'remote'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(result.commit.inverse.steps.length, 0)
  assert.ok(Boolean(result.commit.delta.changes['external.version']))
})
