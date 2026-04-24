import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'

const readDocument = (
  engine: ReturnType<typeof engineApi.create>
) => engine.current().snapshot.document

test('local engine history captures user writes and replays undo/redo', () => {
  const engine = engineApi.create({
    document: documentApi.create('doc_history_local')
  })
  const history = historyApi.local.create(engine)

  const createResult = engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: {
        x: 24,
        y: 40
      },
      data: {
        text: 'hello'
      }
    }
  })

  assert.equal(createResult.ok, true)
  if (!createResult.ok) {
    return
  }

  assert.equal(history.get().undoDepth, 1)

  const undoResult = history.undo()
  assert.equal(undoResult.ok, true)
  assert.equal(readDocument(engine).nodes[createResult.data.nodeId], undefined)
  assert.equal(history.get().undoDepth, 0)
  assert.equal(history.get().redoDepth, 1)

  const redoResult = history.redo()
  assert.equal(redoResult.ok, true)
  assert.notEqual(readDocument(engine).nodes[createResult.data.nodeId], undefined)
  assert.equal(history.get().undoDepth, 1)
  assert.equal(history.get().redoDepth, 0)
})

test('local engine history clears on local document.replace', () => {
  const engine = engineApi.create({
    document: documentApi.create('doc_history_reset')
  })
  const history = historyApi.local.create(engine)

  const createResult = engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: {
        x: 12,
        y: 18
      },
      data: {
        text: 'reset me'
      }
    }
  })

  assert.equal(createResult.ok, true)
  assert.equal(history.get().undoDepth, 1)

  const replaceResult = engine.execute({
    type: 'document.replace',
    document: documentApi.create('doc_history_reset_next')
  })

  assert.equal(replaceResult.ok, true)
  assert.equal(history.get().undoDepth, 0)
  assert.equal(history.get().redoDepth, 0)
})

test('history binding switches to the active source', () => {
  const engine = engineApi.create({
    document: documentApi.create('doc_history_binding')
  })
  const baseHistory = historyApi.local.create(engine)
  const binding = historyApi.binding.create(baseHistory)

  const otherEngine = engineApi.create({
    document: documentApi.create('doc_history_binding_other')
  })
  const otherHistory = historyApi.local.create(otherEngine)

  binding.set(otherHistory)
  otherEngine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: {
        x: 8,
        y: 8
      },
      data: {
        text: 'other'
      }
    }
  })

  assert.equal(binding.get().undoDepth, 1)

  binding.reset()
  assert.equal(binding.get().undoDepth, baseHistory.get().undoDepth)
})
