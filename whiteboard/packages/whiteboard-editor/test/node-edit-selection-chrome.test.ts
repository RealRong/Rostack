import { describe, expect, it } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createEditor } from '../src'
import type { NodeRegistry } from '../src'

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
          controls: []
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
  const document = createDocument('doc_node_edit_selection_chrome')
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

  return createEditor({
    engine: createEngine({
      document
    }),
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

const createMindmapEditor = () => {
  const document = createDocument('doc_mindmap_root_edit_selection_chrome')
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

  return createEditor({
    engine: createEngine({
      document
    }),
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
  const document = createDocument('doc_edge_label_toolbar_hidden')
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

  return createEditor({
    engine: createEngine({
      document
    }),
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
})
