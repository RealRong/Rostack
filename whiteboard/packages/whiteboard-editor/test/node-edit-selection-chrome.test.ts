import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
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
  shape: {
    meta: {
      type: 'shape',
      name: 'Shape',
      family: 'shape',
      icon: 'shape',
      controls: ['fill', 'stroke', 'text']
    },
    behavior: {
      role: 'content',
      connect: true,
      resize: true,
      rotate: true
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

const createTextEditor = () => {
  const layout = createEditorTestLayout()
  const document = documentApi.create('doc_node_edit_selection_chrome')
  document.nodes['text-1'] = {
    id: 'text-1',
    type: 'text',
    position: { x: 40, y: 60 },
    size: { width: 120, height: 28 },
    data: {
      text: 'Hello'
    }
  }
  document.canvas.order = [{
    kind: 'node',
    id: 'text-1'
  }]

  const engine = engineApi.create({
    document,
    layout
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
      layout
    }
  }))
}

const createShapeEditor = () => {
  const layout = createEditorTestLayout()
  const document = documentApi.create('doc_shape_selection_toolbar_write')
  document.nodes['shape-1'] = {
    id: 'shape-1',
    type: 'shape',
    position: { x: 80, y: 120 },
    size: { width: 160, height: 100 },
    data: {
      text: 'Shape'
    },
    style: {
      fill: '#ffffff',
      stroke: '#111827',
      strokeWidth: 1
    }
  }
  document.canvas.order = [{
    kind: 'node',
    id: 'shape-1'
  }]

  const engine = engineApi.create({
    document,
    layout
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
      layout
    }
  }))
}

const createPointerInput = (
  input: {
    phase: PointerInput['phase']
    x: number
    y: number
    pick: PointerInput['pick']
    buttons?: number
  }
): PointerInput => ({
  phase: input.phase,
  pointerId: 1,
  button: 0,
  buttons: input.buttons ?? (input.phase === 'up' ? 0 : 1),
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

const createMindmapEditor = () => {
  const layout = createEditorTestLayout()
  const document = documentApi.create('doc_mindmap_root_edit_selection_chrome')
  document.nodes['root-1'] = {
    id: 'root-1',
    type: 'text',
    owner: {
      kind: 'mindmap',
      id: 'mind-1'
    },
    position: { x: 200, y: 180 },
    size: { width: 132, height: 32 },
    data: {
      text: 'Central topic'
    }
  }
  document.mindmaps['mind-1'] = {
    id: 'mind-1',
    root: 'root-1',
    members: {
      'root-1': {
        branchStyle: {
          color: '#111827',
          line: 'curve',
          width: 2,
          stroke: 'solid'
        }
      }
    },
    children: {
      'root-1': []
    },
    layout: {
      side: 'both',
      mode: 'tidy',
      hGap: 28,
      vGap: 18
    }
  }
  document.canvas.order = [{
    kind: 'mindmap',
    id: 'mind-1'
  }]

  const engine = engineApi.create({
    document,
    layout
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
      layout
    }
  }))
}

const createEdgeEditor = () => {
  const layout = createEditorTestLayout()
  const document = documentApi.create('doc_edge_label_toolbar_hidden')
  document.nodes['node-1'] = {
    id: 'node-1',
    type: 'shape',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 }
  }
  document.nodes['node-2'] = {
    id: 'node-2',
    type: 'shape',
    position: { x: 240, y: 120 },
    size: { width: 120, height: 80 }
  }
  document.edges['edge-1'] = {
    id: 'edge-1',
    type: 'straight',
    source: {
      kind: 'node',
      nodeId: 'node-1'
    },
    target: {
      kind: 'node',
      nodeId: 'node-2'
    },
    labels: [{
      id: 'label-1',
      text: 'Label'
    }]
  }
  document.canvas.order = [
    {
      kind: 'node',
      id: 'node-1'
    },
    {
      kind: 'node',
      id: 'node-2'
    },
    {
      kind: 'edge',
      id: 'edge-1'
    }
  ]

  const engine = engineApi.create({
    document,
    layout
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
      layout
    }
  }))
}

