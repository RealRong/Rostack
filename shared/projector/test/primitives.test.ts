import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  projectListChange,
  publishStruct
} from '../src'
import {
  createStageMetrics,
} from '../src/phase'
import {
  createChangeState,
  defineChangeSpec,
  flag,
  hasChangeState,
  takeChangeState
} from '../src/change'

test('projectListChange reports add remove and order change', () => {
  const result = projectListChange({
    previous: ['a', 'b', 'c'],
    next: ['c', 'b', 'd']
  })

  assert.equal(result.changed, true)
  assert.equal(result.orderChanged, true)
  assert.deepEqual(result.added, ['d'])
  assert.deepEqual(result.removed, ['a'])
})

test('publishStruct reuses previous object when every child matches', () => {
  const stable = { ok: true }
  const previous = {
    left: stable,
    right: 1
  }
  const next = {
    left: stable,
    right: 1
  }

  const published = publishStruct({
    previous,
    next,
    keys: ['left', 'right']
  })

  assert.equal(published.value, previous)
  assert.equal(published.changed, false)
  assert.equal(published.reusedNodeCount, 2)
  assert.equal(published.rebuiltNodeCount, 0)
})

test('createStageMetrics derives reused and rebuilt counts from changed nodes', () => {
  assert.deepEqual(
    createStageMetrics({
      inputCount: 2,
      outputCount: 5,
      changedNodeCount: 2,
      changedRecordCount: 3
    }),
    {
      inputCount: 2,
      outputCount: 5,
      reusedNodeCount: 3,
      rebuiltNodeCount: 2,
      changedRecordCount: 3
    }
  )
})

test('takeChangeState clears nested flag fields', () => {
  const spec = defineChangeSpec({
    root: {
      ready: flag(),
      nested: {
        dirty: flag()
      }
    }
  })
  const state = createChangeState(spec)

  state.root.ready = true
  state.root.nested.dirty = true

  const current = takeChangeState(spec, state)

  assert.equal(current.root.ready, true)
  assert.equal(current.root.nested.dirty, true)
  assert.equal(state.root.ready, false)
  assert.equal(state.root.nested.dirty, false)
  assert.equal(hasChangeState(spec, state), false)
})
