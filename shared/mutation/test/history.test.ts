import assert from 'node:assert/strict'
import { test } from 'vitest'
import { history } from '../src/history'
import type {
  MutationProgram
} from '../src/engine/program/program'

type TestWrite = {
  rev: number
  at: number
  origin: 'user' | 'remote' | 'system' | 'history'
  doc: {}
  authored: readonly string[]
  applied: MutationProgram
  inverse: MutationProgram
  footprint: readonly string[]
  extra: {}
}

const createWrite = (
  input: Partial<TestWrite> = {}
): TestWrite => ({
  rev: 1,
  at: 1,
  origin: 'user',
  doc: {},
  authored: ['forward'],
  applied: {
    steps: [{
      type: 'semantic.tag',
      value: 'forward'
    }]
  },
  inverse: {
    steps: [{
      type: 'semantic.tag',
      value: 'inverse'
    }]
  },
  footprint: ['a'],
  extra: {},
  ...input
})

test('history controller captures writes and confirms undo redo', () => {
  const controller = history.create<string, string, TestWrite>({
    conflicts: (left, right) => left.some((key) => right.includes(key)),
    capacity: 10
  })

  controller.capture(createWrite())
  assert.deepEqual(controller.state(), {
    canUndo: true,
    canRedo: false,
    undoDepth: 1,
    redoDepth: 0,
    invalidatedDepth: 0,
    isApplying: false
  })

  assert.deepEqual(controller.undo(), {
    steps: [{
      type: 'semantic.tag',
      value: 'inverse'
    }]
  })
  assert.equal(controller.state().isApplying, true)
  controller.confirm()
  assert.deepEqual(controller.state(), {
    canUndo: false,
    canRedo: true,
    undoDepth: 0,
    redoDepth: 1,
    invalidatedDepth: 0,
    isApplying: false
  })

  assert.deepEqual(controller.redo(), {
    steps: [{
      type: 'semantic.tag',
      value: 'forward'
    }]
  })
  controller.confirm()
  assert.deepEqual(controller.state(), {
    canUndo: true,
    canRedo: false,
    undoDepth: 1,
    redoDepth: 0,
    invalidatedDepth: 0,
    isApplying: false
  })
})

test('history controller restores pending entries on cancel restore', () => {
  const controller = history.create<string, string, TestWrite>({
    conflicts: () => false
  })

  controller.capture(createWrite())
  controller.undo()
  controller.cancel('restore')

  assert.equal(controller.state().undoDepth, 1)
  assert.equal(controller.state().redoDepth, 0)
  assert.equal(controller.state().isApplying, false)
})

test('history controller invalidates pending entries on cancel invalidate', () => {
  const controller = history.create<string, string, TestWrite>({
    conflicts: () => false
  })

  controller.capture(createWrite())
  controller.undo()
  controller.cancel('invalidate')

  assert.equal(controller.state().undoDepth, 0)
  assert.equal(controller.state().redoDepth, 0)
  assert.equal(controller.state().invalidatedDepth, 1)
})

test('history controller invalidates conflicting entries after remote observe', () => {
  const controller = history.create<string, string, TestWrite>({
    conflicts: (left, right) => left.some((key) => right.includes(key))
  })

  controller.capture(createWrite(), {
    id: 'change_local',
    footprint: ['field.a']
  })
  controller.observe('change_remote', ['field.a'])

  assert.equal(controller.state().undoDepth, 0)
  assert.equal(controller.state().invalidatedDepth, 1)
})

test('history controller trims undo stack by capacity', () => {
  const controller = history.create<string, string, TestWrite>({
    conflicts: () => false,
    capacity: 2
  })

  controller.capture(createWrite({
    authored: ['f1'],
    applied: {
      steps: [{
        type: 'semantic.tag',
        value: 'f1'
      }]
    },
    inverse: {
      steps: [{
        type: 'semantic.tag',
        value: 'i1'
      }]
    }
  }))
  controller.capture(createWrite({
    authored: ['f2'],
    applied: {
      steps: [{
        type: 'semantic.tag',
        value: 'f2'
      }]
    },
    inverse: {
      steps: [{
        type: 'semantic.tag',
        value: 'i2'
      }]
    }
  }))
  controller.capture(createWrite({
    authored: ['f3'],
    applied: {
      steps: [{
        type: 'semantic.tag',
        value: 'f3'
      }]
    },
    inverse: {
      steps: [{
        type: 'semantic.tag',
        value: 'i3'
      }]
    }
  }))

  assert.equal(controller.state().undoDepth, 2)
  assert.deepEqual(controller.undo(), {
    steps: [{
      type: 'semantic.tag',
      value: 'i3'
    }]
  })
  controller.confirm()
  assert.deepEqual(controller.undo(), {
    steps: [{
      type: 'semantic.tag',
      value: 'i2'
    }]
  })
})
