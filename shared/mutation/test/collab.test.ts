import assert from 'node:assert/strict'
import { test } from 'vitest'
import { collab } from '../src/collab'
import { history } from '../src/history'
import { meta } from '../src/meta'

type TestOp =
  | {
      type: 'doc.set'
      value: string
    }
  | {
      type: 'doc.reset'
      value: string
    }

type TestWrite = {
  rev: number
  at: number
  origin: 'user' | 'remote' | 'system' | 'load' | 'history'
  doc: string
  forward: readonly TestOp[]
  inverse: readonly TestOp[]
  footprint: readonly string[]
  extra: {}
}

const TEST_META = meta.create<TestOp>({
  'doc.set': {
    family: 'doc',
    sync: 'live'
  },
  'doc.reset': {
    family: 'doc',
    sync: 'checkpoint'
  }
})

const createMemoryStore = () => {
  let checkpoint: {
    id: string
    doc: string
  } | null = null
  let changes: {
    id: string
    actorId: string
    ops: readonly TestOp[]
    footprint: readonly string[]
  }[] = []
  const listeners = new Set<() => void>()

  return {
    store: {
      read: () => ({
        checkpoint,
        changes
      }),
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      append: (change) => {
        changes = [...changes, change]
        listeners.forEach((listener) => listener())
      },
      checkpoint: (nextCheckpoint) => {
        checkpoint = nextCheckpoint
        listeners.forEach((listener) => listener())
      },
      clearChanges: () => {
        changes = []
        listeners.forEach((listener) => listener())
      }
    },
    snapshot: () => ({
      checkpoint,
      changes
    })
  }
}

const createEngine = (doc = 'base') => {
  let current = doc
  const writeListeners = new Set<(write: TestWrite) => void>()

  return {
    engine: {
      doc: () => current,
      replace: (nextDoc: string) => {
        current = nextDoc
        return true
      },
      apply: (ops: readonly TestOp[]) => {
        ops.forEach((op) => {
          if (op.type === 'doc.set' || op.type === 'doc.reset') {
            current = op.value
          }
        })
        return true
      },
      writes: {
        subscribe: (listener: (write: TestWrite) => void) => {
          writeListeners.add(listener)
          return () => {
            writeListeners.delete(listener)
          }
        }
      }
    },
    emit: (write: TestWrite) => {
      current = write.doc
      writeListeners.forEach((listener) => listener(write))
    },
    doc: () => current
  }
}

test('collab bootstrap writes initial checkpoint', () => {
  const memoryStore = createMemoryStore()
  const engineRuntime = createEngine('doc_a')
  const controller = history.create<TestOp, string, TestWrite>({
    conflicts: (left, right) => left.some((key) => right.includes(key))
  })

  const session = collab.create({
    actorId: 'actor_a',
    engine: engineRuntime.engine,
    store: memoryStore.store,
    meta: TEST_META,
    history: controller,
    empty: () => 'empty',
    createId: () => 'id_bootstrap'
  })

  session.start()

  assert.equal(memoryStore.snapshot().checkpoint?.doc, 'doc_a')
  assert.equal(memoryStore.snapshot().changes.length, 0)
})

test('collab publishes local live writes and replays remote changes', () => {
  const memoryStore = createMemoryStore()
  const engineRuntime = createEngine('doc_a')
  const controller = history.create<TestOp, string, TestWrite>({
    conflicts: (left, right) => left.some((key) => right.includes(key))
  })
  let nextId = 1

  const session = collab.create({
    actorId: 'actor_a',
    engine: engineRuntime.engine,
    store: memoryStore.store,
    meta: TEST_META,
    history: controller,
    empty: () => 'empty',
    createId: () => `id_${nextId++}`
  })

  session.start()
  engineRuntime.emit({
    rev: 1,
    at: 1,
    origin: 'user',
    doc: 'doc_local',
    forward: [{
      type: 'doc.set',
      value: 'doc_local'
    }],
    inverse: [{
      type: 'doc.set',
      value: 'doc_a'
    }],
    footprint: ['field.a'],
    extra: {}
  })

  assert.equal(memoryStore.snapshot().changes.length, 1)
  assert.equal(memoryStore.snapshot().changes[0]?.actorId, 'actor_a')

  memoryStore.store.append({
    id: 'id_remote',
    actorId: 'actor_b',
    ops: [{
      type: 'doc.set',
      value: 'doc_remote'
    }],
    footprint: ['field.b']
  })

  assert.equal(engineRuntime.doc(), 'doc_remote')
})

test('collab checkpoint writes reset change log and clear history', () => {
  const memoryStore = createMemoryStore()
  const engineRuntime = createEngine('doc_a')
  const controller = history.create<TestOp, string, TestWrite>({
    conflicts: (left, right) => left.some((key) => right.includes(key))
  })

  const session = collab.create({
    actorId: 'actor_a',
    engine: engineRuntime.engine,
    store: memoryStore.store,
    meta: TEST_META,
    history: controller,
    empty: () => 'empty',
    createId: () => 'id_fixed'
  })

  session.start()
  controller.capture({
    rev: 1,
    at: 1,
    origin: 'user',
    doc: 'doc_local',
    forward: [{
      type: 'doc.set',
      value: 'doc_local'
    }],
    inverse: [{
      type: 'doc.set',
      value: 'doc_a'
    }],
    footprint: ['field.a'],
    extra: {}
  })

  engineRuntime.emit({
    rev: 2,
    at: 2,
    origin: 'system',
    doc: 'doc_reset',
    forward: [{
      type: 'doc.reset',
      value: 'doc_reset'
    }],
    inverse: [],
    footprint: [],
    extra: {}
  })

  assert.equal(memoryStore.snapshot().checkpoint?.doc, 'doc_reset')
  assert.equal(memoryStore.snapshot().changes.length, 0)
  assert.equal(controller.state().undoDepth, 0)
})
