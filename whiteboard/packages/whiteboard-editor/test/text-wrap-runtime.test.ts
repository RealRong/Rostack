import { describe, expect, it } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import {
  compileNodeDataUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import { createEngine } from '@whiteboard/engine'
import { createEditor } from '../src'
import type { NodeRegistry } from '../src'

const createRegistry = (): NodeRegistry => ({
  get: (type) => type === 'text'
    ? {
        type: 'text',
        meta: {
          name: 'Text',
          family: 'text',
          icon: 'text',
          controls: []
        },
        role: 'content',
        canResize: true,
        canRotate: true,
        enter: true,
        edit: {
          fields: {
            text: {
              multiline: true,
              empty: 'remove',
              measure: 'text'
            }
          }
        }
      }
    : undefined
})

const createTextDocument = () => {
  const document = createDocument('doc_text_wrap_runtime')
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

describe('text wrap runtime', () => {
  it('preserves wrap width when entering edit after a text patch commit', () => {
    const engine = createEngine({
      document: createTextDocument()
    })
    const editor = createEditor({
      engine,
      initialTool: {
        type: 'select'
      },
      initialViewport: {
        center: {
          x: 0,
          y: 0
        },
        zoom: 1
      },
      registry: createRegistry()
    })

    editor.actions.node.patch(['text-1'], mergeNodeUpdates(
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
    ))

    expect(editor.read.node.committed.get('text-1')?.node.data).toMatchObject({
      widthMode: 'wrap',
      wrapWidth: 180
    })
    expect(editor.read.node.item.get('text-1')?.node.data).toMatchObject({
      widthMode: 'wrap',
      wrapWidth: 180
    })
    expect(editor.read.node.item.get('text-1')?.rect).toMatchObject({
      width: 180,
      height: 24
    })

    editor.actions.edit.startNode('text-1', 'text')

    expect(editor.store.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: 'text-1',
      layout: {
        wrapWidth: 180,
        liveSize: {
          width: 180,
          height: 24
        }
      }
    })
  })
})
