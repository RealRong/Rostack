import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { editor as editorApi } from '../src'
import type { NodeSpec } from '../src'
import { createEditorTestLayout } from './support'

const nodes: NodeSpec = {
  shape: {
    meta: {
      type: 'shape',
      name: 'Shape',
      family: 'shape',
      icon: 'shape',
      controls: []
    },
    behavior: {
      role: 'content',
      connect: true,
      resize: true,
      rotate: true
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

const createEdgeDocument = () => {
  const document = documentApi.create('doc_edge_selected_chrome')
  document.nodes['node-1'] = {
    id: 'node-1',
    type: 'shape',
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 120,
      height: 80
    }
  }
  document.nodes['node-2'] = {
    id: 'node-2',
    type: 'shape',
    position: {
      x: 240,
      y: 120
    },
    size: {
      width: 120,
      height: 80
    }
  }
  document.nodes['node-3'] = {
    id: 'node-3',
    type: 'shape',
    position: {
      x: 40,
      y: 260
    },
    size: {
      width: 120,
      height: 80
    }
  }
  document.nodes['node-4'] = {
    id: 'node-4',
    type: 'shape',
    position: {
      x: 320,
      y: 360
    },
    size: {
      width: 120,
      height: 80
    }
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
      text: 'First'
    }]
  }
  document.edges['edge-2'] = {
    id: 'edge-2',
    type: 'straight',
    source: {
      kind: 'node',
      nodeId: 'node-3'
    },
    target: {
      kind: 'node',
      nodeId: 'node-4'
    },
    labels: [{
      id: 'label-2',
      text: 'Second'
    }]
  }
  document.order = [
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
    },
    {
      kind: 'node',
      id: 'node-3'
    },
    {
      kind: 'node',
      id: 'node-4'
    },
    {
      kind: 'edge',
      id: 'edge-2'
    }
  ]
  return document
}

const createEdgeEditor = () => {
  const layoutService = createEditorTestLayout()
  const engine = engineApi.create({
    document: createEdgeDocument(),
    layout: layoutService
  })

  return trackEditor(editorApi.create({
    engine,
    history: engine.history,
    initialTool: {
      type: 'select'
    },
    initialViewport: {
      center: {
        x: 0,
        y: 0
      },
      zoom: 1
    },
    nodes,
    services: {
      layout: layoutService
    }
  }))
}

describe('edge.selectedChrome', () => {
  it('shows edit handles for a selected edge outside label editing', async () => {
    const editor = createEdgeEditor()

    editor.actions.session.selection.replace({
      edgeIds: ['edge-1']
    })

    expect(editor.scene.ui.selection.edge.chrome.get()).toMatchObject({
      edgeId: 'edge-1',
      canReconnectSource: true,
      canReconnectTarget: true,
      canEditRoute: true,
      showEditHandles: true
    })
  })

  it('hides edit handles when editing the selected edge label', async () => {
    const editor = createEdgeEditor()

    editor.actions.session.selection.replace({
      edgeIds: ['edge-1']
    })
    editor.actions.session.edit.startEdgeLabel('edge-1', 'label-1')

    expect(editor.scene.ui.selection.edge.chrome.get()).toMatchObject({
      edgeId: 'edge-1',
      showEditHandles: false
    })
  })

  it('keeps edit handles visible when another edge is being edited', async () => {
    const editor = createEdgeEditor()

    editor.actions.session.selection.replace({
      edgeIds: ['edge-1']
    })
    editor.actions.session.edit.startEdgeLabel('edge-2', 'label-2')

    expect(editor.scene.ui.selection.edge.chrome.get()).toMatchObject({
      edgeId: 'edge-1',
      showEditHandles: true
    })
  })
})
