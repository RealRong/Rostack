import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  type ApplyCommit,
  type CommitRecord,
  mutationResult,
  history
} from '@shared/mutation'
import { createMutationCollabSession } from '../src'

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

type TestChange = {
  id: string
  actorId: string
  ops: readonly TestOp[]
  footprint: readonly string[]
}

type TestCheckpoint = {
  id: string
  doc: string
}

const createMemoryStore = () => {
  let checkpoint: TestCheckpoint | null = null
  let changes: TestChange[] = []
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
      append: (change: TestChange) => {
        changes = [...changes, change]
        listeners.forEach((listener) => listener())
      },
      checkpoint: (nextCheckpoint: TestCheckpoint) => {
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
  const controller = history.create<TestOp, string, TestWrite>({
    conflicts: (left, right) => left.some((key) => right.includes(key))
  })
  const writeListeners = new Set<(write: TestWrite) => void>()
  const commitListeners = new Set<(commit: CommitRecord<string, TestOp, string, {}>) => void>()
  let nextRev = 1

  const emitCommit = (
    commit: CommitRecord<string, TestOp, string, {}>
  ) => {
    current = commit.doc
    commitListeners.forEach((listener) => listener(commit))
    if (commit.kind === 'apply') {
      writeListeners.forEach((listener) => listener(commit))
    }
  }

  return {
    engine: {
      doc: () => current,
      replace: (nextDoc: string, options?: {
        origin?: TestWrite['origin']
      }) => {
        current = nextDoc
        controller.clear()
        emitCommit({
          kind: 'replace',
          rev: nextRev++,
          at: 0,
          origin: options?.origin ?? 'system',
          doc: nextDoc
        })
        return true
      },
      apply: (ops: readonly TestOp[], options?: {
        origin?: TestWrite['origin']
      }) => {
        ops.forEach((op) => {
          current = op.value
        })
        const write: TestWrite = {
          rev: 0,
          at: 0,
          origin: options?.origin ?? 'system',
          doc: current,
          forward: ops,
          inverse: [],
          footprint: [],
          extra: {}
        }
        emitCommit({
          kind: 'apply',
          ...write
        } satisfies ApplyCommit<string, TestOp, string, {}>)
        return mutationResult.success(undefined, write)
      },
      commits: {
        subscribe: (listener: (commit: CommitRecord<string, TestOp, string, {}>) => void) => {
          commitListeners.add(listener)
          return () => {
            commitListeners.delete(listener)
          }
        }
      },
      writes: {
        subscribe: (listener: (write: TestWrite) => void) => {
          writeListeners.add(listener)
          return () => {
            writeListeners.delete(listener)
          }
        }
      },
      history: controller
    },
    emit: (write: TestWrite) => {
      emitCommit({
        kind: 'apply',
        ...write
      })
    },
    doc: () => current,
    history: controller
  }
}

test('collab bootstrap writes initial checkpoint', () => {
  const memoryStore = createMemoryStore()
  const engineRuntime = createEngine('doc_a')

  const session = createMutationCollabSession(engineRuntime.engine, {
    actor: {
      id: 'actor_a',
      createChangeId: () => 'id_bootstrap'
    },
    transport: {
      store: memoryStore.store
    },
    document: {
      empty: () => 'empty',
      checkpoint: {
        create: (doc) => ({
          id: 'checkpoint_bootstrap',
          doc
        }),
        read: (checkpoint) => checkpoint.doc
      }
    },
    change: {
      create: (write, meta) => ({
        id: meta.changeId,
        actorId: meta.actorId,
        ops: write.forward,
        footprint: write.footprint
      }),
      read: (change) => ({
        kind: 'apply',
        operations: change.ops
      }),
      footprint: (change) => change.footprint
    }
  })

  session.connect()

  assert.equal(memoryStore.snapshot().checkpoint?.doc, 'doc_a')
  assert.equal(memoryStore.snapshot().changes.length, 0)
})

test('collab publishes local writes and replays remote changes', () => {
  const memoryStore = createMemoryStore()
  const engineRuntime = createEngine('doc_a')
  let nextId = 1

  const session = createMutationCollabSession(engineRuntime.engine, {
    actor: {
      id: 'actor_a',
      createChangeId: () => `id_${nextId++}`
    },
    transport: {
      store: memoryStore.store
    },
    document: {
      empty: () => 'empty',
      checkpoint: {
        create: (doc) => ({
          id: `checkpoint_${nextId++}`,
          doc
        }),
        read: (checkpoint) => checkpoint.doc
      }
    },
    change: {
      create: (write, meta) => ({
        id: meta.changeId,
        actorId: meta.actorId,
        ops: write.forward,
        footprint: write.footprint
      }),
      read: (change) => ({
        kind: 'apply',
        operations: change.ops
      }),
      footprint: (change) => change.footprint
    }
  })

  session.connect()
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

test('null change.create publishes checkpoint and clears history', () => {
  const memoryStore = createMemoryStore()
  const engineRuntime = createEngine('doc_a')
  let nextId = 1

  const session = createMutationCollabSession(engineRuntime.engine, {
    actor: {
      id: 'actor_a',
      createChangeId: () => `id_${nextId++}`
    },
    transport: {
      store: memoryStore.store
    },
    document: {
      empty: () => 'empty',
      checkpoint: {
        create: (doc) => ({
          id: `checkpoint_${nextId++}`,
          doc
        }),
        read: (checkpoint) => checkpoint.doc
      }
    },
    change: {
      create: (write) => write.forward[0]?.type === 'doc.reset'
        ? null
        : {
            id: `change_${nextId++}`,
            actorId: 'actor_a',
            ops: write.forward,
            footprint: write.footprint
          },
      read: (change) => ({
        kind: 'apply',
        operations: change.ops
      }),
      footprint: (change) => change.footprint
    }
  })

  session.connect()
  engineRuntime.history.capture({
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
  assert.equal(engineRuntime.history.state().undoDepth, 0)
})
