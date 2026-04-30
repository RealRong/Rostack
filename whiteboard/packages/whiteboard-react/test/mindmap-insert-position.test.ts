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
        fontSize: 14
      }
    }

    return {
      kind: 'size',
      size: {
        width: request.widthMode === 'wrap'
          ? (request.wrapWidth ?? request.minWidth ?? 144)
          : (request.minWidth ?? 132),
        height: 44
      }
    }
  }
}

describe('mindmap insert position', () => {
  it('centers the inserted blank mindmap on the requested point', () => {
    const layoutService = createReactTestLayout(layout)
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_insert_position'),
      layout: layoutService
    })
    const editor = editorApi.create({
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
    const insert = createInsertBridge({
      editor,
      catalog: product.insert.catalog.WHITEBOARD_INSERT_CATALOG
    })

    const at = {
      x: 480,
      y: 320
    }
    const result = insert.mindmap({
      at
    })

    expect(result).toBeDefined()
    const rootRect = editor.scene.nodes.get(result!.nodeId)?.geometry.rect
    expect(rootRect).toBeDefined()
    expect(rootRect!.width).toBe(132)
    expect(rootRect!.height).toBe(44)
    expect(rootRect!.x + rootRect!.width / 2).toBe(at.x)
    expect(rootRect!.y + rootRect!.height / 2).toBe(at.y)
  })

  it('keeps the root anchor stable when the root width grows', () => {
    const layoutService = createReactTestLayout(layout)
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_root_anchor'),
      layout: layoutService
    })
    const editor = editorApi.create({
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

    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const beforeRoot = editor.scene.nodes.get(created.data.rootId)?.geometry.rect
    expect(beforeRoot).toBeDefined()

    editor.write.node.patch([created.data.rootId], {
      fields: {
        size: {
          width: 320,
          height: beforeRoot!.height
        }
      }
    })

    const afterRoot = editor.scene.nodes.get(created.data.rootId)?.geometry.rect
    expect(afterRoot).toBeDefined()
    expect(afterRoot!.x).toBe(beforeRoot!.x)
    expect(afterRoot!.y).toBe(beforeRoot!.y)
    expect(afterRoot!.width).toBe(320)
  })
})
