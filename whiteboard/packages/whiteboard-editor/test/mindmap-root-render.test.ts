import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
import { product } from '@whiteboard/product'
import { editor as editorApi, type LayoutBackend, type NodeRegistry } from '../src'

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
          : 132,
        height: 44
      }
    }
  }
}

const createEditor = () => {
  const engine = engineApi.create({
    document: documentApi.create('doc_mindmap_root_render')
  })

  return editorApi.create({
    engine,
    history: historyApi.local.create(engine),
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

describe('mindmap root render', () => {
  it('marks the selected root as mindmap root and exposes both root add buttons', () => {
    const editor = createEditor()
    const created = editor.actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    editor.actions.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const rootRender = editor.read.node.render.get(created.data.rootId)
    expect(rootRender?.mindmapRoot).toBe(true)
    expect(rootRender?.canConnect).toBe(false)
    expect(rootRender?.canResize).toBe(false)
    expect(rootRender?.canRotate).toBe(false)

    const mindmapRender = editor.read.mindmap.render.get(created.data.mindmapId)
    expect(mindmapRender?.rootId).toBe(created.data.rootId)
    expect(mindmapRender?.addChildren.map((entry) => entry.placement)).toEqual([
      'left',
      'right'
    ])
  })
})
