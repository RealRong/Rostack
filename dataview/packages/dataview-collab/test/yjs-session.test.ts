import assert from 'node:assert/strict'
import { test } from 'vitest'
import * as Y from 'yjs'
import {
  TITLE_FIELD_ID,
  type DataDoc,
  type CustomField
} from '@dataview/core/contracts'
import { view } from '@dataview/core/view'
import { createEngine } from '@dataview/engine'
import { collab as collabApi } from '@dataview/collab'
import { entityTable } from '@shared/core'

const VIEW_ID = 'view_table'
const FIELD_STATUS = 'status'

const createFields = (): readonly CustomField[] => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'text'
  }
])

const createDocument = (): DataDoc => {
  const fields = createFields()

  return {
    schemaVersion: 1,
    activeViewId: VIEW_ID,
    fields: entityTable.normalize.list(fields),
    views: {
      byId: {
        [VIEW_ID]: {
          id: VIEW_ID,
          type: 'table',
          name: 'Table',
          filter: {
            mode: 'and',
            rules: entityTable.normalize.list([])
          },
          search: {
            query: ''
          },
          sort: {
            rules: entityTable.normalize.list([])
          },
          calc: {},
          display: {
            fields: [TITLE_FIELD_ID, FIELD_STATUS]
          },
          options: {
            ...view.options.defaults('table', fields)
          },
          orders: []
        }
      },
      order: [VIEW_ID]
    },
    records: {
      byId: {
        rec_1: {
          id: 'rec_1',
          title: 'Task 1',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'todo'
          }
        }
      },
      order: ['rec_1']
    },
    meta: {}
  }
}

const createTestEngine = () => createEngine({
  document: createDocument()
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
  const engine = createTestEngine()
  const session = collabApi.yjs.session.create({
    engine,
    doc,
    actorId: 'actor_bootstrap'
  })

  session.connect()

  const store = createStore(doc)
  const checkpoint = store.readCheckpoint()
  assert.ok(checkpoint)
  assert.equal(checkpoint?.doc.activeViewId, VIEW_ID)
  assert.equal(store.readChanges().length, 0)
  assert.equal(session.status.get(), 'connected')

  session.destroy()
})

test('shared sessions replay remote writes and keep remote changes out of local undo', () => {
  const sharedDoc = new Y.Doc()
  const engineA = createTestEngine()
  const engineB = createTestEngine()

  const sessionA = collabApi.yjs.session.create({
    engine: engineA,
    doc: sharedDoc,
    actorId: 'actor_a'
  })
  const sessionB = collabApi.yjs.session.create({
    engine: engineB,
    doc: sharedDoc,
    actorId: 'actor_b'
  })

  sessionA.connect()
  sessionB.connect()

  const createdId = engineA.records.create({
    values: {
      [FIELD_STATUS]: 'todo'
    }
  })
  assert.ok(createdId)
  assert.ok(engineB.records.get(createdId!))
  assert.equal(sessionB.localHistory.get().undoDepth, 0)

  engineA.records.fields.set(createdId!, FIELD_STATUS, 'done')
  assert.equal(
    engineB.records.get(createdId!)?.values[FIELD_STATUS],
    'done'
  )
  assert.equal(sessionB.localHistory.get().undoDepth, 0)

  const store = createStore(sharedDoc)
  assert.ok(store.readCheckpoint())
  assert.equal(store.readChanges().length, 2)

  sessionA.destroy()
  sessionB.destroy()
})

test('local engine.replace rewrites checkpoint and clears tail changes', async () => {
  const sharedDoc = new Y.Doc()
  const engine = createTestEngine()
  const session = collabApi.yjs.session.create({
    engine,
    doc: sharedDoc,
    actorId: 'actor_replace'
  })

  session.connect()
  const createdId = engine.records.create()
  assert.ok(createdId)

  const nextDocument: DataDoc = {
    ...createDocument(),
    records: {
      byId: {},
      order: []
    }
  }
  engine.replace(nextDocument)
  await Promise.resolve()

  const store = createStore(sharedDoc)
  const checkpoint = store.readCheckpoint()
  assert.ok(checkpoint)
  assert.deepEqual(checkpoint?.doc.records.order, [])
  assert.equal(store.readChanges().length, 0)

  session.destroy()
})

test('session records duplicate shared changes deterministically', () => {
  const sharedDoc = new Y.Doc()
  const engine = createTestEngine()
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
    ops: [{
      type: 'document.record.patch' as const,
      recordId: 'rec_1',
      patch: {
        title: 'Remote title'
      }
    }],
    footprint: [['records', 'rec_1']]
  }

  sharedDoc.transact(() => {
    store.appendChange(duplicateChange)
    store.appendChange(duplicateChange)
  })

  assert.deepEqual(
    session.diagnostics.get().duplicateChangeIds,
    ['change_duplicate']
  )
  assert.equal(
    readDocument(engine).records.byId.rec_1?.title,
    'Remote title'
  )

  session.destroy()
})

test('remote changes invalidate conflicting local history', () => {
  const sharedDoc = new Y.Doc()
  const engineA = createTestEngine()
  const engineB = createTestEngine()

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

  engineB.records.fields.set('rec_1', FIELD_STATUS, 'doing')
  assert.equal(sessionB.localHistory.get().undoDepth, 1)
  assert.equal(sessionB.localHistory.get().invalidatedDepth, 0)

  engineA.records.fields.set('rec_1', FIELD_STATUS, 'done')
  assert.equal(sessionB.localHistory.get().undoDepth, 0)
  assert.equal(sessionB.localHistory.get().invalidatedDepth, 1)

  sessionA.destroy()
  sessionB.destroy()
})

test('localHistory undo and redo append new shared changes', () => {
  const sharedDoc = new Y.Doc()
  const engine = createTestEngine()
  const session = collabApi.yjs.session.create({
    engine,
    doc: sharedDoc,
    actorId: 'actor_history'
  })

  session.connect()

  engine.records.fields.set('rec_1', FIELD_STATUS, 'doing')

  const store = createStore(sharedDoc)
  assert.equal(session.localHistory.get().undoDepth, 1)
  assert.equal(store.readChanges().length, 1)

  const undoResult = session.localHistory.undo()
  assert.equal(undoResult.ok, true)
  assert.equal(
    readDocument(engine).records.byId.rec_1?.values[FIELD_STATUS],
    'todo'
  )
  assert.equal(session.localHistory.get().undoDepth, 0)
  assert.equal(session.localHistory.get().redoDepth, 1)
  assert.equal(store.readChanges().length, 2)

  const redoResult = session.localHistory.redo()
  assert.equal(redoResult.ok, true)
  assert.equal(
    readDocument(engine).records.byId.rec_1?.values[FIELD_STATUS],
    'doing'
  )
  assert.equal(session.localHistory.get().undoDepth, 1)
  assert.equal(session.localHistory.get().redoDepth, 0)
  assert.equal(store.readChanges().length, 3)

  session.destroy()
})
