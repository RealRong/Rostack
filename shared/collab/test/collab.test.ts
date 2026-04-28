import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  type ApplyCommit,
  type MutationCommitRecord,
  type MutationReplaceCommit,
} from '@shared/mutation'
import { createMutationCollabSession } from '../src'
import { createHistoryPort } from '../../mutation/src/localHistory'

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
  origin: 'user' | 'remote' | 'system' | 'history'
  document: string
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

const createController = () => {
  let undoDepth = 0

  return {
    state: () => ({
      canUndo: undoDepth > 0,
      canRedo: false,
      undoDepth,
      redoDepth: 0,
      invalidatedDepth: 0,
      isApplying: false
    }),
    capture: () => {
      undoDepth += 1
      return true
    },
    observe: () => false,
    undo: () => undefined,
    redo: () => undefined,
    confirm: () => false,
    cancel: () => false,
    clear: () => {
      if (undoDepth === 0) {
        return false
      }

      undoDepth = 0
      return true
    }
  }
}

const createEngine = (doc = 'base') => {
  let current = doc
  const controller = createController()
  const commitListeners = new Set<(commit: MutationCommitRecord<string, TestOp, string>) => void>()
  let nextRev = 1
  const commits = {
    subscribe: (listener: (commit: MutationCommitRecord<string, TestOp, string>) => void) => {
      commitListeners.add(listener)
      return () => {
        commitListeners.delete(listener)
      }
    }
  }

  const emitCommit = (
    commit: MutationCommitRecord<string, TestOp, string>
  ) => {
    current = commit.document
    commitListeners.forEach((listener) => listener(commit))
  }
  const apply = (ops: readonly TestOp[], options?: {
    origin?: TestWrite['origin']
  }) => {
    ops.forEach((op) => {
      current = op.value
    })
    const write: TestWrite = {
      rev: 0,
      at: 0,
      origin: options?.origin ?? 'system',
      document: current,
      forward: ops,
      inverse: [],
      footprint: [],
      extra: {}
    }
    const commit: ApplyCommit<string, TestOp, string, {}> = {
      kind: 'apply',
      ...write
    }
    emitCommit(commit)
    return {
      ok: true as const,
      data: undefined,
      commit
    }
  }
  const historyPort = createHistoryPort({
    apply,
    commits,
    historyController: () => controller
  })

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
          document: nextDoc,
          delta: {
            reset: true
          },
          issues: [],
          outputs: []
        } satisfies MutationReplaceCommit<string>)
        return {
          kind: 'replace',
          rev: nextRev - 1,
          at: 0,
          origin: options?.origin ?? 'system',
          document: nextDoc,
          delta: {
            reset: true
          },
          issues: [],
          outputs: []
        }
      },
      apply,
      commits,
      history: historyPort
    },
    emit: (write: TestWrite) => {
      emitCommit({
        kind: 'apply',
        ...write
      })
    },
    doc: () => current,
    history: historyPort,
    controller
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

test('collab publishes local commits and replays remote changes', () => {
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
    document: 'doc_local',
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
  engineRuntime.controller.capture({
    rev: 1,
    at: 1,
    origin: 'user',
    document: 'doc_local',
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
    document: 'doc_reset',
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
  assert.equal(engineRuntime.history.get().undoDepth, 0)
})
