import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
import { product } from '@whiteboard/product'
import { editor as editorApi } from '../src'
import type { NodeRegistry } from '../src'

const registry: NodeRegistry = {
  get: (type) => {
    if (type === 'text') {
      return {
        type: 'text',
        meta: {
          name: 'Text',
          family: 'text',
          icon: 'text',
          controls: ['text', 'fill']
        },
        role: 'content',
        connect: true,
        resize: true,
        rotate: true,
        layout: {
          kind: 'size'
        },
        enter: true,
        edit: {
          fields: {
            text: {
              multiline: true,
              empty: 'keep'
            }
          }
        }
      }
    }

    if (type === 'mindmap') {
      return {
        type: 'mindmap',
        meta: {
          name: 'Mindmap',
          family: 'shape',
          icon: 'mindmap',
          controls: []
        },
        role: 'content',
        connect: false,
        resize: false,
        rotate: false
      }
    }

    return undefined
  }
}

describe('mindmap edit relayout preview', () => {
  it('relayouts child nodes while the root text edit size changes', () => {
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_edit_relayout_preview')
    })
    const editor = editorApi.create({
      engine,
      history: historyApi.local.create(engine),
      initialTool: {
        type: 'select'
      },
      initialViewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      },
      registry
    })

    const created = editor.actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const tree = editor.read.mindmap.render.get(created.data.mindmapId)?.tree
    expect(tree).toBeDefined()

    const insert = editor.actions.mindmap.insertByPlacement({
      id: created.data.mindmapId,
      tree: tree!,
      targetNodeId: created.data.rootId,
      placement: 'right',
      layout: tree!.layout,
      payload: {
        kind: 'text',
        text: 'Child'
      }
    })

    expect(insert.ok).toBe(true)
    if (!insert.ok) {
      return
    }

    const beforeRoot = editor.read.node.render.get(created.data.rootId)?.rect
    const beforeChild = editor.read.node.render.get(insert.data.nodeId)?.rect

    expect(beforeRoot).toBeDefined()
    expect(beforeChild).toBeDefined()

    editor.actions.edit.startNode(created.data.rootId, 'text')
    editor.actions.edit.layout({
      size: {
        width: beforeRoot!.width + 120,
        height: beforeRoot!.height
      }
    })

    const liveRoot = editor.read.node.render.get(created.data.rootId)?.rect
    const liveChild = editor.read.node.render.get(insert.data.nodeId)?.rect

    expect(liveRoot).toBeDefined()
    expect(liveChild).toBeDefined()
    expect(liveRoot!.x).toBe(beforeRoot!.x)
    expect(liveRoot!.width).toBe(beforeRoot!.width + 120)
    expect(liveChild!.x).toBeGreaterThan(beforeChild!.x)
  })
})
