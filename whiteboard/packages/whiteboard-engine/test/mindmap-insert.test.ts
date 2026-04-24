import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'

test('engine exposes created mindmap roots through committed document and delta', () => {
  const engine = createEngine({
    document: documentApi.create('doc_mindmap_insert')
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
  const publish = engine.current()
  const snapshot = publish.snapshot
  assert.equal(snapshot.document.nodes[rootId]?.type, 'text')
  assert.equal(snapshot.document.nodes[rootId]?.owner?.kind, 'mindmap')
  assert.equal(snapshot.document.nodes[rootId]?.owner?.id, mindmapId)
  assert.equal(snapshot.document.mindmaps[mindmapId]?.root, rootId)
  assert.ok(Boolean(snapshot.document.mindmaps[mindmapId]?.members[rootId]))
  assert.ok(publish.delta.nodes.added.has(rootId))
  assert.ok(publish.delta.mindmaps.added.has(mindmapId))
})
