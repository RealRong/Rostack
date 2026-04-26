import { afterEach, describe, expect, it } from 'vitest'
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

const createEditor = () => {
  const engine = engineApi.create({
    document: documentApi.create('doc_mindmap_root_render')
  })

  return trackEditor(editorApi.create({
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
  }))
}

describe('mindmap root render', () => {
  it('treats the root as a normal node and exposes both root add buttons through chrome', () => {
    const editor = createEditor()
    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    editor.write.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const rootCapability = editor.scene.nodes.capability.get(created.data.rootId)
    expect(rootCapability?.connect).toBe(true)
    expect(rootCapability?.resize).toBe(false)
    expect(rootCapability?.rotate).toBe(false)

    const chrome = editor.session.mindmap.chrome.get(created.data.mindmapId)
    expect(chrome?.addChildTargets.map((entry) => entry.placement)).toEqual([
      'left',
      'right'
    ])
  })
})
