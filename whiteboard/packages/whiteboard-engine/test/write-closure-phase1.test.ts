import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createTestLayout } from './support'

const createTextNode = ({
  id,
  x,
  y
}: {
  id: string
  x: number
  y: number
}) => ({
  id,
  type: 'text' as const,
  position: {
    x,
    y
  },
  size: {
    width: 120,
    height: 40
  },
  data: {
    text: id
  }
})

const createManualEdge = ({
  id,
  source,
  target,
  points
}: {
  id: string
  source: import('@whiteboard/core/types').Edge['source']
  target: import('@whiteboard/core/types').Edge['target']
  points: readonly {
    id: string
    x: number
    y: number
  }[]
}) => ({
  id,
  type: 'straight' as const,
  source,
  target,
  points: entityTable.normalize.list(points)
})

test('canvas.selection.move compiles node, selected edge, and follow edge movement in one command', () => {
  const document = documentApi.create('doc_write_closure_selection_move')
  document.nodes.node_1 = createTextNode({
    id: 'node_1',
    x: 0,
    y: 0
  })
  document.nodes.node_2 = createTextNode({
    id: 'node_2',
    x: 200,
    y: 0
  })
  document.edges.edge_follow = createManualEdge({
    id: 'edge_follow',
    source: {
      kind: 'node',
      nodeId: 'node_1'
    },
    target: {
      kind: 'node',
      nodeId: 'node_2'
    },
    points: [{
      id: 'follow_point_1',
      x: 100,
      y: 20
    }]
  })
  document.edges.edge_selected = createManualEdge({
    id: 'edge_selected',
    source: {
      kind: 'point',
      point: { x: 40, y: 40 }
    },
    target: {
      kind: 'point',
      point: { x: 100, y: 60 }
    },
    points: [{
      id: 'selected_point_1',
      x: 70,
      y: 50
    }]
  })
  document.order = [
    { kind: 'node', id: 'node_1' },
    { kind: 'node', id: 'node_2' },
    { kind: 'edge', id: 'edge_follow' },
    { kind: 'edge', id: 'edge_selected' }
  ]

  const engine = createEngine({
    document,
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'canvas.selection.move',
    nodeIds: ['node_1', 'node_2'],
    edgeIds: ['edge_selected'],
    delta: {
      x: 30,
      y: 10
    }
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.commit.document.nodes.node_1?.position, { x: 30, y: 10 })
  assert.deepEqual(result.commit.document.nodes.node_2?.position, { x: 230, y: 10 })
  assert.deepEqual(entityTable.read.list(result.commit.document.edges.edge_follow?.points ?? {
      ids: [],
      byId: {}
    }), [{
      id: 'follow_point_1',
      x: 130,
      y: 30
    }])
  assert.deepEqual(result.commit.document.edges.edge_selected?.source, {
    kind: 'point',
    point: { x: 70, y: 50 }
  })
  assert.deepEqual(result.commit.document.edges.edge_selected?.target, {
    kind: 'point',
    point: { x: 130, y: 70 }
  })
  assert.deepEqual(entityTable.read.list(result.commit.document.edges.edge_selected?.points ?? {
      ids: [],
      byId: {}
    }), [{
      id: 'selected_point_1',
      x: 100,
      y: 60
    }])
})

test('edge.reconnect.commit applies endpoint, type, and points in one command', () => {
  const document = documentApi.create('doc_write_closure_reconnect_commit')
  document.nodes.node_1 = createTextNode({
    id: 'node_1',
    x: 0,
    y: 0
  })
  document.nodes.node_2 = createTextNode({
    id: 'node_2',
    x: 200,
    y: 0
  })
  document.edges.edge_1 = createManualEdge({
    id: 'edge_1',
    source: {
      kind: 'node',
      nodeId: 'node_1'
    },
    target: {
      kind: 'node',
      nodeId: 'node_2'
    },
    points: [{
      id: 'route_point_1',
      x: 100,
      y: 30
    }]
  })
  document.edges.edge_1.type = 'curve'
  document.order = [
    { kind: 'node', id: 'node_1' },
    { kind: 'node', id: 'node_2' },
    { kind: 'edge', id: 'edge_1' }
  ]

  const engine = createEngine({
    document,
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'edge.reconnect.commit',
    edgeId: 'edge_1',
    end: 'target',
    target: {
      kind: 'point',
      point: { x: 260, y: 80 }
    },
    patch: {
      type: 'straight',
      points: undefined
    }
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.commit.document.edges.edge_1?.target, {
    kind: 'point',
    point: { x: 260, y: 80 }
  })
  assert.equal(result.commit.document.edges.edge_1?.type, 'straight')
  assert.equal(result.commit.document.edges.edge_1?.points, undefined)
  assert.deepEqual(
    result.commit.writes.map((write) => write.kind),
    [
      'field.set',
      'field.set',
      'field.set'
    ]
  )
})
