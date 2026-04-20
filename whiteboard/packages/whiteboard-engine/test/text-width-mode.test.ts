import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import {
  compileNodeDataUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import { createEngine } from '@whiteboard/engine'

const createTextDocument = () => {
  const document = createDocument('doc_text_width_mode')
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
  const engine = createEngine({
    document: createTextDocument()
  })

  const result = engine.execute({
    type: 'node.update',
    updates: [{
      id: 'text-1',
      input: mergeNodeUpdates(
        {
          fields: {
            size: {
              width: 180,
              height: 24
            }
          }
        },
        compileNodeDataUpdate('widthMode', 'wrap'),
        compileNodeDataUpdate('wrapWidth', 180)
      )
    }]
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  const committed = engine.read.node.item.get('text-1')
  assert.equal(committed?.node.data?.widthMode, 'wrap')
  assert.equal(committed?.node.data?.wrapWidth, 180)
  assert.equal(committed?.rect.width, 180)
})
