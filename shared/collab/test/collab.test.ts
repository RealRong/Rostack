import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  createMutationEngine,
  createMutationWriter,
  field,
  schema,
  type MutationCommit,
} from '@shared/mutation'
import { createMutationCollabSession } from '../src'

const testSchema = schema({
  title: field<string>(),
})

type TestSchema = typeof testSchema
type TestDocument = {
  title: string
}

type TestEngine = ReturnType<typeof createTestEngine>

const normalizeDocument = (document: TestDocument): TestDocument => ({
  title: document.title
})

const createTestEngine = (document: TestDocument) => createMutationEngine({
  schema: testSchema,
  document,
  normalize: normalizeDocument,
  compile: {
    handlers: {}
  } as never,
  services: undefined,
  history: true
})

const createTitleWrites = (value: string) => {
  const writer = createMutationWriter(testSchema)
  writer.document.title.set(value)
  return writer.writes()
}

const createMemoryStore = () => {
  let checkpoint: {
    id: string
    document: TestDocument
  } | null = null
  let changes: {
    id: string
    actorId: string
    writes: ReturnType<typeof createTitleWrites>
  }[] = []
  const listeners = new Set<() => void>()

  const publish = () => {
    listeners.forEach((listener) => {
      listener()
    })
  }

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
      append: (change: {
        id: string
        actorId: string
        writes: ReturnType<typeof createTitleWrites>
      }) => {
        changes = [...changes, change]
        publish()
      },
      checkpoint: (nextCheckpoint: {
        id: string
        document: TestDocument
      }) => {
        checkpoint = nextCheckpoint
        publish()
      },
      clearChanges: () => {
        changes = []
        publish()
      }
    },
    snapshot: () => ({
      checkpoint,
      changes
    })
  }
}

const createSession = (
  engine: TestEngine,
  memory: ReturnType<typeof createMemoryStore>,
  actorId: string
) => createMutationCollabSession({
  commits: {
    subscribe: (listener) => engine.subscribe(listener)
  },
  doc: () => engine.document(),
  replace: (document, options) => engine.replace(document, options),
  apply: (writes, options) => engine.apply(writes, options)
}, {
  schema: testSchema,
  actor: {
    id: actorId,
    createChangeId: () => `${actorId}_${memory.snapshot().changes.length + 1}`
  },
  transport: {
    store: memory.store
  },
  document: {
    empty: () => ({
      title: ''
    })
  }
})

const assertCommit = (
  commit: MutationCommit<TestSchema> | undefined
): MutationCommit<TestSchema> => {
  assert.ok(commit)
  return commit
}

test('collab bootstrap writes initial checkpoint and leaves change log empty', () => {
  const memory = createMemoryStore()
  const engine = createTestEngine({
    title: 'doc_a'
  })
  const session = createSession(engine, memory, 'actor_a')

  session.connect()

  assert.deepEqual(memory.snapshot().checkpoint, {
    id: 'actor_a_1',
    document: {
      title: 'doc_a'
    }
  })
  assert.deepEqual(memory.snapshot().changes, [])
  assert.equal(session.status.get(), 'connected')

  session.destroy()
})

test('collab publishes local commits and replays remote writes without capturing remote undo', () => {
  const memory = createMemoryStore()
  const engineA = createTestEngine({
    title: 'base'
  })
  const engineB = createTestEngine({
    title: 'base'
  })
  const sessionA = createSession(engineA, memory, 'actor_a')
  const sessionB = createSession(engineB, memory, 'actor_b')

  sessionA.connect()
  sessionB.connect()

  engineA.apply(createTitleWrites('remote'))

  assert.equal(engineB.document().title, 'remote')
  assert.equal(sessionB.localHistory.get().undoDepth, 0)
  assert.equal(memory.snapshot().changes.length, 1)

  sessionA.destroy()
  sessionB.destroy()
})

test('remote conflicting writes invalidate local collab history', () => {
  const memory = createMemoryStore()
  const engineA = createTestEngine({
    title: 'base'
  })
  const engineB = createTestEngine({
    title: 'base'
  })
  const sessionA = createSession(engineA, memory, 'actor_a')
  const sessionB = createSession(engineB, memory, 'actor_b')

  sessionA.connect()
  sessionB.connect()

  engineB.apply(createTitleWrites('local'))
  assert.equal(sessionB.localHistory.get().undoDepth, 1)
  assert.equal(sessionB.localHistory.get().invalidatedDepth, 0)

  engineA.apply(createTitleWrites('remote'))

  assert.equal(engineB.document().title, 'remote')
  assert.equal(sessionB.localHistory.get().undoDepth, 0)
  assert.equal(sessionB.localHistory.get().invalidatedDepth, 1)
  assert.equal(sessionB.localHistory.undo(), undefined)

  sessionA.destroy()
  sessionB.destroy()
})

test('collab local undo publishes inverse writes and redo republishes forward writes', () => {
  const memory = createMemoryStore()
  const engine = createTestEngine({
    title: 'base'
  })
  const session = createSession(engine, memory, 'actor_a')

  session.connect()
  engine.apply(createTitleWrites('next'))

  const undone = session.localHistory.undo()
  assertCommit(undone)
  assert.equal(engine.document().title, 'base')

  const redone = session.localHistory.redo()
  assertCommit(redone)
  assert.equal(engine.document().title, 'next')
  assert.equal(memory.snapshot().changes.length, 3)

  session.destroy()
})
