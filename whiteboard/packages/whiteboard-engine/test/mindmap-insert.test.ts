import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'

test('engine exposes created mindmap roots through committed facts', () => {
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
  const snapshot = engine.snapshot()
  assert.equal(snapshot.state.facts.entities.nodes.get(rootId)?.type, 'text')
  assert.equal(snapshot.state.facts.relations.nodeOwner.get(rootId)?.kind, 'mindmap')
  assert.equal(snapshot.state.facts.relations.nodeOwner.get(rootId)?.id, mindmapId)
  assert.deepEqual(snapshot.state.facts.relations.ownerNodes.mindmaps.get(mindmapId), [rootId])
  assert.ok(snapshot.change.entities.nodes.all.has(rootId))
  assert.ok(snapshot.change.entities.owners.mindmaps.all.has(mindmapId))
})
