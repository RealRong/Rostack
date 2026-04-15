import { describe, expect, it } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import { createEngine } from '@whiteboard/engine'
import { createEditor } from '../src'
import type { NodeRegistry } from '../src'
import type { TextLayoutMeasureInput } from '../src/types/textLayout'

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

const createMeasureText = () => (
  input: TextLayoutMeasureInput
) => input.node.type === 'text'
  ? {
      width: input.node.data?.widthMode === 'wrap'
        ? (typeof input.node.data?.wrapWidth === 'number'
            ? input.node.data.wrapWidth
            : input.rect.width)
        : input.rect.width,
      height:
        typeof input.node.style?.fontSize === 'number'
        && input.node.style.fontSize >= 20
          ? 48
          : 24
    }
  : undefined

const createTextEditor = () => createEditor({
  engine: createEngine({
    document: createTextDocument()
  }),
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
  registry: createRegistry(),
  measureText: createMeasureText()
})

describe('text wrap runtime', () => {
  it('preserves wrap width when entering edit after a text patch commit', () => {
    const editor = createTextEditor()

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
        measuredSize: {
          width: 180,
          height: 24
        }
      }
    })
  })

  it('recomputes wrap text size when font size changes via text command', () => {
    const editor = createTextEditor()

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

    editor.actions.node.text.size({
      nodeIds: ['text-1'],
      value: 20
    })

    expect(editor.read.node.committed.get('text-1')?.node.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.read.node.committed.get('text-1')?.rect).toMatchObject({
      width: 180,
      height: 48
    })
  })

  it('recomputes wrap text size when font size changes via generic node patch', () => {
    const editor = createTextEditor()

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

    editor.actions.node.patch(
      ['text-1'],
      compileNodeStyleUpdate('fontSize', 20)
    )

    expect(editor.read.node.committed.get('text-1')?.node.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.read.node.committed.get('text-1')?.rect).toMatchObject({
      width: 180,
      height: 48
    })
  })
})
