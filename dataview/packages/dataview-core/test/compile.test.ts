import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { MutationEngine } from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from '@dataview/core/types'
import {
  compile
} from '@dataview/core/compile'
import {
  entities
} from '@dataview/core/entities'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

test('MutationEngine.compile surfaces internal apply failures', () => {
  const mutation = new MutationEngine({
    document: createEmptyDocument(),
    normalize: document => document,
    entities,
    compile: compile.handlers
  })
  const result = mutation.execute([{
    type: 'field.create',
    input: {
      name: 'Notes'
    }
  } satisfies Intent])

  assert.equal(result.ok, false)
  if (result.ok) {
    return
  }

  assert.equal(result.error.code, 'mutation_engine.compile.apply_failed')
  assert.match(result.error.message, /Unknown mutation operation/)
})
