import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'

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
  targetId
}: {
  id: string
  sourceId: string
  targetId: string
}) => ({
  id,
  type: 'straight' as const,
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
  const document = createDocument('doc_lock')
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
  document.order = [
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

test('engine blocks moving a locked node', () => {
  const engine = createEngine({
    document: createLockedDocument()
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
    document: createLockedDocument()
  })

  const result = engine.execute({
    type: 'document.duplicate',
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
    document: createLockedDocument()
  })

  const result = engine.execute({
    type: 'document.duplicate',
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
    document: createLockedDocument()
  })

  const result = engine.applyOperations([{
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
    document: createLockedDocument()
  })

  const result = engine.applyOperations([
    {
      type: 'node.update',
      id: 'node_locked',
      update: {
        fields: {
          locked: false
        }
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
  assert.equal(result.commit.doc.nodes.node_locked, undefined)
})
