import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { editor as editorApi, type LayoutBackend, type NodeSpec } from '../src'
import { createEditorTestLayout } from './support'

const nodes: NodeSpec = {
  text: {
    meta: {
      type: 'text',
      name: 'Text',
      family: 'text',
      icon: 'text',
      controls: ['text', 'fill']
    },
    behavior: {
      role: 'content',
      connect: true,
      resize: true,
      rotate: true,
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
  },
  sticky: {
    meta: {
      type: 'sticky',
      name: 'Sticky',
      family: 'text',
      icon: 'sticky',
      controls: ['text', 'fill']
    },
    behavior: {
      role: 'content',
      connect: true,
      resize: true,
      rotate: true,
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
  },
  mindmap: {
    meta: {
      type: 'mindmap',
      name: 'Mindmap',
      family: 'shape',
      icon: 'mindmap',
      controls: []
    },
    behavior: {
      role: 'content',
      connect: false,
      resize: false,
      rotate: false
    }
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

const editors = new Set<{
  dispose: () => void
}>()

const trackEditor = <T extends { dispose: () => void }>(
  editor: T
): T => {
  editors.add(editor)
  return editor
}

afterEach(() => {
  editors.forEach((editor) => {
    editor.dispose()
  })
  editors.clear()
})

const createTestEditor = () => {
  const layoutService = createEditorTestLayout(layout)
  const engine = engineApi.create({
    document: documentApi.create('doc_transactional_create_layout'),
    layout: layoutService
  })

  return trackEditor(editorApi.create({
    engine,
    history: engine.history,
    initialTool: {
      type: 'select'
    },
    initialViewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    },
    nodes,
    services: {
      layout: layoutService
    }
  }))
}

describe('transactional create layout', () => {
  it('measures text nodes before node.create commits', () => {
    const editor = createTestEditor()

    const result = editor.write.node.create({
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

    expect(editor.document.get().nodes[result.data.nodeId]?.size).toEqual({
      width: 132,
      height: 44
    })
  })

  it('measures sticky auto font before node.create commits', () => {
    const editor = createTestEditor()

    const result = editor.write.node.create({
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

    expect(editor.document.get().nodes[result.data.nodeId]?.style?.fontSize).toBe(18)
  })

  it('measures mindmap root and inserted child before commit', () => {
    const editor = createTestEditor()

    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    expect(editor.document.get().nodes[created.data.rootId]?.size).toEqual({
      width: 132,
      height: 44
    })

    const inserted = editor.write.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'Child'
      }
    })

    expect(inserted?.ok).toBe(true)
    if (!inserted?.ok) {
      return
    }

    expect(editor.document.get().nodes[inserted.data.nodeId]?.size).toEqual({
      width: 132,
      height: 44
    })
  })
})
