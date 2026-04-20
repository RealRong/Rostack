import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { serializeHistoryKey } from '@whiteboard/core/spec/history'
import { createEngine } from '@whiteboard/engine'
import { buildWhiteboardMindmapTemplate } from '@whiteboard/product'

const readSerializedFootprint = (
  engine: ReturnType<typeof createEngine>
) => new Set(
  (engine.writeRecord.get()?.history.footprint ?? []).map(serializeHistoryKey)
)

test('engine exposes node create footprint through writeRecord', () => {
  const engine = createEngine({
    document: createDocument('doc_write_record_create')
  })

  const result = engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: { x: 20, y: 40 },
      data: {
        text: 'hello'
      }
    }
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  const footprint = readSerializedFootprint(engine)
  assert.deepEqual(
    footprint,
    new Set([
      serializeHistoryKey({
        kind: 'node.exists',
        nodeId: result.data.nodeId
      })
    ])
  )
})

test('engine maps mindmap topic updates to node + mindmap history keys', () => {
  const engine = createEngine({
    document: createDocument('doc_write_record_mindmap')
  })

  const createResult = engine.execute({
    type: 'mindmap.create',
    input: {
      template: buildWhiteboardMindmapTemplate({
        preset: 'mindmap.capsule-outline'
      })
    }
  })

  assert.equal(createResult.ok, true)
  if (!createResult.ok) {
    return
  }

  const updateResult = engine.execute({
    type: 'node.update',
    updates: [{
      id: createResult.data.rootId,
      input: {
        records: [{
          scope: 'data',
          op: 'set',
          path: 'text',
          value: 'Updated topic'
        }]
      }
    }]
  })

  assert.equal(updateResult.ok, true)
  const footprint = readSerializedFootprint(engine)
  assert.deepEqual(
    footprint,
    new Set([
      serializeHistoryKey({
        kind: 'node.record',
        nodeId: createResult.data.rootId,
        scope: 'data',
        path: 'text'
      }),
      serializeHistoryKey({
        kind: 'mindmap.exists',
        mindmapId: createResult.data.mindmapId
      })
    ])
  )
})
