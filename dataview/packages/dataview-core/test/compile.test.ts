import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { MutationEngine } from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from '@dataview/core/types'
import {
  createDataviewCompileScope,
  dataviewIntentHandlers
} from '@dataview/core/operations'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

test('MutationEngine.compile surfaces internal apply failures', () => {
  const result = MutationEngine.compile({
    doc: createEmptyDocument(),
    intents: [{
      type: 'field.create',
      input: {
        name: 'Notes'
      }
    } satisfies Intent],
    handlers: dataviewIntentHandlers,
    createContext: createDataviewCompileScope,
    apply: () => ({
      ok: false as const,
      issue: {
        code: 'compile.applyFailed' as const,
        message: 'apply failed',
        severity: 'error' as const,
        source: {
          index: 0,
          type: 'field.create' as const
        }
      }
    })
  })

  assert.equal(result.issues?.length, 1)
  assert.equal(result.issues?.[0]?.code, 'compile.applyFailed')
  assert.equal(result.issues?.[0]?.message, 'apply failed')
  assert.equal(result.issues?.[0]?.source?.type, 'field.create')
})
