import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { createTestLayout } from './support'

const toSortedIds = (
  value: ReadonlySet<string> | 'all'
): readonly string[] | 'all' => value === 'all'
  ? 'all'
  : [...value].sort()

test('engine exposes node create through typed change', () => {
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

  assert.deepEqual(
    toSortedIds(result.commit.change.node.create.touchedIds()),
    [result.data.nodeId]
  )
  assert.equal(result.commit.change.order.changed({
    kind: 'node',
    id: result.data.nodeId
  }), true)
})

test('engine applies node record updates through committed document writes', () => {
  const engine = createEngine({
    document: documentApi.create('doc_engine_write_node_update'),
    layout: createTestLayout()
  })

  const createResult = engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: { x: 0, y: 0 },
      data: {
        text: 'Central topic'
      }
    }
  })

  assert.equal(createResult.ok, true)
  if (!createResult.ok) {
    return
  }

  const updateResult = engine.execute({
    type: 'node.update',
    updates: [{
      id: createResult.data.nodeId,
      input: {
        record: {
          'data.text': 'Updated topic'
        }
      }
    }]
  })

  assert.equal(updateResult.ok, true)
  if (!updateResult.ok) {
    return
  }

  assert.equal(engine.doc().nodes[createResult.data.nodeId]?.data?.text, 'Updated topic')
  assert.deepEqual(
    toSortedIds(updateResult.commit.change.node.content.touchedIds()),
    [createResult.data.nodeId]
  )
})

test('document.order.move keeps moved refs as a block when the target anchor is inside the moved set', () => {
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
    type: 'document.order.move',
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
    moved.commit.document.order,
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
    moved.commit.document.mindmaps[created.data.mindmapId]?.tree.nodes[childId]?.value?.side,
    'left'
  )
  assert.deepEqual(
    toSortedIds(moved.commit.change.mindmap.structure.touchedIds()),
    [created.data.mindmapId]
  )
})
