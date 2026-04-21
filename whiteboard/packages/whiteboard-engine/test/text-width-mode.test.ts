import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { schema } from '@whiteboard/core/schema'
import { engine as engineApi } from '@whiteboard/engine'

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
  document.canvas.order = [{
    kind: 'node',
    id: 'text-1'
  }]
  return document
}

test('engine preserves wrap width mode when a text node size changes', () => {
  const engine = engineApi.create({
    document: createTextDocument()
  })

  const result = engine.execute({
    type: 'node.update',
    updates: [{
      id: 'text-1',
      input: schema.node.mergeUpdates(
        {
          fields: {
            size: {
              width: 180,
              height: 24
            }
          }
        },
        schema.node.compileDataUpdate('widthMode', 'wrap'),
        schema.node.compileDataUpdate('wrapWidth', 180)
      )
    }]
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  const committed = engine.read.node.committed.get('text-1')
  assert.equal(committed?.node.data?.widthMode, 'wrap')
  assert.equal(committed?.node.data?.wrapWidth, 180)
  assert.equal(committed?.rect.width, 180)
})
