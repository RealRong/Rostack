import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { entityTable } from '@shared/core'
import type {
  DataDoc,
  Intent
} from '@dataview/core/contracts'
import { compileIntents } from '@dataview/core/mutation'
import * as mutationSpec from '@dataview/core/mutation/spec'

const createEmptyDocument = (): DataDoc => ({
  schemaVersion: 1,
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  records: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: {}
})

test('compileIntents surfaces internal apply failures', () => {
  const applySpy = vi.spyOn(mutationSpec, 'reduceDataviewOperations').mockReturnValue({
    ok: false,
    error: {
      code: 'invalid',
      message: 'apply failed'
    }
  })

  const result = compileIntents({
    document: createEmptyDocument(),
    intents: [{
      type: 'field.create',
      input: {
        name: 'Notes'
      }
    } satisfies Intent]
  })

  applySpy.mockRestore()

  assert.equal(result.canApply, false)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0]?.code, 'compile.applyFailed')
  assert.equal(result.issues[0]?.message, 'apply failed')
  assert.equal(result.issues[0]?.source.type, 'field.create')
})
