import { describe, expect, it, vi } from 'vitest'
import { store } from '@shared/core'
import type {
  EdgeView as RuntimeEdgeView,
  NodeView as RuntimeNodeView,
  Read as EditorGraphQuery
} from '@whiteboard/editor-scene'
import type {
  Edge,
  EdgeId,
  NodeId,
  NodeModel,
  Rect
} from '@whiteboard/core/types'
import { createGraphEdgeRead } from '../src/scene/edge'
import { createGraphNodeRead } from '../src/scene/node'

const createKeyedReadStore = <K extends string, TValue>(
  entries: ReadonlyMap<K, TValue>
): store.KeyedReadStore<K, TValue | undefined> => store.createKeyedReadStore({
  get: (key) => entries.get(key),
  subscribe: () => () => {}
})

const createNodeModel = (
  nodeId: NodeId
): NodeModel => ({
  id: nodeId,
  type: 'text',
  position: {
    x: 0,
    y: 0
  },
  size: {
    width: 0,
    height: 0
  },
  data: {
    text: nodeId
  }
}) as NodeModel

const createNodeView = (
  nodeId: NodeId,
  rect: Rect
): RuntimeNodeView => ({
  base: {
    node: createNodeModel(nodeId)
  },
  geometry: {
    rotation: 0,
    rect,
    bounds: rect
  }
})

const createEdge = (input: {
  edgeId: EdgeId
  sourceId: NodeId
  targetId: NodeId
}): Edge => ({
  id: input.edgeId,
  type: 'straight',
  source: {
    kind: 'node',
    nodeId: input.sourceId
  },
  target: {
    kind: 'node',
    nodeId: input.targetId
  },
  route: {
    kind: 'auto'
  }
}) as Edge

const createEdgeView = (input: {
  edgeId: EdgeId
  sourceId: NodeId
  targetId: NodeId
  bounds: Rect
}): RuntimeEdgeView => ({
  base: {
    edge: createEdge(input),
    nodes: {} as never
  },
  route: {
    points: [],
    bounds: input.bounds,
    handles: [],
    labels: []
  }
})

const createSpatialRead = (
  rectRecords: ReturnType<EditorGraphQuery['spatial']['rect']>
): EditorGraphQuery['spatial'] => ({
  get: vi.fn(() => undefined),
  all: vi.fn(() => rectRecords),
  rect: vi.fn(() => rectRecords),
  point: vi.fn(() => [])
})

const NODE_TYPE_SUPPORT = {
  capability: () => ({
    role: 'content' as const,
    connect: true,
    enter: true,
    resize: true,
    rotate: true
  })
}

