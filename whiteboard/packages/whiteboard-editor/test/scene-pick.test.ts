import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
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

  return editorApi.create({
    engine,
    history: historyApi.local.create(engine),
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
  })
}

describe('scene pick', () => {
  it('resolves edge targets from rect candidates and precise hit', () => {
    const editor = createPickEditor()
    const geometry = editor.scene.edges.geometry.get('edge-1')

    expect(geometry).toBeDefined()
    if (!geometry) {
      return
    }

    const point = geometry.path.points[
      Math.floor(geometry.path.points.length / 2)
    ]!
    const candidates = editor.scene.pick.candidates({
      point,
      radius: 16,
      kinds: ['edge']
    })
    const resolved = editor.scene.pick.resolve({
      point,
      radius: 16,
      kinds: ['edge']
    })

    expect(candidates.records.map((record) => record.key)).toContain('edge:edge-1')
    expect(candidates.stats.candidates).toBeGreaterThan(0)
    expect(resolved.target).toEqual({
      kind: 'edge',
      id: 'edge-1'
    })
    expect(resolved.stats.hits).toBeGreaterThan(0)
    expect(resolved.stats.candidates).toBeGreaterThan(0)
  })
})
