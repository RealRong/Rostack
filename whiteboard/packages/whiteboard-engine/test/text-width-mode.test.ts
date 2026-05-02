import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createTestLayout } from './support'

const createTextDocument = () => {
  const document = documentApi.create('doc_text_width_mode')
  document.nodes['text-1'] = {
    id: 'text-1',
    type: 'text',
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 100,
      height: 24
    },
    data: {
      text: 'hello world'
    }
  }
  document.order = [{
    kind: 'node',
    id: 'text-1'
  }]
  return document
}

test('engine preserves wrap width mode when a text node size changes', () => {
  const engine = createEngine({
    document: createTextDocument(),
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'node.update',
    updates: [{
      id: 'text-1',
      input: {
        fields: {
          size: {
            width: 180,
            height: 24
          }
        },
        record: {
          'data.widthMode': 'wrap',
          'data.wrapWidth': 180
        }
      }
    }]
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  const committed = engine.doc().nodes['text-1']
  assert.equal(committed?.data?.widthMode, 'wrap')
  assert.equal(committed?.data?.wrapWidth, 180)
  assert.equal(committed?.size?.width, 180)
})
