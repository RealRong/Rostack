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
  const current = engine.current()
  assert.equal(current.doc.nodes[rootId]?.type, 'text')
  assert.equal(current.doc.nodes[rootId]?.owner?.kind, 'mindmap')
  assert.equal(current.doc.nodes[rootId]?.owner?.id, mindmapId)
  assert.equal(current.doc.mindmaps[mindmapId]?.root, rootId)
  assert.ok(Boolean(current.doc.mindmaps[mindmapId]?.members[rootId]))
  assert.deepEqual(result.commit.delta.changes.get('node.create')?.ids, [rootId])
  assert.deepEqual(result.commit.delta.changes.get('mindmap.create')?.ids, [mindmapId])
})
