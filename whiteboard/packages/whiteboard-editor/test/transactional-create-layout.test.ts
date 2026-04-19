import { describe, expect, it } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { buildWhiteboardMindmapTemplate } from '@whiteboard/product'
import { createEditor, type LayoutBackend, type NodeRegistry } from '../src'

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

    if (type === 'sticky') {
      return {
        type: 'sticky',
        meta: {
          name: 'Sticky',
          family: 'text',
          icon: 'sticky',
          controls: ['text', 'fill']
        },
        role: 'content',
        connect: true,
        resize: true,
        rotate: true,
        layout: {
          kind: 'fit'
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

const layout: LayoutBackend = {
  measure: (request) => {
    if (request.kind === 'fit') {
      return {
        kind: 'fit',
        fontSize: 18
      }
    }

    return {
      kind: 'size',
      size: {
        width: request.widthMode === 'wrap'
          ? (request.wrapWidth ?? request.minWidth ?? 144)
          : 132,
        height: 44
      }
    }
  }
}

const createTestEditor = () => createEditor({
  engine: createEngine({
    document: createDocument('doc_transactional_create_layout')
  }),
  initialTool: {
    type: 'select'
  },
  initialViewport: {
    center: { x: 0, y: 0 },
    zoom: 1
  },
  registry,
  services: {
    layout
  }
})

describe('transactional create layout', () => {
  it('measures text nodes before node.create commits', () => {
    const editor = createTestEditor()

    const result = editor.actions.node.create({
      position: {
        x: 40,
        y: 24
      },
      template: {
        type: 'text',
        data: {
          text: 'hello'
        }
      }
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(editor.read.document.get().nodes[result.data.nodeId]?.size).toEqual({
      width: 132,
      height: 44
    })
  })

  it('measures sticky auto font before node.create commits', () => {
    const editor = createTestEditor()

    const result = editor.actions.node.create({
      position: {
        x: 0,
        y: 0
      },
      template: {
        type: 'sticky',
        size: {
          width: 180,
          height: 120
        },
        data: {
          text: 'sticky'
        }
      }
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(editor.read.document.get().nodes[result.data.nodeId]?.style?.fontSize).toBe(18)
  })

  it('measures mindmap root and inserted child before commit', () => {
    const editor = createTestEditor()

    const created = editor.actions.mindmap.create({
      template: buildWhiteboardMindmapTemplate({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    expect(editor.read.document.get().nodes[created.data.rootId]?.size).toEqual({
      width: 132,
      height: 44
    })

    const tree = editor.read.mindmap.render.get(created.data.mindmapId)?.tree
    expect(tree).toBeDefined()

    const inserted = editor.actions.mindmap.insertByPlacement({
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

    expect(inserted?.ok).toBe(true)
    if (!inserted?.ok) {
      return
    }

    expect(editor.read.document.get().nodes[inserted.data.nodeId]?.size).toEqual({
      width: 132,
      height: 44
    })
  })
})
