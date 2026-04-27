import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import {
  createEngine,
  normalizeDocument
} from '@whiteboard/engine'

test('normalizeDocument 为缺失 size 的 text 节点补齐系统尺寸', () => {
  const doc = documentApi.create('doc_text_bootstrap')
  doc.nodes.node_1 = {
    id: 'node_1',
    type: 'text',
    position: {
      x: 0,
      y: 0
    },
    data: {
      text: 'hello'
    }
  }
  doc.canvas.order = [{
    kind: 'node',
    id: 'node_1'
  }]

  const normalized = normalizeDocument(doc)

  assert.notEqual(normalized, doc)
  assert.deepEqual(normalized.nodes.node_1.size, {
    width: 144,
    height: 20
  })
})

test('engine apply publishes normalized committed documents after reducer output', () => {
  const engine = createEngine({
    document: documentApi.create('doc_text_create')
  })

  const result = engine.apply([
    {
      type: 'node.create',
      node: {
        id: 'node_1',
        type: 'text',
        position: {
          x: 40,
          y: 24
        },
        data: {
          text: 'hello'
        }
      }
    }
  ], {
    origin: 'remote'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.commit.doc.nodes.node_1.size, {
    width: 144,
    height: 20
  })
})