describe('spatial-backed graph read queries', () => {
  it('uses spatial node candidates for idsInRect instead of scanning document node list', () => {
    const queryRect: Rect = {
      x: 0,
      y: 0,
      width: 160,
      height: 120
    }
    const spatialNodeId = 'node-from-spatial'
    const spatial = createSpatialRead([
      {
        key: `node:${spatialNodeId}`,
        kind: 'node',
        item: {
          kind: 'node',
          id: spatialNodeId
        },
        bounds: {
          x: 16,
          y: 24,
          width: 120,
          height: 48
        },
        order: 0
      }
    ])
    const read = createGraphNodeRead({
      document: {
        node: {
          list: store.createValueStore<NodeId[]>(['node-only-in-document-list']),
          committed: createKeyedReadStore<NodeId, undefined>(new Map())
        }
      },
      sources: {
        nodeGraph: createKeyedReadStore<NodeId, RuntimeNodeView>(new Map([
          [
            spatialNodeId,
            createNodeView(spatialNodeId, {
              x: 16,
              y: 24,
              width: 120,
              height: 48
            })
          ]
        ])),
        nodeUi: createKeyedReadStore<NodeId, undefined>(new Map())
      },
      spatial,
      type: NODE_TYPE_SUPPORT
    })

    expect(read.idsInRect(queryRect)).toEqual([spatialNodeId])
    expect(spatial.rect).toHaveBeenCalledWith(queryRect, {
      kinds: ['node']
    })
  })

  it('uses spatial edge candidates while preserving exact edge hit testing', () => {
    const sourceId = 'node-source'
    const targetId = 'node-target'
    const edgeId = 'edge-from-spatial'
    const spatial = createSpatialRead([
      {
        key: `edge:${edgeId}`,
        kind: 'edge',
        item: {
          kind: 'edge',
          id: edgeId
        },
        bounds: {
          x: 80,
          y: 0,
          width: 120,
          height: 80
        },
        order: 0
      }
    ])
    const nodeGraph = createKeyedReadStore<NodeId, RuntimeNodeView>(new Map([
      [
        sourceId,
        createNodeView(sourceId, {
          x: 0,
          y: 0,
          width: 80,
          height: 40
        })
      ],
      [
        targetId,
        createNodeView(targetId, {
          x: 200,
          y: 0,
          width: 80,
          height: 40
        })
      ]
    ]))
    const read = createGraphEdgeRead({
      document: {
        node: {
          committed: createKeyedReadStore<NodeId, undefined>(new Map())
        },
        edge: {
          list: store.createValueStore<EdgeId[]>(['edge-only-in-document-list']),
          item: createKeyedReadStore<EdgeId, undefined>(new Map()),
          related: () => []
        }
      },
      sources: {
        edgeGraph: createKeyedReadStore<EdgeId, RuntimeEdgeView>(new Map([
          [
            edgeId,
            createEdgeView({
              edgeId,
              sourceId,
              targetId,
              bounds: {
                x: 80,
                y: 0,
                width: 120,
                height: 80
              }
            })
          ]
        ])),
        edgeUi: createKeyedReadStore<EdgeId, undefined>(new Map())
      },
      spatial,
      node: {
        graph: nodeGraph,
        capability: () => ({
          role: 'content',
          connect: true,
          enter: true,
          resize: true,
          rotate: true
        })
      }
    })

    expect(read.idsInRect({
      x: 110,
      y: 10,
      width: 40,
      height: 20
    })).toEqual([edgeId])
    expect(read.idsInRect({
      x: 110,
      y: 80,
      width: 40,
      height: 20
    })).toEqual([])
  })

  it('uses spatial node candidates for edge connect candidates', () => {
    const connectableNodeId = 'node-connectable'
    const spatial = createSpatialRead([
      {
        key: `node:${connectableNodeId}`,
        kind: 'node',
        item: {
          kind: 'node',
          id: connectableNodeId
        },
        bounds: {
          x: 40,
          y: 40,
          width: 120,
          height: 60
        },
        order: 0
      }
    ])
    const nodeGraph = createKeyedReadStore<NodeId, RuntimeNodeView>(new Map([
      [
        connectableNodeId,
        createNodeView(connectableNodeId, {
          x: 40,
          y: 40,
          width: 120,
          height: 60
        })
      ]
    ]))
    const read = createGraphEdgeRead({
      document: {
        node: {
          committed: createKeyedReadStore<NodeId, undefined>(new Map())
        },
        edge: {
          list: store.createValueStore<EdgeId[]>([]),
          item: createKeyedReadStore<EdgeId, undefined>(new Map()),
          related: () => []
        }
      },
      sources: {
        edgeGraph: createKeyedReadStore<EdgeId, RuntimeEdgeView>(new Map()),
        edgeUi: createKeyedReadStore<EdgeId, undefined>(new Map())
      },
      spatial,
      node: {
        graph: nodeGraph,
        capability: () => ({
          role: 'content',
          connect: true,
          enter: true,
          resize: true,
          rotate: true
        })
      }
    })

    expect(read.connectCandidates({
      x: 0,
      y: 0,
      width: 240,
      height: 180
    }).map((candidate) => candidate.nodeId)).toEqual([connectableNodeId])
  })
})
