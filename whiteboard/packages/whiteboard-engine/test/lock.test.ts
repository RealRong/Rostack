import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createTestLayout } from './support'

const createTextNode = ({
  id,
  x,
  y,
  locked = false
}: {
  id: string
  x: number
  y: number
  locked?: boolean
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
  locked,
  data: {
    text: id
  }
})

const createEdge = ({
  id,
  sourceId,
  targetId,
  locked = false
}: {
  id: string
  sourceId: string
  targetId: string
  locked?: boolean
}) => ({
  id,
  type: 'straight' as const,
  locked,
  source: {
    kind: 'node' as const,
    nodeId: sourceId
  },
  target: {
    kind: 'node' as const,
    nodeId: targetId
  },
  route: {
    kind: 'auto' as const
  }
})

const createLockedDocument = () => {
  const document = documentApi.create('doc_lock')
  const lockedNode = createTextNode({
    id: 'node_locked',
    x: 0,
    y: 0,
    locked: true
  })
  const freeNode = createTextNode({
    id: 'node_free',
    x: 240,
    y: 0
  })
  const edge = createEdge({
    id: 'edge_1',
    sourceId: lockedNode.id,
    targetId: freeNode.id
  })

  document.nodes[lockedNode.id] = lockedNode
  document.nodes[freeNode.id] = freeNode
  document.edges[edge.id] = edge
  document.canvas.order = [
    {
      kind: 'node',
      id: lockedNode.id
    },
    {
      kind: 'node',
      id: freeNode.id
    },
    {
      kind: 'edge',
      id: edge.id
    }
  ]

  return document
}

const createEdgeLockedDocument = () => {
  const document = documentApi.create('doc_edge_lock')
  const firstNode = createTextNode({
    id: 'node_1',
    x: 0,
    y: 0
  })
  const secondNode = createTextNode({
    id: 'node_2',
    x: 240,
    y: 0
  })
  const edge = createEdge({
    id: 'edge_locked',
    sourceId: firstNode.id,
    targetId: secondNode.id,
    locked: true
  })

  document.nodes[firstNode.id] = firstNode
  document.nodes[secondNode.id] = secondNode
  document.edges[edge.id] = edge
  document.canvas.order = [
    {
      kind: 'node',
      id: firstNode.id
    },
    {
      kind: 'node',
      id: secondNode.id
    },
    {
      kind: 'edge',
      id: edge.id
    }
  ]

  return document
}

test('engine blocks moving a locked node', () => {
  const engine = createEngine({
    document: createLockedDocument(),
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'node.move',
    ids: ['node_locked'],
    delta: {
      x: 40,
      y: 0
    }
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    return
  }
  assert.equal(result.error.code, 'cancelled')
  assert.equal(result.error.message, 'Locked nodes cannot be modified.')
})

test('engine blocks duplicating a locked node selection', () => {
  const engine = createEngine({
    document: createLockedDocument(),
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'canvas.duplicate',
    refs: [{
      kind: 'node',
      id: 'node_locked'
    }]
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    return
  }
  assert.equal(result.error.code, 'cancelled')
  assert.equal(result.error.message, 'Locked nodes cannot be duplicated.')
})

test('engine blocks duplicating an edge attached to a locked node', () => {
  const engine = createEngine({
    document: createLockedDocument(),
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'canvas.duplicate',
    refs: [{
      kind: 'edge',
      id: 'edge_1'
    }]
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    return
  }
  assert.equal(result.error.code, 'cancelled')
  assert.equal(result.error.message, 'Locked node relations cannot be duplicated.')
})

test('engine blocks remote edge deletion that would change a locked node relation', () => {
  const engine = createEngine({
    document: createLockedDocument(),
    layout: createTestLayout()
  })

  const result = engine.apply([{
    type: 'edge.delete',
    id: 'edge_1'
  }], {
    origin: 'remote'
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    return
  }
  assert.equal(result.error.code, 'cancelled')
  assert.equal(result.error.message, 'Locked node relations cannot be modified.')
})

test('engine allows remote unlock then delete in the same operation batch', () => {
  const engine = createEngine({
    document: createLockedDocument(),
    layout: createTestLayout()
  })

  const result = engine.apply([
    {
      type: 'node.patch',
      id: 'node_locked',
      patch: {
        locked: false
      }
    },
    {
      type: 'node.delete',
      id: 'node_locked'
    }
  ], {
    origin: 'remote'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }
  assert.equal(result.commit.document.nodes.node_locked, undefined)
})

test('engine blocks modifying a locked edge', () => {
  const engine = createEngine({
    document: createEdgeLockedDocument(),
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'edge.update',
    updates: [{
      id: 'edge_locked',
      input: {
        fields: {
          textMode: 'tangent'
        }
      }
    }]
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    return
  }
  assert.equal(result.error.code, 'cancelled')
  assert.equal(result.error.message, 'Locked edges cannot be modified.')
})

test('engine allows remote unlock then edge update in the same batch', () => {
  const engine = createEngine({
    document: createEdgeLockedDocument(),
    layout: createTestLayout()
  })

  const result = engine.apply([
    {
      type: 'edge.patch',
      id: 'edge_locked',
      patch: {
        locked: false
      }
    },
    {
      type: 'edge.patch',
      id: 'edge_locked',
      patch: {
        textMode: 'tangent'
      }
    }
  ], {
    origin: 'remote'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }
  assert.equal(result.commit.document.edges.edge_locked?.locked, false)
  assert.equal(result.commit.document.edges.edge_locked?.textMode, 'tangent')
})
