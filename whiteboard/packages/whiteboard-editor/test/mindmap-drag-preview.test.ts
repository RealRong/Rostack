import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
import { product } from '@whiteboard/product'
import { editor as editorApi } from '../src'
import type { NodeRegistry, PointerInput } from '../src'

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

const createEditor = () => {
  const engine = engineApi.create({
    document: documentApi.create('doc_mindmap_drag_preview')
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
    registry
  })
}

const createPointerInput = (
  input: {
    phase: PointerInput['phase']
    x: number
    y: number
    pick: PointerInput['pick']
  }
): PointerInput => ({
  phase: input.phase,
  pointerId: 1,
  button: 0,
  buttons: input.phase === 'up' ? 0 : 1,
  detail: 1,
  client: { x: input.x, y: input.y },
  screen: { x: input.x, y: input.y },
  world: { x: input.x, y: input.y },
  samples: [],
  modifiers: {
    alt: false,
    shift: false,
    ctrl: false,
    meta: false
  },
  pick: input.pick,
  editable: false,
  ignoreInput: false,
  ignoreSelection: false,
  ignoreContextMenu: false
})

describe('mindmap drag preview', () => {
  it('commits whole-tree movement through pointer drag on root field', () => {
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

    const insert = editor.actions.mindmap.insertRelative({
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

    editor.actions.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const beforeRoot = editor.read.document.get().nodes[created.data.rootId]?.position
    const beforeChild = editor.read.document.get().nodes[insert.data.nodeId]?.position

    editor.input.pointerDown(createPointerInput({
      phase: 'down',
      x: beforeRoot!.x + 10,
      y: beforeRoot!.y + 10,
      pick: {
        kind: 'node',
        id: created.data.rootId,
        part: 'field',
        field: 'text'
      }
    }))
    editor.input.pointerMove(createPointerInput({
      phase: 'move',
      x: beforeRoot!.x + 70,
      y: beforeRoot!.y + 50,
      pick: {
        kind: 'node',
        id: created.data.rootId,
        part: 'field',
        field: 'text'
      }
    }))
    editor.input.pointerUp(createPointerInput({
      phase: 'up',
      x: beforeRoot!.x + 70,
      y: beforeRoot!.y + 50,
      pick: {
        kind: 'node',
        id: created.data.rootId,
        part: 'field',
        field: 'text'
      }
    }))

    const afterRoot = editor.read.document.get().nodes[created.data.rootId]?.position
    const afterChild = editor.read.document.get().nodes[insert.data.nodeId]?.position

    expect(afterRoot).toEqual({
      x: beforeRoot!.x + 60,
      y: beforeRoot!.y + 40
    })
    expect(afterChild).toEqual({
      x: beforeChild!.x + 60,
      y: beforeChild!.y + 40
    })
  })

  it('updates root and child render rects during root drag preview', async () => {
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

    const insert = editor.actions.mindmap.insertRelative({
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

    editor.actions.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const beforeRoot = editor.read.node.render.get(created.data.rootId)?.rect
    const beforeChild = editor.read.node.render.get(insert.data.nodeId)?.rect

    expect(beforeRoot).toBeDefined()
    expect(beforeChild).toBeDefined()

    editor.input.pointerDown(createPointerInput({
      phase: 'down',
      x: beforeRoot!.x + beforeRoot!.width / 2,
      y: beforeRoot!.y + beforeRoot!.height / 2,
      pick: {
        kind: 'node',
        id: created.data.rootId,
        part: 'field',
        field: 'text'
      }
    }))
    editor.input.pointerMove(createPointerInput({
      phase: 'move',
      x: beforeRoot!.x + beforeRoot!.width / 2 + 60,
      y: beforeRoot!.y + beforeRoot!.height / 2 + 40,
      pick: {
        kind: 'node',
        id: created.data.rootId,
        part: 'field',
        field: 'text'
      }
    }))

    await Promise.resolve()
    await Promise.resolve()

    const liveRoot = editor.read.node.render.get(created.data.rootId)?.rect
    const liveChild = editor.read.node.render.get(insert.data.nodeId)?.rect

    expect(editor.store.interaction.get().busy).toBe(true)
    expect(editor.store.interaction.get().selecting).toBe(true)
    expect(liveRoot).toBeDefined()
    expect(liveChild).toBeDefined()
    expect(liveRoot!.x).toBe(beforeRoot!.x + 60)
    expect(liveRoot!.y).toBe(beforeRoot!.y + 40)
    expect(liveChild!.x).toBe(beforeChild!.x + 60)
    expect(liveChild!.y).toBe(beforeChild!.y + 40)
  })

  it('updates subtree render rects during topic drag preview', async () => {
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

    const first = editor.actions.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: created.data.rootId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'Branch'
      }
    })

    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const second = editor.actions.mindmap.insertRelative({
      id: created.data.mindmapId,
      targetNodeId: first.data.nodeId,
      relation: 'child',
      side: 'right',
      payload: {
        kind: 'text',
        text: 'Leaf'
      }
    })

    expect(second.ok).toBe(true)
    if (!second.ok) {
      return
    }

    editor.actions.selection.replace({
      nodeIds: [first.data.nodeId]
    })

    const beforeBranch = editor.read.node.render.get(first.data.nodeId)?.rect
    const beforeLeaf = editor.read.node.render.get(second.data.nodeId)?.rect

    expect(beforeBranch).toBeDefined()
    expect(beforeLeaf).toBeDefined()

    editor.input.pointerDown(createPointerInput({
      phase: 'down',
      x: beforeBranch!.x + beforeBranch!.width / 2,
      y: beforeBranch!.y + beforeBranch!.height / 2,
      pick: {
        kind: 'node',
        id: first.data.nodeId,
        part: 'field',
        field: 'text'
      }
    }))
    editor.input.pointerMove(createPointerInput({
      phase: 'move',
      x: beforeBranch!.x + beforeBranch!.width / 2 + 80,
      y: beforeBranch!.y + beforeBranch!.height / 2 + 24,
      pick: {
        kind: 'node',
        id: first.data.nodeId,
        part: 'field',
        field: 'text'
      }
    }))

    await Promise.resolve()
    await Promise.resolve()

    const liveBranch = editor.read.node.render.get(first.data.nodeId)?.rect
    const liveLeaf = editor.read.node.render.get(second.data.nodeId)?.rect

    expect(editor.store.interaction.get().busy).toBe(true)
    expect(editor.store.interaction.get().selecting).toBe(true)
    expect(liveBranch).toBeDefined()
    expect(liveLeaf).toBeDefined()
    expect(liveBranch!.x).toBe(beforeBranch!.x + 80)
    expect(liveBranch!.y).toBe(beforeBranch!.y + 24)
    expect(liveLeaf!.x).toBe(beforeLeaf!.x + 80)
    expect(liveLeaf!.y).toBe(beforeLeaf!.y + 24)
  })
})
