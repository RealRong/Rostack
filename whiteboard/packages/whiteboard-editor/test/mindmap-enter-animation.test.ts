import { describe, expect, it, vi } from 'vitest'
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
  const layoutService = createEditorTestLayout(layout)
  const engine = engineApi.create({
    document: documentApi.create('doc_mindmap_enter_animation'),
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

describe('mindmap enter animation', () => {
  it('publishes intermediate topic positions while the enter preview is active', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    const editor = createEditor()

    try {
      const created = editor.actions.document.mindmap.create({
        template: product.mindmap.template.build({
          preset: 'mindmap.underline-split'
        })
      })

      expect(created.ok).toBe(true)
      if (!created.ok) {
        return
      }

      const inserted = editor.actions.document.mindmap.insertRelative({
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

      await Promise.resolve()

      const baseRect = editor.scene.nodes.get(inserted.data.nodeId)?.geometry.rect
      const connectorAtStart = editor.scene.mindmaps.get(created.data.mindmapId)?.render.connectors
        .find((connector) => connector.childId === inserted.data.nodeId)?.path
      expect(baseRect).toBeDefined()
      expect(connectorAtStart).toBeDefined()

      await vi.advanceTimersByTimeAsync(120)
      const midPosition = editor.scene.stores.render.node.byId.get(inserted.data.nodeId)?.presentation?.position
      const connectorAtMid = editor.scene.mindmaps.get(created.data.mindmapId)?.render.connectors
        .find((connector) => connector.childId === inserted.data.nodeId)?.path

      await vi.advanceTimersByTimeAsync(200)
      const endPosition = editor.scene.stores.render.node.byId.get(inserted.data.nodeId)?.presentation?.position
      const endRect = editor.scene.nodes.get(inserted.data.nodeId)?.geometry.rect
      const connectorAtEnd = editor.scene.mindmaps.get(created.data.mindmapId)?.render.connectors
        .find((connector) => connector.childId === inserted.data.nodeId)?.path

      expect(midPosition).toBeDefined()
      expect(endPosition).toBeUndefined()
      expect(endRect).toBeDefined()
      expect(baseRect!.x).toBeLessThan(endRect!.x)
      expect(baseRect!.x).not.toBe(endRect!.x)
      expect(midPosition!.x).toBeLessThan(endRect!.x)
      expect(midPosition!.x).not.toBe(endRect!.x)
      expect(midPosition!.x).toBeGreaterThanOrEqual(baseRect!.x)
      expect(connectorAtMid).toBeDefined()
      expect(connectorAtEnd).toBeDefined()
      expect(connectorAtStart).not.toBe(connectorAtEnd)
      expect(connectorAtMid).not.toBe(connectorAtEnd)
    } finally {
      editor.dispose()
      nowSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
