import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { editor as editorApi } from '../src'
import type { NodeSpec, PointerInput } from '../src'
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
  const layoutService = createEditorTestLayout()
  const engine = engineApi.create({
    document: documentApi.create('doc_mindmap_drag_preview'),
    layout: layoutService
  })

  return trackEditor(editorApi.create({
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

    editor.write.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const beforeRoot = editor.document.snapshot().nodes[created.data.rootId]?.position
    const beforeChild = editor.document.snapshot().nodes[insert.data.nodeId]?.position

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

    const afterRoot = editor.document.snapshot().nodes[created.data.rootId]?.position
    const afterChild = editor.document.snapshot().nodes[insert.data.nodeId]?.position

    expect(afterRoot).toEqual({
      x: beforeRoot!.x + 60,
      y: beforeRoot!.y + 40
    })
    expect(afterChild).toEqual(beforeChild)
  })

  it('updates root and child render rects during root drag preview', async () => {
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

    editor.write.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const beforeRoot = editor.scene.nodes.get(created.data.rootId)?.geometry.rect
    const beforeChild = editor.scene.nodes.get(insert.data.nodeId)?.geometry.rect

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

    const liveRoot = editor.scene.nodes.get(created.data.rootId)?.geometry.rect
    const liveChild = editor.scene.nodes.get(insert.data.nodeId)?.geometry.rect

    expect(editor.state.interaction.get().busy).toBe(true)
    expect(editor.state.interaction.get().selecting).toBe(true)
    expect(liveRoot).toBeDefined()
    expect(liveChild).toBeDefined()
    expect(liveRoot!.x).toBe(beforeRoot!.x + 60)
    expect(liveRoot!.y).toBe(beforeRoot!.y + 40)
    expect(liveChild!.x).toBe(beforeChild!.x + 60)
    expect(liveChild!.y).toBe(beforeChild!.y + 40)
  })

  it('updates subtree render rects during topic drag preview', async () => {
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

    const first = editor.write.mindmap.insertRelative({
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

    const second = editor.write.mindmap.insertRelative({
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

    editor.write.selection.replace({
      nodeIds: [first.data.nodeId]
    })

    const beforeBranch = editor.scene.nodes.get(first.data.nodeId)?.geometry.rect
    const beforeLeaf = editor.scene.nodes.get(second.data.nodeId)?.geometry.rect

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

    const liveBranch = editor.scene.nodes.get(first.data.nodeId)?.geometry.rect
    const liveLeaf = editor.scene.nodes.get(second.data.nodeId)?.geometry.rect

    expect(editor.state.interaction.get().busy).toBe(true)
    expect(editor.state.interaction.get().selecting).toBe(true)
    expect(liveBranch).toBeDefined()
    expect(liveLeaf).toBeDefined()
    expect(liveBranch!.x).toBe(beforeBranch!.x + 80)
    expect(liveBranch!.y).toBe(beforeBranch!.y + 24)
    expect(liveLeaf!.x).toBe(beforeLeaf!.x + 80)
    expect(liveLeaf!.y).toBe(beforeLeaf!.y + 24)
  })
})