describe('node edit selection chrome', () => {
  it('keeps toolbar and overlay visible while editing a selected text node', () => {
    const editor = createTextEditor()

    editor.write.selection.replace({
      nodeIds: ['text-1']
    })
    editor.write.edit.startNode('text-1', 'text')

    expect(editor.derived.editor.selection.toolbar.get()).toMatchObject({
      selectionKind: 'nodes',
      target: {
        nodeIds: ['text-1'],
        edgeIds: []
      }
    })
    expect(editor.derived.editor.selection.overlay.get()).toMatchObject({
      kind: 'node',
      nodeId: 'text-1',
      handles: false
    })
  })

  it('keeps toolbar and overlay visible while editing a selected mindmap-owned root topic', () => {
    const editor = createMindmapEditor()

    editor.write.selection.replace({
      nodeIds: ['root-1']
    })
    editor.write.edit.startNode('root-1', 'text')

    expect(editor.derived.editor.selection.toolbar.get()).toMatchObject({
      selectionKind: 'nodes',
      target: {
        nodeIds: ['root-1'],
        edgeIds: []
      }
    })
    expect(editor.derived.editor.selection.overlay.get()).toMatchObject({
      kind: 'node',
      nodeId: 'root-1',
      handles: false
    })
  })

  it('continues hiding the selection toolbar while editing an edge label', () => {
    const editor = createEdgeEditor()

    editor.write.selection.replace({
      edgeIds: ['edge-1']
    })
    editor.write.edit.startEdgeLabel('edge-1', 'label-1')

    expect(editor.derived.editor.selection.toolbar.get()).toBeUndefined()
  })

  it('keeps node drag and toolbar style writes working for a selected shape', () => {
    const editor = createShapeEditor()

    editor.write.selection.replace({
      nodeIds: ['shape-1']
    })

    const beforeRect = editor.scene.read.scene.nodes.get('shape-1')?.geometry.rect
    expect(beforeRect).toBeDefined()

    editor.input.pointerDown(createPointerInput({
      phase: 'down',
      x: beforeRect!.x + beforeRect!.width / 2,
      y: beforeRect!.y + beforeRect!.height / 2,
      pick: {
        kind: 'node',
        id: 'shape-1',
        part: 'body'
      }
    }))
    editor.input.pointerMove(createPointerInput({
      phase: 'move',
      x: beforeRect!.x + beforeRect!.width / 2 + 48,
      y: beforeRect!.y + beforeRect!.height / 2 + 32,
      pick: {
        kind: 'node',
        id: 'shape-1',
        part: 'body'
      }
    }))
    editor.input.pointerUp(createPointerInput({
      phase: 'up',
      x: beforeRect!.x + beforeRect!.width / 2 + 48,
      y: beforeRect!.y + beforeRect!.height / 2 + 32,
      pick: {
        kind: 'node',
        id: 'shape-1',
        part: 'body'
      }
    }))

    expect(editor.document.snapshot().nodes['shape-1']?.position).toEqual({
      x: 128,
      y: 152
    })
    expect(editor.scene.read.scene.nodes.get('shape-1')?.geometry.rect).toMatchObject({
      x: 128,
      y: 152
    })

    const toolbar = editor.derived.editor.selection.toolbar.get()
    expect(toolbar?.defaultScopeKey).toBe('nodes')
    const scope = toolbar?.scopes.find((entry) => entry.key === toolbar.defaultScopeKey)
    expect(scope?.node?.nodeIds).toEqual(['shape-1'])

    editor.write.node.style.fill(scope!.node!.nodeIds, '#22c55e')
    editor.write.node.style.stroke(scope!.node!.nodeIds, '#ef4444')
    editor.write.node.style.strokeWidth(scope!.node!.nodeIds, 3)

    expect(editor.document.snapshot().nodes['shape-1']?.style).toMatchObject({
      fill: '#22c55e',
      stroke: '#ef4444',
      strokeWidth: 3
    })
    expect(editor.scene.read.scene.nodes.get('shape-1')?.base.node.style).toMatchObject({
      fill: '#22c55e',
      stroke: '#ef4444',
      strokeWidth: 3
    })
  })

  it('keeps root drag working for a selected mindmap-owned topic', () => {
    const editor = createMindmapEditor()

    editor.write.selection.replace({
      nodeIds: ['root-1']
    })

    const beforeRect = editor.scene.read.scene.nodes.get('root-1')?.geometry.rect
    expect(beforeRect).toBeDefined()

    editor.input.pointerDown(createPointerInput({
      phase: 'down',
      x: beforeRect!.x + beforeRect!.width / 2,
      y: beforeRect!.y + beforeRect!.height / 2,
      pick: {
        kind: 'node',
        id: 'root-1',
        part: 'body'
      }
    }))
    editor.input.pointerMove(createPointerInput({
      phase: 'move',
      x: beforeRect!.x + beforeRect!.width / 2 + 48,
      y: beforeRect!.y + beforeRect!.height / 2 + 32,
      pick: {
        kind: 'node',
        id: 'root-1',
        part: 'body'
      }
    }))
    editor.input.pointerUp(createPointerInput({
      phase: 'up',
      x: beforeRect!.x + beforeRect!.width / 2 + 48,
      y: beforeRect!.y + beforeRect!.height / 2 + 32,
      pick: {
        kind: 'node',
        id: 'root-1',
        part: 'body'
      }
    }))

    expect(editor.document.snapshot().nodes['root-1']?.position).toEqual({
      x: 248,
      y: 212
    })
    expect(editor.scene.read.scene.nodes.get('root-1')?.geometry.rect).toMatchObject({
      x: 248,
      y: 212
    })
  })

  it('keeps mindmap topic style writes working for a selected root topic', () => {
    const editor = createMindmapEditor()

    editor.write.selection.replace({
      nodeIds: ['root-1']
    })

    const toolbar = editor.derived.editor.selection.toolbar.get()
    expect(toolbar?.defaultScopeKey).toBe('nodes')
    const scope = toolbar?.scopes.find((entry) => entry.key === toolbar.defaultScopeKey)
    expect(scope?.node?.nodeIds).toEqual(['root-1'])

    const result = editor.write.mindmap.style.topic({
      nodeIds: scope!.node!.nodeIds,
      patch: {
        frameKind: 'underline',
        stroke: '#ef4444',
        strokeWidth: 3,
        fill: '#22c55e'
      }
    })

    expect(result?.ok).toBe(true)

    expect(editor.document.snapshot().nodes['root-1']?.style).toMatchObject({
      frameKind: 'underline',
      stroke: '#ef4444',
      strokeWidth: 3,
      fill: '#22c55e'
    })
    expect(editor.scene.read.scene.nodes.get('root-1')?.base.node.style).toMatchObject({
      frameKind: 'underline',
      stroke: '#ef4444',
      strokeWidth: 3,
      fill: '#22c55e'
    })
  })

  it('updates node hovered from idle pointer hover and clears it on leave', () => {
    const editor = createShapeEditor()
    const view = editor.scene.read.scene.nodes.get('shape-1')

    expect(editor.scene.stores.graph.state.node.byId.get('shape-1')?.hovered).toBe(false)

    editor.input.pointerMove(createPointerInput({
      phase: 'move',
      x: view!.geometry.rect.x + view!.geometry.rect.width / 2,
      y: view!.geometry.rect.y + view!.geometry.rect.height / 2,
      pick: {
        kind: 'node',
        id: 'shape-1',
        part: 'body'
      },
      buttons: 0
    }))

    expect(editor.scene.stores.graph.state.node.byId.get('shape-1')?.hovered).toBe(true)

    editor.input.pointerLeave()

    expect(editor.scene.stores.graph.state.node.byId.get('shape-1')?.hovered).toBe(false)
  })
})
