import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { createHistoryPort } from '@shared/mutation'
import { editor as editorApi, type LayoutBackend } from '@whiteboard/editor'
import type { NodeRegistry } from '@whiteboard/editor'
import { product } from '@whiteboard/product'
import { createInsertBridge } from '../src/runtime/bridge/insert'

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
          controls: ['fill', 'text']
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

const createEditor = () => {
  const engine = engineApi.create({
    document: documentApi.create('doc_insert_focus')
  })

  return editorApi.create({
    engine,
    history: createHistoryPort(engine),
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

    editor.write.tool.insert(
      createInsertTool(product.insert.catalog.WHITEBOARD_INSERT_CATALOG.defaults.text).template
    )

    const result = insert.text({
      at: {
        x: 120,
        y: 80
      }
    })

    expect(result).toBeDefined()
    expect(editor.session.tool.get().type).toBe('select')
    expect(editor.scene.stores.graph.state.node.byId.get(result!.nodeId)?.selected).toBe(true)
    expect(editor.session.edit.get()).toMatchObject({
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
    editor.write.tool.insert(
      createInsertTool(presetKey).template
    )

    const result = insert.sticky({
      at: {
        x: 160,
        y: 120
      }
    })

    expect(result).toBeDefined()
    expect(editor.session.tool.get().type).toBe('select')
    expect(editor.scene.stores.graph.state.node.byId.get(result!.nodeId)?.selected).toBe(true)
    expect(editor.session.edit.get()).toMatchObject({
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
    editor.write.tool.insert(
      createInsertTool(presetKey).template
    )

    const result = insert.mindmap({
      at: {
        x: 240,
        y: 160
      }
    })

    expect(result).toBeDefined()
    expect(editor.session.tool.get().type).toBe('select')
    expect(editor.scene.stores.graph.state.node.byId.get(result!.nodeId)?.selected).toBe(true)
    expect(editor.session.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: result!.nodeId,
      field: 'text'
    })
  })
})
