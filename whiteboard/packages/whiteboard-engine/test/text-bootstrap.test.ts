import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine, normalizeDocument } from '@whiteboard/engine'

test('normalizeDocument 为缺失 size 的 text 节点补齐系统尺寸', () => {
  const document = createDocument('doc_text_bootstrap')
  document.nodes.node_1 = {
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
  document.order = [{
    kind: 'node',
    id: 'node_1'
  }]

  const normalized = normalizeDocument(document)

  assert.notEqual(normalized, document)
  assert.deepEqual(normalized.nodes.node_1.size, {
    width: 144,
    height: 24
  })
})

test('engine 会清洗直接下发的 text node.create 缺失尺寸', () => {
  const engine = createEngine({
    document: createDocument('doc_text_create')
  })

  const result = engine.applyOperations([{
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
  }], {
    origin: 'remote'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.commit.doc.nodes.node_1.size, {
    width: 144,
    height: 24
  })
})
