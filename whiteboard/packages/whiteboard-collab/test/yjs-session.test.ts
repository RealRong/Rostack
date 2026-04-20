import assert from 'node:assert/strict'
import { test } from 'vitest'
import * as Y from 'yjs'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import {
  createYjsSyncCodec,
  createYjsSyncStore,
  createYjsSession
} from '@whiteboard/collab'

const createTestEngine = (id = 'doc_test') =>
  createEngine({
    document: createDocument(id)
  })

const createStore = (
  doc: Y.Doc
) => createYjsSyncStore({
  doc,
  codec: createYjsSyncCodec()
})

test('empty bootstrap writes initial checkpoint and leaves change log empty', () => {
  const doc = new Y.Doc()
  const engine = createTestEngine('doc_engine_first')
  const session = createYjsSession({
    engine,
    doc,
    actorId: 'actor_engine_first'
  })

  session.connect()

  const store = createStore(doc)
  const checkpoint = store.readCheckpoint()
  assert.ok(checkpoint)
  assert.equal(checkpoint?.doc.id, 'doc_engine_first')
  assert.equal(store.readChanges().length, 0)
  assert.equal(session.status.get(), 'connected')

  session.destroy()
})

test('shared sessions replay remote operations and keep remote history out of undo', () => {
  const sharedDoc = new Y.Doc()
  const engineA = createTestEngine('doc_shared')
  const engineB = createTestEngine('doc_shared')

  const sessionA = createYjsSession({
    engine: engineA,
    doc: sharedDoc,
    actorId: 'actor_a'
  })
  sessionA.connect()

  const sessionB = createYjsSession({
    engine: engineB,
    doc: sharedDoc,
    actorId: 'actor_b'
  })
  sessionB.connect()

  const createResult = engineA.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: { x: 0, y: 0 },
      data: {
        text: 'remote seed'
      }
    }
  })

  assert.equal(createResult.ok, true)
  const nodeId = createResult.ok ? createResult.data.nodeId : undefined
  assert.ok(nodeId)

  const snapshotAfterCreate = engineB.document.get()
  assert.ok(snapshotAfterCreate.nodes[nodeId])
  assert.equal(
    engineB.history.get().undoDepth,
    0
  )

  const setResult = engineA.execute({
    type: 'node.update',
    updates: [{
      id: nodeId,
      input: {
        records: [
          {
            scope: 'data',
            op: 'set',
            path: 'items',
            value: ['a']
          }
        ]
      }
    }]
  })
  assert.equal(setResult.ok, true)

  const patchResult = engineA.execute({
    type: 'node.update',
    updates: [{
      id: nodeId,
      input: {
        records: [
          {
            scope: 'data',
            op: 'set',
            path: 'items',
            value: ['a', 'b']
          },
          {
            scope: 'data',
            op: 'set',
            path: 'nested.value',
            value: 'synced'
          }
        ]
      }
    }]
  })
  assert.equal(patchResult.ok, true)

  const syncedNode = engineB.document.get().nodes[nodeId]
  assert.deepEqual(syncedNode?.data?.items, ['a', 'b'])
  assert.equal(syncedNode?.data?.nested?.value, 'synced')
  assert.equal(
    engineB.history.get().undoDepth,
    0
  )

  const store = createStore(sharedDoc)
  assert.ok(store.readCheckpoint())
  assert.equal(store.readChanges().length, 3)

  sessionA.destroy()
  sessionB.destroy()
})

test('local document.replace rewrites checkpoint and clears tail changes', () => {
  const sharedDoc = new Y.Doc()
  const engine = createTestEngine('doc_replace')
  const session = createYjsSession({
    engine,
    doc: sharedDoc,
    actorId: 'actor_replace'
  })

  session.connect()

  const createResult = engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: { x: 12, y: 18 },
      data: {
        text: 'before replace'
      }
    }
  })
  assert.equal(createResult.ok, true)

  const replaceResult = engine.execute({
    type: 'document.replace',
    document: createDocument('doc_replace')
  })
  assert.equal(replaceResult.ok, true)

  const store = createStore(sharedDoc)
  const checkpoint = store.readCheckpoint()
  assert.ok(checkpoint)
  assert.deepEqual(checkpoint?.doc.nodes, {})
  assert.equal(store.readChanges().length, 0)

  session.destroy()
})

test('session records duplicate and rejected shared changes deterministically', () => {
  const sharedDoc = new Y.Doc()
  const engine = createTestEngine('doc_diagnostics')
  const session = createYjsSession({
    engine,
    doc: sharedDoc,
    actorId: 'actor_diag'
  })

  session.connect()

  const store = createStore(sharedDoc)
  const duplicateChange = {
    id: 'change_duplicate',
    actorId: 'actor_remote',
    ops: [{
      type: 'document.background',
      background: {
        type: 'none',
        color: '#000'
      }
    }]
  } as const

  sharedDoc.transact(() => {
    store.appendChange(duplicateChange)
    store.appendChange(duplicateChange)
    store.appendChange({
      id: 'change_rejected',
      actorId: 'actor_remote',
      ops: [{
        type: 'node.field.set',
        id: 'node_missing',
        field: 'rotation',
        value: 90
      }]
    })
  })

  assert.deepEqual(
    session.diagnostics.get().duplicateChangeIds,
    ['change_duplicate']
  )
  assert.deepEqual(
    session.diagnostics.get().rejectedChangeIds,
    ['change_rejected']
  )
  assert.equal(
    engine.document.get().background?.color,
    '#000'
  )

  session.destroy()
})
