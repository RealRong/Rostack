import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { buildWhiteboardMindmapTemplate } from '@whiteboard/product'

test('engine exposes created mindmap roots through node read projection', () => {
  const engine = createEngine({
    document: createDocument('doc_mindmap_insert')
  })

  const result = engine.execute({
    type: 'mindmap.create',
    input: {
      template: buildWhiteboardMindmapTemplate({
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
  assert.equal(engine.read.node.item.get(rootId)?.node.type, 'text')
  assert.equal(engine.read.node.item.get(rootId)?.node.owner?.kind, 'mindmap')
  assert.equal(engine.read.node.item.get(rootId)?.node.owner?.id, mindmapId)
  assert.equal(engine.read.mindmap.item.get(mindmapId)?.id, mindmapId)
})
