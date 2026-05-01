import assert from 'node:assert/strict'
import { test } from 'vitest'
import * as Y from 'yjs'
import { path as mutationPath } from '@shared/draft'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { collab as collabApi } from '@whiteboard/collab'
import { createTestLayout } from '../../whiteboard-engine/test/support'

const createTestEngine = (id = 'doc_test') =>
  engineApi.create({
    document: documentApi.create(id),
    layout: createTestLayout()
  })

const readDocument = (
  engine: ReturnType<typeof createTestEngine>
) => engine.doc()

const createStore = (
  doc: Y.Doc
) => collabApi.yjs.store.create({
  doc,
  codec: collabApi.yjs.codec.create()
})

test('empty bootstrap writes initial checkpoint and leaves change log empty', () => {
  const doc = new Y.Doc()
  const engine = createTestEngine('doc_engine_first')
  const session = collabApi.yjs.session.create({
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

test('shared sessions replay remote operations and keep remote changes out of local undo', () => {
  const sharedDoc = new Y.Doc()
  const engineA = createTestEngine('doc_shared')
  const engineB = createTestEngine('doc_shared')

  const sessionA = collabApi.yjs.session.create({
    engine: engineA,
    doc: sharedDoc,
    actorId: 'actor_a'
  })
  sessionA.connect()

  const sessionB = collabApi.yjs.session.create({
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

  const snapshotAfterCreate = readDocument(engineB)
  assert.ok(snapshotAfterCreate.nodes[nodeId])
  assert.equal(
    sessionB.localHistory.get().undoDepth,
    0
  )

  const setResult = engineA.execute({
    type: 'node.update',
    updates: [{
      id: nodeId,
      input: {
        record: {
          [`data.${mutationPath.of('items')}`]: ['a']
        }
      }
    }]
  })
  assert.equal(setResult.ok, true)

  const patchResult = engineA.execute({
    type: 'node.update',
    updates: [{
      id: nodeId,
      input: {
        record: {
          [`data.${mutationPath.of('items')}`]: ['a', 'b'],
          [`data.${mutationPath.of('nested', 'value')}`]: 'synced'
        }
      }
    }]
  })
  assert.equal(patchResult.ok, true)

  const syncedNode = readDocument(engineB).nodes[nodeId]
  assert.deepEqual(syncedNode?.data?.items, ['a', 'b'])
  assert.equal(syncedNode?.data?.nested?.value, 'synced')
  assert.equal(
    sessionB.localHistory.get().undoDepth,
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
  const session = collabApi.yjs.session.create({
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
    document: documentApi.create('doc_replace')
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
  const session = collabApi.yjs.session.create({
    engine,
    doc: sharedDoc,
    actorId: 'actor_diag'
  })

  session.connect()

  const store = createStore(sharedDoc)
  const duplicateChange = {
    id: 'change_duplicate',
    actorId: 'actor_remote',
    program: {
      steps: [{
        type: 'entity.patch' as const,
        entity: {
          table: 'document',
          id: 'document'
        },
        writes: {
          background: {
            type: 'none',
            color: '#000'
          }
        }
      }]
    },
    footprint: [{
      kind: 'field',
      family: 'document',
      id: 'document',
      field: 'background'
    }]
  } as const

  sharedDoc.transact(() => {
    store.appendChange(duplicateChange)
    store.appendChange(duplicateChange)
    store.appendChange({
      id: 'change_rejected',
      actorId: 'actor_remote',
      program: {
        steps: [{
          type: 'entity.patch' as const,
          entity: {
            table: 'node',
            id: 'node_missing'
          },
          writes: {
            rotation: 90
          }
        }]
      },
      footprint: [{
        kind: 'field',
        family: 'node',
        id: 'node_missing',
        field: 'rotation'
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
    readDocument(engine).background?.color,
    '#000'
  )

  session.destroy()
})

test('remote changes invalidate conflicting local history', () => {
  const sharedDoc = new Y.Doc()
  const engineA = createTestEngine('doc_conflict_history')
  const engineB = createTestEngine('doc_conflict_history')

  const sessionA = collabApi.yjs.session.create({
    engine: engineA,
    doc: sharedDoc,
    actorId: 'actor_conflict_a'
  })
  const sessionB = collabApi.yjs.session.create({
    engine: engineB,
    doc: sharedDoc,
    actorId: 'actor_conflict_b'
  })

  sessionA.connect()
  sessionB.connect()

  const createResult = engineB.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: { x: 0, y: 0 },
      data: {
        text: 'owned by b'
      }
    }
  })

  assert.equal(createResult.ok, true)
  if (!createResult.ok) {
    return
  }

  assert.equal(sessionB.localHistory.get().undoDepth, 1)
  assert.equal(sessionB.localHistory.get().invalidatedDepth, 0)

  const updateResult = engineA.execute({
    type: 'node.update',
    updates: [{
      id: createResult.data.nodeId,
      input: {
        record: {
          [`data.${mutationPath.of('text')}`]: 'remote update'
        }
      }
    }]
  })

  assert.equal(updateResult.ok, true)
  assert.equal(sessionB.localHistory.get().undoDepth, 0)
  assert.equal(sessionB.localHistory.get().invalidatedDepth, 1)

  sessionA.destroy()
  sessionB.destroy()
})

test('localHistory undo and redo append new shared changes', () => {
  const sharedDoc = new Y.Doc()
  const engine = createTestEngine('doc_local_history')
  const session = collabApi.yjs.session.create({
    engine,
    doc: sharedDoc,
    actorId: 'actor_local_history'
  })

  session.connect()

  const createResult = engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: { x: 24, y: 16 },
      data: {
        text: 'undo me'
      }
    }
  })

  assert.equal(createResult.ok, true)
  if (!createResult.ok) {
    return
  }

  const store = createStore(sharedDoc)
  assert.equal(session.localHistory.get().undoDepth, 1)
  assert.equal(store.readChanges().length, 1)

  const undoResult = session.localHistory.undo()
  assert.equal(undoResult.ok, true)
  assert.equal(readDocument(engine).nodes[createResult.data.nodeId], undefined)
  assert.equal(session.localHistory.get().undoDepth, 0)
  assert.equal(session.localHistory.get().redoDepth, 1)
  assert.equal(store.readChanges().length, 2)

  const redoResult = session.localHistory.redo()
  assert.equal(redoResult.ok, true)
  assert.ok(readDocument(engine).nodes[createResult.data.nodeId])
  assert.equal(session.localHistory.get().undoDepth, 1)
  assert.equal(session.localHistory.get().redoDepth, 0)
  assert.equal(store.readChanges().length, 3)

  session.destroy()
})
