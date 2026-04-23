import { describe, expect, it, vi } from 'vitest'
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
    document: documentApi.create('doc_mindmap_enter_animation')
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

describe('mindmap enter animation', () => {
  it('publishes intermediate topic positions while the enter preview is active', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    const editor = createEditor()

    try {
      const created = editor.actions.mindmap.create({
        template: product.mindmap.template.build({
          preset: 'mindmap.underline-split'
        })
      })

      expect(created.ok).toBe(true)
      if (!created.ok) {
        return
      }

      const inserted = editor.actions.mindmap.insertRelative({
        id: created.data.mindmapId,
        targetNodeId: created.data.rootId,
        relation: 'child',
        side: 'right',
        behavior: {
          enter: 'from-anchor'
        },
        payload: {
          kind: 'text',
          text: 'Child'
        }
      })

      expect(inserted.ok).toBe(true)
      if (!inserted.ok) {
        return
      }

      const startRect = editor.read.node.view.get(inserted.data.nodeId)?.rect
      expect(startRect).toBeDefined()

      vi.advanceTimersByTime(120)
      const midRect = editor.read.node.view.get(inserted.data.nodeId)?.rect

      vi.advanceTimersByTime(200)
      const endRect = editor.read.node.view.get(inserted.data.nodeId)?.rect

      expect(midRect).toBeDefined()
      expect(endRect).toBeDefined()
      expect(midRect!.x).toBeGreaterThan(startRect!.x)
      expect(midRect!.x).toBeLessThan(endRect!.x)
      expect(endRect!.x).toBeGreaterThan(startRect!.x)
    } finally {
      editor.dispose()
      nowSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
