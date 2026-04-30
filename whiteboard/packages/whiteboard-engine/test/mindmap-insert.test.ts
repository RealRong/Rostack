import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { createTestLayout } from './support'

test('engine exposes created mindmap roots through committed document and delta', () => {
  const engine = createEngine({
    document: documentApi.create('doc_mindmap_insert'),
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'mindmap.create',
    input: {
      template: product.mindmap.template.build({
        preset: 'mindmap.capsule-outline'
      })
    }
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  const { mindmapId, rootId } = result.data
  const document = engine.doc()
  assert.equal(document.nodes[rootId]?.type, 'text')
  assert.equal(document.nodes[rootId]?.owner?.kind, 'mindmap')
  assert.equal(document.nodes[rootId]?.owner?.id, mindmapId)
  assert.equal(document.mindmaps[mindmapId]?.root, rootId)
  assert.ok(Boolean(document.mindmaps[mindmapId]?.members[rootId]))
  assert.deepEqual(result.commit.delta.changes['node.create']?.ids, [rootId])
  assert.deepEqual(result.commit.delta.changes['mindmap.create']?.ids, [mindmapId])
})

test('mindmap relayout stays in projection while root moves still report node geometry changes', () => {
  const engine = createEngine({
    document: documentApi.create('doc_mindmap_projection_layout'),
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
  assert.deepEqual(
    engine.doc().nodes[childId]?.position,
    { x: 0, y: 0 }
  )

  const moved = engine.execute({
    type: 'mindmap.move',
    id: created.data.mindmapId,
    position: {
      x: 240,
      y: 80
    }
  })

  assert.equal(moved.ok, true)
  if (!moved.ok) {
    return
  }

  assert.deepEqual(
    moved.commit.document.nodes[childId]?.position,
    { x: 0, y: 0 }
  )

  const geometryIds = moved.commit.delta.changes['node.geometry']?.ids
  assert.deepEqual(
    Array.isArray(geometryIds)
      ? [...geometryIds].sort()
      : geometryIds,
    [created.data.rootId]
  )
  assert.deepEqual(
    moved.commit.delta.changes['mindmap.layout']?.ids,
    [created.data.mindmapId]
  )
})
