import assert from 'node:assert/strict'
import { test } from 'vitest'
import { json } from '@shared/core'
import { path as mutationPath } from '@shared/draft'
import { document as documentApi } from '@whiteboard/core/document'
import type { IntentResult } from '@whiteboard/engine'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { createTestLayout } from './support'

const serializeFootprint = (
  value: unknown
): string => json.stableStringify(value)

const readSerializedFootprint = (
  result: IntentResult
) => new Set(
  (result.ok ? result.commit.footprint : []).map(serializeFootprint)
)

test('engine exposes node create footprint through intent results', () => {
  const engine = createEngine({
    document: documentApi.create('doc_engine_write_create'),
    layout: createTestLayout()
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

  const footprint = readSerializedFootprint(result)
  assert.deepEqual(
    footprint,
    new Set([
      serializeFootprint({
        kind: 'entity',
        family: 'node',
        id: result.data.nodeId
      }),
      serializeFootprint({
        kind: 'structure',
        structure: 'canvas.order'
      }),
      serializeFootprint({
        kind: 'structure-item',
        structure: 'canvas.order',
        id: `node\u0000${result.data.nodeId}`
      })
    ])
  )
  assert.deepEqual(
    result.commit.delta.changes['node.create']?.ids,
    [result.data.nodeId]
  )
})

test('engine maps mindmap topic updates to node + mindmap history keys', () => {
  const engine = createEngine({
    document: documentApi.create('doc_engine_write_mindmap'),
    layout: createTestLayout()
  })

  const createResult = engine.execute({
    type: 'mindmap.create',
    input: {
      template: product.mindmap.template.build({
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
        record: {
          [`data.${mutationPath.of('text')}`]: 'Updated topic'
        }
      }
    }]
  })

  assert.equal(updateResult.ok, true)
  const footprint = readSerializedFootprint(updateResult)
  assert.deepEqual(
    footprint,
    new Set([
      serializeFootprint({
        kind: 'record',
        family: 'node',
        id: createResult.data.rootId,
        scope: 'data',
        path: mutationPath.of('text')
      }),
      serializeFootprint({
        kind: 'entity',
        family: 'mindmap',
        id: createResult.data.mindmapId
      })
    ])
  )
})

test('canvas.order.move keeps moved refs as a block when the target anchor is inside the moved set', () => {
  const engine = createEngine({
    document: documentApi.create('doc_engine_write_canvas_block_move'),
    layout: createTestLayout()
  })

  const created = Array.from({ length: 4 }, (_, index) => engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: {
        x: index * 40,
        y: 0
      },
      data: {
        text: `node-${index + 1}`
      }
    }
  }))

  created.forEach((result) => {
    assert.equal(result.ok, true)
  })
  if (created.some((result) => !result.ok)) {
    return
  }

  const nodeIds = created.map((result) => result.data.nodeId)
  const moved = engine.execute({
    type: 'canvas.order.move',
    refs: [
      {
        kind: 'node',
        id: nodeIds[1]!
      },
      {
        kind: 'node',
        id: nodeIds[2]!
      }
    ],
    to: {
      kind: 'after',
      ref: {
        kind: 'node',
        id: nodeIds[2]!
      }
    }
  })

  assert.equal(moved.ok, true)
  if (!moved.ok) {
    return
  }

  assert.deepEqual(
    moved.commit.document.canvas.order,
    [
      {
        kind: 'node',
        id: nodeIds[0]!
      },
      {
        kind: 'node',
        id: nodeIds[3]!
      },
      {
        kind: 'node',
        id: nodeIds[1]!
      },
      {
        kind: 'node',
        id: nodeIds[2]!
      }
    ]
  )
})

test('mindmap.topic.move still commits when only the root-side changes', () => {
  const engine = createEngine({
    document: documentApi.create('doc_engine_write_mindmap_side_move'),
    layout: createTestLayout()
  })

  const created = engine.execute({
    type: 'mindmap.create',
    input: {
      template: product.mindmap.template.build({
        preset: 'mindmap.capsule-outline'
      })
    }
  })

  assert.equal(created.ok, true)
  if (!created.ok) {
    return
  }

  const inserted = engine.execute({
    type: 'mindmap.topic.insert',
    id: created.data.mindmapId,
    input: {
      kind: 'child',
      parentId: created.data.rootId
    }
  })

  assert.equal(inserted.ok, true)
  if (!inserted.ok) {
    return
  }

  const childId = inserted.data.nodeId
  const moved = engine.execute({
    type: 'mindmap.topic.move',
    id: created.data.mindmapId,
    input: {
      nodeId: childId,
      parentId: created.data.rootId,
      index: 0,
      side: 'left'
    }
  })

  assert.equal(moved.ok, true)
  if (!moved.ok) {
    return
  }

  assert.equal(
    moved.commit.document.mindmaps[created.data.mindmapId]?.members[childId]?.side,
    'left'
  )
  assert.deepEqual(
    moved.commit.delta.changes['mindmap.structure']?.ids,
    [created.data.mindmapId]
  )
})
