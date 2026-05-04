import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { editor as editorApi } from '../src'
import type { NodeSpec } from '../src'
import { createEditorTestLayout } from './support'

const nodes: NodeSpec = {
  frame: {
    meta: {
      type: 'frame',
      name: 'Frame',
      family: 'frame',
      icon: 'frame',
      controls: []
    },
    behavior: {
      role: 'frame',
      connect: false,
      resize: true,
      rotate: false
    }
  },
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

const createPickDocument = () => {
  const document = documentApi.create('doc_scene_pick_runtime')
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
    }
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
    }
  ]

  return document
}

const createVisibilityDocument = () => {
  const document = documentApi.create('doc_scene_pick_visibility')
  document.nodes['node-1'] = {
    id: 'node-1',
    type: 'shape',
    position: {
      x: 0,
      y: 40
    },
    size: {
      width: 80,
      height: 80
    }
  }
  document.nodes['node-2'] = {
    id: 'node-2',
    type: 'shape',
    position: {
      x: 280,
      y: 40
    },
    size: {
      width: 80,
      height: 80
    }
  }
  document.nodes.frame = {
    id: 'frame',
    type: 'frame',
    position: {
      x: 90,
      y: 20
    },
    size: {
      width: 180,
      height: 120
    }
  }
  document.nodes.child = {
    id: 'child',
    type: 'shape',
    position: {
      x: 140,
      y: 55
    },
    size: {
      width: 60,
      height: 50
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
    }
  }
  document.order = [
    {
      kind: 'edge',
      id: 'edge-1'
    },
    {
      kind: 'node',
      id: 'frame'
    },
    {
      kind: 'node',
      id: 'child'
    },
    {
      kind: 'node',
      id: 'node-1'
    },
    {
      kind: 'node',
      id: 'node-2'
    }
  ]

  return document
}

const createPickEditor = (document = createPickDocument()) => {
  const layoutService = createEditorTestLayout()
  const engine = engineApi.create({
    document,
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

describe('scene pick', () => {
  it('resolves edge targets from rect candidates and precise hit', () => {
    const editor = createPickEditor()
    const geometry = editor.scene.edges.get('edge-1')

    expect(geometry).toBeDefined()
    if (!geometry) {
      return
    }

    const start = geometry.route.points[0]!
    const end = geometry.route.points[geometry.route.points.length - 1]!
    const point = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    }
    const rect = {
      x: point.x - 16,
      y: point.y - 16,
      width: 32,
      height: 32
    }
    const candidates = editor.scene.spatial.candidates(rect, {
      kinds: ['edge']
    })
    const resolved = editor.scene.hit.item({
      point,
      threshold: 16,
      kinds: ['edge']
    })

    expect(candidates.records.map((record) => record.key)).toContain('edge:edge-1')
    expect(candidates.stats.candidates).toBeGreaterThan(0)
    expect(resolved).toEqual({
      kind: 'edge',
      id: 'edge-1'
    })
  })

  it('updates node hit targets after moving a node', () => {
    const editor = createPickEditor()

    expect(editor.scene.hit.item({
      point: { x: 60, y: 40 },
      threshold: 8,
      kinds: ['node']
    })).toEqual({
      kind: 'node',
      id: 'node-1'
    })

    const result = editor.write.canvas.selection.move({
      nodeIds: ['node-1'],
      edgeIds: [],
      delta: {
        x: 400,
        y: 0
      }
    })

    expect(result.ok).toBe(true)
    expect(editor.document.node('node-1')?.position).toEqual({
      x: 400,
      y: 0
    })
    expect(editor.scene.stores.render.node.byId.get('node-1')?.rect).toMatchObject({
      x: 400,
      y: 0
    })

    expect(editor.scene.hit.item({
      point: { x: 60, y: 40 },
      threshold: 8,
      kinds: ['node']
    })).toBeUndefined()

    expect(editor.scene.hit.item({
      point: { x: 460, y: 40 },
      threshold: 8,
      kinds: ['node']
    })).toEqual({
      kind: 'node',
      id: 'node-1'
    })
  })

  it('reuses topmost visibility for hit and marquee filtering', () => {
    const editor = createPickEditor(createVisibilityDocument())
    const frameRect = editor.scene.nodes.get('frame')?.geometry.rect

    expect(editor.scene.hit.item({
      point: {
        x: 110,
        y: 80
      },
      threshold: 16,
      kinds: ['node', 'edge']
    })).toEqual({
      kind: 'node',
      id: 'frame'
    })

    expect(editor.scene.hit.edge({
      point: {
        x: 110,
        y: 80
      },
      threshold: 16
    })).toBeUndefined()

    expect(editor.scene.hit.item({
      point: {
        x: 170,
        y: 80
      },
      threshold: 16,
      kinds: ['node', 'edge']
    })).toEqual({
      kind: 'node',
      id: 'child'
    })

    expect(frameRect).toBeDefined()
    if (!frameRect) {
      return
    }

    expect(editor.scene.edges.idsInRect(frameRect, {
      match: 'touch'
    })).not.toContain('edge-1')
  })
})
