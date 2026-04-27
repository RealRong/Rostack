import assert from 'node:assert/strict'
import { test } from 'vitest'
import type {
  ChangeSchema,
  IdDelta
} from '../src'
import {
  cloneChangeState,
  createChangeState,
  hasChangeState,
  mergeChangeState,
  takeChangeState
} from '../src'

type NestedState = {
  root: {
    dirty: boolean
  }
  ids: IdDelta<string>
  values: ReadonlySet<string>
}

const schema: ChangeSchema<NestedState> = {
  root: {
    dirty: 'flag'
  },
  ids: 'ids',
  values: 'set'
}

test('createChangeState builds empty state from pure string schema', () => {
  const state = createChangeState(schema)

  assert.equal(state.root.dirty, false)
  assert.deepEqual(state.ids.added, new Set())
  assert.deepEqual(state.ids.updated, new Set())
  assert.deepEqual(state.ids.removed, new Set())
  assert.deepEqual(state.values, new Set())
})

test('cloneChangeState copies nested ids and sets', () => {
  const state = createChangeState(schema)
  state.root.dirty = true
  state.ids.added.add('a')
  ;(state.values as Set<string>).add('x')

  const cloned = cloneChangeState(schema, state)
  state.ids.added.add('b')
  ;(state.values as Set<string>).add('y')

  assert.equal(cloned.root.dirty, true)
  assert.deepEqual(cloned.ids.added, new Set(['a']))
  assert.deepEqual(cloned.values, new Set(['x']))
})

test('mergeChangeState unions nested ids and sets and ORs flags', () => {
  const left = createChangeState(schema)
  const right = createChangeState(schema)

  left.root.dirty = true
  left.ids.added.add('a')
  ;(left.values as Set<string>).add('x')

  right.ids.updated.add('b')
  right.ids.removed.add('c')
  ;(right.values as Set<string>).add('y')

  mergeChangeState(schema, left, right)

  assert.equal(left.root.dirty, true)
  assert.deepEqual(left.ids.added, new Set(['a']))
  assert.deepEqual(left.ids.updated, new Set(['b']))
  assert.deepEqual(left.ids.removed, new Set(['c']))
  assert.deepEqual(left.values, new Set(['x', 'y']))
})

test('takeChangeState clears nested flag fields', () => {
  const state = createChangeState(schema)

  state.root.dirty = true
  state.ids.added.add('a')
  ;(state.values as Set<string>).add('x')

  const current = takeChangeState(schema, state)

  assert.equal(current.root.dirty, true)
  assert.deepEqual(current.ids.added, new Set(['a']))
  assert.deepEqual(current.values, new Set(['x']))
  assert.equal(state.root.dirty, false)
  assert.equal(hasChangeState(schema, state), false)
})
