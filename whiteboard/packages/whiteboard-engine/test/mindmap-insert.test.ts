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
  assert.equal(document.mindmaps[mindmapId]?.tree.rootId, rootId)
  assert.ok(Boolean(document.mindmaps[mindmapId]?.tree.nodes[rootId]))
  assert.deepEqual(toSortedIds(result.commit.delta.node.create.touchedIds()), [rootId])
  assert.deepEqual(toSortedIds(result.commit.delta.mindmap.create.touchedIds()), [mindmapId])
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

  const geometryIds = toSortedIds(moved.commit.delta.node.geometry.touchedIds())
  assert.deepEqual(
    geometryIds,
    [created.data.rootId]
  )
  assert.deepEqual(
    toSortedIds(moved.commit.delta.mindmap.layout.touchedIds()),
    []
  )
})
