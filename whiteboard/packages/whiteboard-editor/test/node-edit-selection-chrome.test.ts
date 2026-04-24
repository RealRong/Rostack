import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
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

    if (type === 'shape') {
      return {
        type: 'shape',
        meta: {
          name: 'Shape',
          family: 'shape',
          icon: 'shape',
          controls: ['fill', 'stroke', 'text']
        },
        role: 'content',
        connect: true,
        resize: true,
        rotate: true
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

const createTextEditor = () => {
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
    document
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

const createShapeEditor = () => {
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
    document
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
  const document = documentApi.create('doc_mindmap_root_edit_selection_chrome')
  document.nodes['mind-1'] = {
    id: 'mind-1',
    type: 'mindmap',
    position: { x: 200, y: 180 },
    data: {
      rootNodeId: 'root-1',
      nodes: {
        'root-1': {
          branch: {
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
  }
  document.nodes['root-1'] = {
    id: 'root-1',
    type: 'text',
    mindmapId: 'mind-1',
    position: { x: 200, y: 180 },
    size: { width: 132, height: 32 },
    data: {
      text: 'Central topic'
    }
  }
  document.canvas.order = [{
    kind: 'node',
    id: 'mind-1'
  }]

  const engine = engineApi.create({
    document
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

const createEdgeEditor = () => {
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
    document
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

describe('node edit selection chrome', () => {
  it('keeps toolbar and overlay visible while editing a selected text node', () => {
    const editor = createTextEditor()

    editor.actions.selection.replace({
      nodeIds: ['text-1']
    })
    editor.actions.edit.startNode('text-1', 'text')

    expect(editor.read.panel.get().selectionToolbar).toMatchObject({
      selectionKind: 'nodes',
      target: {
        nodeIds: ['text-1'],
        edgeIds: []
      }
    })
    expect(editor.read.chrome.get().selection).toMatchObject({
      kind: 'node',
      nodeId: 'text-1',
      handles: false
    })
  })

  it('keeps toolbar and overlay visible while editing a selected mindmap-owned root topic', () => {
    const editor = createMindmapEditor()

    editor.actions.selection.replace({
      nodeIds: ['root-1']
    })
    editor.actions.edit.startNode('root-1', 'text')

    expect(editor.read.panel.get().selectionToolbar).toMatchObject({
      selectionKind: 'nodes',
      target: {
        nodeIds: ['root-1'],
        edgeIds: []
      }
    })
    expect(editor.read.chrome.get().selection).toMatchObject({
      kind: 'node',
      nodeId: 'root-1',
      handles: false
    })
  })

  it('continues hiding the selection toolbar while editing an edge label', () => {
    const editor = createEdgeEditor()

    editor.actions.selection.replace({
      edgeIds: ['edge-1']
    })
    editor.actions.edit.startEdgeLabel('edge-1', 'label-1')

    expect(editor.read.panel.get().selectionToolbar).toBeUndefined()
  })

  it('keeps node drag and toolbar style writes working for a selected shape', () => {
    const editor = createShapeEditor()

    editor.actions.selection.replace({
      nodeIds: ['shape-1']
    })

    const beforeRect = editor.read.node.view.get('shape-1')?.rect
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

    expect(editor.read.document.get().nodes['shape-1']?.position).toEqual({
      x: 128,
      y: 152
    })
    expect(editor.read.node.view.get('shape-1')?.rect).toMatchObject({
      x: 128,
      y: 152
    })

    const toolbar = editor.read.panel.get().selectionToolbar
    expect(toolbar?.defaultScopeKey).toBe('nodes')
    const scope = toolbar?.scopes.find((entry) => entry.key === toolbar.defaultScopeKey)
    expect(scope?.node?.nodeIds).toEqual(['shape-1'])

    editor.actions.node.style.fill(scope!.node!.nodeIds, '#22c55e')
    editor.actions.node.style.stroke(scope!.node!.nodeIds, '#ef4444')
    editor.actions.node.style.strokeWidth(scope!.node!.nodeIds, 3)

    expect(editor.read.document.get().nodes['shape-1']?.style).toMatchObject({
      fill: '#22c55e',
      stroke: '#ef4444',
      strokeWidth: 3
    })
    expect(editor.read.node.view.get('shape-1')?.node.style).toMatchObject({
      fill: '#22c55e',
      stroke: '#ef4444',
      strokeWidth: 3
    })
  })

  it('keeps root drag working for a selected mindmap-owned topic', () => {
    const editor = createMindmapEditor()

    editor.actions.selection.replace({
      nodeIds: ['root-1']
    })

    const beforeRect = editor.read.node.view.get('root-1')?.rect
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

    expect(editor.read.document.get().nodes['root-1']?.position).toEqual({
      x: 248,
      y: 212
    })
    expect(editor.read.node.view.get('root-1')?.rect).toMatchObject({
      x: 248,
      y: 212
    })
  })

  it('keeps mindmap topic style writes working for a selected root topic', () => {
    const editor = createMindmapEditor()

    editor.actions.selection.replace({
      nodeIds: ['root-1']
    })

    const toolbar = editor.read.panel.get().selectionToolbar
    expect(toolbar?.defaultScopeKey).toBe('nodes')
    const scope = toolbar?.scopes.find((entry) => entry.key === toolbar.defaultScopeKey)
    expect(scope?.node?.nodeIds).toEqual(['root-1'])

    const result = editor.actions.mindmap.style.topic({
      nodeIds: scope!.node!.nodeIds,
      patch: {
        frameKind: 'underline',
        stroke: '#ef4444',
        strokeWidth: 3,
        fill: '#22c55e'
      }
    })

    expect(result?.ok).toBe(true)

    expect(editor.read.document.get().nodes['root-1']?.style).toMatchObject({
      frameKind: 'underline',
      stroke: '#ef4444',
      strokeWidth: 3,
      fill: '#22c55e'
    })
    expect(editor.read.node.view.get('root-1')?.node.style).toMatchObject({
      frameKind: 'underline',
      stroke: '#ef4444',
      strokeWidth: 3,
      fill: '#22c55e'
    })
  })

  it('updates node hovered from idle pointer hover and clears it on leave', () => {
    const editor = createShapeEditor()
    const view = editor.read.node.view.get('shape-1')

    expect(view?.hovered).toBe(false)

    editor.input.pointerMove(createPointerInput({
      phase: 'move',
      x: view!.rect.x + view!.rect.width / 2,
      y: view!.rect.y + view!.rect.height / 2,
      pick: {
        kind: 'node',
        id: 'shape-1',
        part: 'body'
      },
      buttons: 0
    }))

    expect(editor.read.node.view.get('shape-1')?.hovered).toBe(true)

    editor.input.pointerLeave()

    expect(editor.read.node.view.get('shape-1')?.hovered).toBe(false)
  })
})
