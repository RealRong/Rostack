import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import {
  createEngine
} from '@whiteboard/engine'
import { createTestLayout } from './support'

test('engine execute publishes committed canonical documents from compile output', () => {
  const engine = createEngine({
    document: documentApi.create('doc_text_create'),
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'node.create',
    input: {
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
  }, {
    origin: 'remote'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.commit.document.nodes.node_1.size, {
    width: 144,
    height: 20
  })
})
