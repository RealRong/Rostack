import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  changeFlag,
  changeSet,
  createChangeState,
  defineChangeSpec,
  hasChangeState,
  ids,
  takeChangeState
} from '../src'

test('takeChangeState clears nested flag fields', () => {
  const spec = defineChangeSpec({
    root: {
      dirty: changeFlag()
    },
    ids: ids<string>(),
    values: changeSet<string>()
  })
  const state = createChangeState(spec)

  state.root.dirty = true
  state.ids.added.add('a')
  ;(state.values as Set<string>).add('x')

  const current = takeChangeState(spec, state)

  assert.equal(current.root.dirty, true)
  assert.deepEqual(current.ids.added, new Set(['a']))
  assert.deepEqual(current.values, new Set(['x']))
  assert.equal(hasChangeState(spec, state), false)
})
