import assert from 'node:assert/strict'
import { test } from 'vitest'
import * as Y from 'yjs'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import {
  createYjsSession,
  materializeYjsDocument
} from '@whiteboard/collab'

const createTestEngine = (id = 'doc_test') =>
  createEngine({
    document: createDocument(id)
  })

test('engine-first bootstrap mirrors local commits into Y.Doc', () => {
  const doc = new Y.Doc()
  const engine = createTestEngine('doc_engine_first')
  const session = createYjsSession({
    engine,
    doc,
    bootstrap: 'engine-first'
  })

  session.connect()

  const result = engine.execute({
    type: 'node.create',
    payload: {
      type: 'text',
      position: { x: 10, y: 20 },
      data: {
        text: 'hello'
      }
    }
  })

  assert.equal(result.ok, true)

  const snapshot = materializeYjsDocument(doc)
  assert.ok(snapshot)
  assert.equal(snapshot?.id, 'doc_engine_first')
  assert.equal(Object.keys(snapshot?.nodes ?? {}).length, 1)

  session.destroy()
})

test('shared Y.Doc sessions replay remote operations and keep remote history out of undo', () => {
  const sharedDoc = new Y.Doc()
  const engineA = createTestEngine('doc_shared')
  const engineB = createTestEngine('doc_shared')

  const sessionA = createYjsSession({
    engine: engineA,
    doc: sharedDoc,
    bootstrap: 'engine-first'
  })
  sessionA.connect()

  const sessionB = createYjsSession({
    engine: engineB,
    doc: sharedDoc,
    bootstrap: 'auto'
  })
  sessionB.connect()

  const createResult = engineA.execute({
    type: 'node.create',
    payload: {
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
    type: 'node.patch',
    updates: [{
      id: nodeId,
      update: {
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

  const spliceResult = engineA.execute({
    type: 'node.patch',
    updates: [{
      id: nodeId,
      update: {
        records: [
          {
            scope: 'data',
            op: 'splice',
            path: 'items',
            index: 1,
            deleteCount: 0,
            values: ['b']
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
  assert.equal(spliceResult.ok, true)

  const syncedNode = engineB.document.get().nodes[nodeId]
  assert.deepEqual(syncedNode?.data?.items, ['a', 'b'])
  assert.equal(syncedNode?.data?.nested?.value, 'synced')
  assert.equal(
    engineB.history.get().undoDepth,
    0
  )

  sessionA.destroy()
  sessionB.destroy()
})
