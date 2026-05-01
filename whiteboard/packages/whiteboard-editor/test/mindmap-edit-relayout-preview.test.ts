import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { editor as editorApi } from '../src'
import type { LayoutBackend, NodeSpec } from '../src'
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
          ? (request.wrapWidth ?? request.minWidth ?? 120)
          : Math.max(request.minWidth ?? 80, request.text.length * 16 + 24),
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

describe('mindmap edit relayout preview', () => {
  it('relayouts child nodes while the root text edit size changes', () => {
    const layoutService = createEditorTestLayout(layout)
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_edit_relayout_preview'),
      layout: layoutService
    })
    const editor = trackEditor(editorApi.create({
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

    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const insert = editor.write.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'Child'
      }
    })

    expect(insert.ok).toBe(true)
    if (!insert.ok) {
      return
    }

    const beforeRoot = editor.scene.nodes.get(created.data.rootId)?.geometry.rect
    const beforeChild = editor.scene.nodes.get(insert.data.nodeId)?.geometry.rect

    expect(beforeRoot).toBeDefined()
    expect(beforeChild).toBeDefined()

    editor.write.edit.startNode(created.data.rootId, 'text')
    editor.write.edit.input('Central topic with much longer live width')

    const liveRoot = editor.scene.nodes.get(created.data.rootId)?.geometry.rect
    const liveChild = editor.scene.nodes.get(insert.data.nodeId)?.geometry.rect

    expect(liveRoot).toBeDefined()
    expect(liveChild).toBeDefined()
    expect(liveRoot!.x).toBe(beforeRoot!.x)
    expect(liveRoot!.width).toBeGreaterThan(beforeRoot!.width)
    expect(liveChild!.x).toBeGreaterThan(beforeChild!.x)
  })

  it('updates topic width through actual edit input while editing', () => {
    const layoutService = createEditorTestLayout(layout)
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_topic_edit_width_preview'),
      layout: layoutService
    })
    const editor = trackEditor(editorApi.create({
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

    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const insert = editor.write.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'Child'
      }
    })

    expect(insert.ok).toBe(true)
    if (!insert.ok) {
      return
    }

    const beforeChild = editor.scene.nodes.get(insert.data.nodeId)?.geometry.rect
    const beforeScene = editor.scene.mindmaps.get(created.data.mindmapId)?.tree.bbox

    expect(beforeChild).toBeDefined()
    expect(beforeScene).toBeDefined()

    editor.write.edit.startNode(insert.data.nodeId, 'text')
    editor.write.edit.input('Child topic with much longer text')

    const liveChild = editor.scene.nodes.get(insert.data.nodeId)?.geometry.rect
    const liveScene = editor.scene.mindmaps.get(created.data.mindmapId)?.tree.bbox
    const session = editor.scene.editor.edit.get()

    expect(liveChild).toBeDefined()
    expect(liveScene).toBeDefined()
    expect(session).toMatchObject({
      kind: 'node',
      nodeId: insert.data.nodeId
    })
    expect(liveChild!.width).toBeGreaterThan(beforeChild!.width)
    expect(liveScene!.width).toBeGreaterThanOrEqual(beforeScene!.width)
  })

  it('relayouts sibling positions when topic live height grows during edit', () => {
    const heightAwareLayout: LayoutBackend = {
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
            width: 120,
            height: request.text.length > 24 ? 88 : 44
          }
        }
      }
    }

    const layoutService = createEditorTestLayout(heightAwareLayout)
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_edit_relayout_preview_height'),
      layout: layoutService
    })
    const editor = trackEditor(editorApi.create({
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

    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const first = editor.write.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'First'
      }
    })

    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const second = editor.write.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'Second'
      }
    })

    expect(second.ok).toBe(true)
    if (!second.ok) {
      return
    }

    const beforeFirst = editor.scene.nodes.get(first.data.nodeId)?.geometry.rect
    const beforeSecond = editor.scene.nodes.get(second.data.nodeId)?.geometry.rect

    expect(beforeFirst).toBeDefined()
    expect(beforeSecond).toBeDefined()
    expect(beforeFirst!.height).toBe(44)
    expect(beforeSecond!.height).toBe(44)

    editor.write.edit.startNode(first.data.nodeId, 'text')
    editor.write.edit.input('First branch now wraps into multiple visual lines')

    const liveFirst = editor.scene.nodes.get(first.data.nodeId)?.geometry.rect
    const liveSecond = editor.scene.nodes.get(second.data.nodeId)?.geometry.rect

    expect(liveFirst).toBeDefined()
    expect(liveSecond).toBeDefined()
    expect(liveFirst!.height).toBe(88)
    expect(liveSecond!.y).toBeGreaterThan(beforeSecond!.y)
  })

  it('notifies subscribed sibling render during live topic relayout', () => {
    const heightAwareLayout: LayoutBackend = {
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
            width: 120,
            height: request.text.length > 24 ? 88 : 44
          }
        }
      }
    }

    const layoutService = createEditorTestLayout(heightAwareLayout)
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_edit_relayout_preview_subscription'),
      layout: layoutService
    })
    const editor = trackEditor(editorApi.create({
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

    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const first = editor.write.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'First'
      }
    })

    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const second = editor.write.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'Second'
      }
    })

    expect(second.ok).toBe(true)
    if (!second.ok) {
      return
    }

    const notifications: Array<{
      y: number
      height: number
    }> = []
    const unsubscribe = editor.scene.stores.render.node.byId.subscribe(second.data.nodeId, () => {
      const rect = editor.scene.nodes.get(second.data.nodeId)?.geometry.rect
      if (!rect) {
        return
      }

      notifications.push({
        y: rect.y,
        height: rect.height
      })
    })

    editor.write.edit.startNode(first.data.nodeId, 'text')
    editor.write.edit.input('First branch now wraps into multiple visual lines')

    unsubscribe()

    expect(notifications.length).toBeGreaterThan(0)
    expect(notifications.at(-1)?.y).toBe(
      editor.scene.nodes.get(second.data.nodeId)?.geometry.rect.y
    )
  })
})
