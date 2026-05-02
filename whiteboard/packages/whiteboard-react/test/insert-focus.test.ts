import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { editor as editorApi, type LayoutBackend } from '@whiteboard/editor'
import type { NodeSpec } from '@whiteboard/editor'
import { product } from '@whiteboard/product'
import { createInsertBridge } from '../src/runtime/bridge/insert'
import { createReactTestLayout } from './support'

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
      controls: ['fill', 'text']
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

const createEditor = () => {
  const layoutService = createReactTestLayout(layout)
  const engine = engineApi.create({
    document: documentApi.create('doc_insert_focus'),
    layout: layoutService
  })

  return editorApi.create({
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
  })
}

const createInsertTool = (
  presetKey: string
) => {
  const preset = product.insert.catalog.WHITEBOARD_INSERT_CATALOG.get(presetKey)
  if (!preset) {
    throw new Error(`Insert preset ${presetKey} not found.`)
  }

  return {
    type: 'insert' as const,
    template: preset.template
  }
}

describe('insert focus', () => {
  it('switches back to select and starts editing for text insert', () => {
    const editor = createEditor()
    const insert = createInsertBridge({
      editor,
      catalog: product.insert.catalog.WHITEBOARD_INSERT_CATALOG
    })

    editor.actions.tool.insert(
      createInsertTool(product.insert.catalog.WHITEBOARD_INSERT_CATALOG.defaults.text).template
    )

    const result = insert.text({
      at: {
        x: 120,
        y: 80
      }
    })

    expect(result).toBeDefined()
    expect(editor.scene.ui.state.tool.get().type).toBe('select')
    expect(editor.scene.stores.graph.state.node.byId.get(result!.nodeId)?.selected).toBe(true)
    expect(editor.scene.ui.state.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: result!.nodeId,
      field: 'text'
    })
  })

  it('switches back to select and starts editing for sticky insert', () => {
    const editor = createEditor()
    const insert = createInsertBridge({
      editor,
      catalog: product.insert.catalog.WHITEBOARD_INSERT_CATALOG
    })

    const presetKey = product.insert.catalog.WHITEBOARD_INSERT_CATALOG.defaults.sticky
    editor.actions.tool.insert(
      createInsertTool(presetKey).template
    )

    const result = insert.sticky({
      at: {
        x: 160,
        y: 120
      }
    })

    expect(result).toBeDefined()
    expect(editor.scene.ui.state.tool.get().type).toBe('select')
    expect(editor.scene.stores.graph.state.node.byId.get(result!.nodeId)?.selected).toBe(true)
    expect(editor.scene.ui.state.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: result!.nodeId,
      field: 'text'
    })
  })

  it('switches back to select and starts editing for mindmap insert', () => {
    const editor = createEditor()
    const insert = createInsertBridge({
      editor,
      catalog: product.insert.catalog.WHITEBOARD_INSERT_CATALOG
    })

    const presetKey = product.insert.catalog.WHITEBOARD_INSERT_CATALOG.defaults.mindmap
    editor.actions.tool.insert(
      createInsertTool(presetKey).template
    )

    const result = insert.mindmap({
      at: {
        x: 240,
        y: 160
      }
    })

    expect(result).toBeDefined()
    expect(editor.scene.ui.state.tool.get().type).toBe('select')
    expect(editor.scene.stores.graph.state.node.byId.get(result!.nodeId)?.selected).toBe(true)
    expect(editor.scene.ui.state.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: result!.nodeId,
      field: 'text'
    })
  })
})
