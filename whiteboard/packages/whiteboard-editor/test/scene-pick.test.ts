import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { createHistoryPort } from '@shared/mutation'
import { editor as editorApi } from '../src'
import type { NodeRegistry } from '../src'

const registry: NodeRegistry = {
  get: (type) => type === 'shape'
    ? {
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
    : undefined
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

  return document
}

const createPickEditor = () => {
  const engine = engineApi.create({
    document: createPickDocument()
  })

  return trackEditor(editorApi.create({
    engine,
    history: createHistoryPort(engine),
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
    registry
  }))
}

describe('scene pick', () => {
  it('resolves edge targets from rect candidates and precise hit', () => {
    const editor = createPickEditor()
    const geometry = editor.scene.query.edge.get('edge-1')

    expect(geometry).toBeDefined()
    if (!geometry) {
      return
    }

    const point = geometry.route.points[
      Math.floor(geometry.route.points.length / 2)
    ]!
    const rect = {
      x: point.x - 16,
      y: point.y - 16,
      width: 32,
      height: 32
    }
    const candidates = editor.scene.query.spatial.candidates(rect, {
      kinds: ['edge']
    })
    const resolved = editor.scene.query.hit.item({
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
})
