import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'

test('engine exposes created mindmap roots through node read projection', () => {
  const engine = engineApi.create({
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
  assert.ok(engine.read.node.list.get().includes(rootId))
  assert.equal(engine.read.node.committed.get(rootId)?.node.type, 'text')
  assert.equal(engine.read.node.committed.get(rootId)?.node.owner?.kind, 'mindmap')
  assert.equal(engine.read.node.committed.get(rootId)?.node.owner?.id, mindmapId)
  assert.equal(engine.read.mindmap.structure.get(mindmapId)?.id, mindmapId)
})
