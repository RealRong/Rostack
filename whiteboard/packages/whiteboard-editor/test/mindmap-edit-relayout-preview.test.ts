import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
import { product } from '@whiteboard/product'
import { editor as editorApi } from '../src'
import type { LayoutBackend, NodeRegistry } from '../src'

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
          ? (request.wrapWidth ?? request.minWidth ?? 120)
          : Math.max(request.minWidth ?? 80, request.text.length * 16 + 24),
        height: 44
      }
    }
  }
}

describe('mindmap edit relayout preview', () => {
  it('relayouts child nodes while the root text edit size changes', () => {
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_edit_relayout_preview')
    })
    const editor = editorApi.create({
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

    const created = editor.actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const tree = editor.read.mindmap.structure.get(created.data.mindmapId)?.tree
    expect(tree).toBeDefined()

    const insert = editor.actions.mindmap.insertByPlacement({
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

    expect(insert.ok).toBe(true)
    if (!insert.ok) {
      return
    }

    const beforeRoot = editor.read.node.render.get(created.data.rootId)?.rect
    const beforeChild = editor.read.node.render.get(insert.data.nodeId)?.rect

    expect(beforeRoot).toBeDefined()
    expect(beforeChild).toBeDefined()

    editor.actions.edit.startNode(created.data.rootId, 'text')
    editor.actions.edit.input('Central topic with much longer live width')

    const liveRoot = editor.read.node.render.get(created.data.rootId)?.rect
    const liveChild = editor.read.node.render.get(insert.data.nodeId)?.rect

    expect(liveRoot).toBeDefined()
    expect(liveChild).toBeDefined()
    expect(liveRoot!.x).toBe(beforeRoot!.x)
    expect(liveRoot!.width).toBeGreaterThan(beforeRoot!.width)
    expect(liveChild!.x).toBeGreaterThan(beforeChild!.x)
  })

  it('updates topic width through actual edit input while editing', () => {
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_topic_edit_width_preview')
    })
    const editor = editorApi.create({
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

    const created = editor.actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const tree = editor.read.mindmap.structure.get(created.data.mindmapId)?.tree
    expect(tree).toBeDefined()

    const insert = editor.actions.mindmap.insertByPlacement({
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

    expect(insert.ok).toBe(true)
    if (!insert.ok) {
      return
    }

    const beforeChild = editor.read.node.render.get(insert.data.nodeId)?.rect
    const beforeScene = editor.read.mindmap.scene.get(created.data.mindmapId)?.bbox

    expect(beforeChild).toBeDefined()
    expect(beforeScene).toBeDefined()

    editor.actions.edit.startNode(insert.data.nodeId, 'text')
    editor.actions.edit.input('Child topic with much longer text')

    const liveChild = editor.read.node.render.get(insert.data.nodeId)?.rect
    const liveScene = editor.read.mindmap.scene.get(created.data.mindmapId)?.bbox
    const session = editor.store.edit.get()

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

    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_edit_relayout_preview_height')
    })
    const editor = editorApi.create({
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
        layout: heightAwareLayout
      }
    })

    const created = editor.actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const tree = editor.read.mindmap.structure.get(created.data.mindmapId)?.tree
    expect(tree).toBeDefined()

    const first = editor.actions.mindmap.insertByPlacement({
      id: created.data.mindmapId,
      tree: tree!,
      targetNodeId: created.data.rootId,
      placement: 'right',
      layout: tree!.layout,
      payload: {
        kind: 'text',
        text: 'First'
      }
    })

    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const updatedTree = editor.read.mindmap.structure.get(created.data.mindmapId)?.tree
    expect(updatedTree).toBeDefined()

    const second = editor.actions.mindmap.insertByPlacement({
      id: created.data.mindmapId,
      tree: updatedTree!,
      targetNodeId: created.data.rootId,
      placement: 'right',
      layout: updatedTree!.layout,
      payload: {
        kind: 'text',
        text: 'Second'
      }
    })

    expect(second.ok).toBe(true)
    if (!second.ok) {
      return
    }

    const beforeFirst = editor.read.node.render.get(first.data.nodeId)?.rect
    const beforeSecond = editor.read.node.render.get(second.data.nodeId)?.rect

    expect(beforeFirst).toBeDefined()
    expect(beforeSecond).toBeDefined()
    expect(beforeFirst!.height).toBe(44)
    expect(beforeSecond!.height).toBe(44)

    editor.actions.edit.startNode(first.data.nodeId, 'text')
    editor.actions.edit.input('First branch now wraps into multiple visual lines')

    const liveFirst = editor.read.node.render.get(first.data.nodeId)?.rect
    const liveSecond = editor.read.node.render.get(second.data.nodeId)?.rect

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

    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_edit_relayout_preview_subscription')
    })
    const editor = editorApi.create({
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
        layout: heightAwareLayout
      }
    })

    const created = editor.actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const tree = editor.read.mindmap.structure.get(created.data.mindmapId)?.tree
    expect(tree).toBeDefined()

    const first = editor.actions.mindmap.insertByPlacement({
      id: created.data.mindmapId,
      tree: tree!,
      targetNodeId: created.data.rootId,
      placement: 'right',
      layout: tree!.layout,
      payload: {
        kind: 'text',
        text: 'First'
      }
    })

    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const updatedTree = editor.read.mindmap.structure.get(created.data.mindmapId)?.tree
    expect(updatedTree).toBeDefined()

    const second = editor.actions.mindmap.insertByPlacement({
      id: created.data.mindmapId,
      tree: updatedTree!,
      targetNodeId: created.data.rootId,
      placement: 'right',
      layout: updatedTree!.layout,
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
    const unsubscribe = editor.read.node.render.subscribe(second.data.nodeId, () => {
      const rect = editor.read.node.render.get(second.data.nodeId)?.rect
      if (!rect) {
        return
      }

      notifications.push({
        y: rect.y,
        height: rect.height
      })
    })

    editor.actions.edit.startNode(first.data.nodeId, 'text')
    editor.actions.edit.input('First branch now wraps into multiple visual lines')

    unsubscribe()

    expect(notifications.length).toBeGreaterThan(0)
    expect(notifications.at(-1)?.y).toBe(
      editor.read.node.render.get(second.data.nodeId)?.rect.y
    )
  })
})
