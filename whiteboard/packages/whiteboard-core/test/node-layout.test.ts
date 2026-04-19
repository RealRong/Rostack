import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import {
  buildNodeDistributeOperations,
  distributeNodes,
  getNodeBoundsByNode,
  type NodeLayoutEntry
} from '@whiteboard/core/node'
import type { Node, Size } from '@whiteboard/core/types'

const DEFAULT_SIZE: Size = {
  width: 100,
  height: 100
}

const createShapeNode = (
  id: string,
  overrides: Partial<Node> = {}
): Node => ({
  id,
  type: 'shape',
  position: {
    x: 0,
    y: 0
  },
  size: DEFAULT_SIZE,
  rotation: 0,
  data: {
    kind: 'rect',
    ...(overrides.data ?? {})
  },
  ...overrides
})

test('distributeNodes orders ties by geometry instead of selection order', () => {
  const entries: NodeLayoutEntry[] = [
    {
      id: 'first',
      position: { x: 0, y: 0 },
      bounds: { x: 0, y: 0, width: 40, height: 40 }
    },
    {
      id: 'lower',
      position: { x: 90, y: 100 },
      bounds: { x: 90, y: 100, width: 40, height: 40 }
    },
    {
      id: 'upper',
      position: { x: 90, y: 0 },
      bounds: { x: 90, y: 0, width: 40, height: 40 }
    },
    {
      id: 'last',
      position: { x: 300, y: 0 },
      bounds: { x: 300, y: 0, width: 40, height: 40 }
    }
  ]

  const updates = distributeNodes(entries, 'horizontal')
  const updateById = new Map(updates.map((update) => [update.id, update] as const))

  assert.equal(updateById.get('upper')?.position.x, 100)
  assert.equal(updateById.get('lower')?.position.x, 200)
})

test('buildNodeDistributeOperations uses visible bounds for rotated nodes', () => {
  const first = createShapeNode('first', {
    position: { x: 0, y: 0 },
    rotation: 45
  })
  const middle = createShapeNode('middle', {
    position: { x: 150, y: 0 }
  })
  const last = createShapeNode('last', {
    position: { x: 400, y: 0 }
  })

  const doc = createDocument('doc_1')
  doc.nodes[first.id] = first
  doc.nodes[middle.id] = middle
  doc.nodes[last.id] = last
  doc.order = [
    { kind: 'node', id: first.id },
    { kind: 'node', id: middle.id },
    { kind: 'node', id: last.id }
  ]

  const result = buildNodeDistributeOperations({
    ids: [first.id, middle.id, last.id],
    doc,
    nodeSize: DEFAULT_SIZE,
    mode: 'horizontal'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(result.data.operations.length, 1)
  const operation = result.data.operations[0]
  assert.equal(operation.type, 'node.patch')
  assert.equal(operation.id, middle.id)
  assert.ok(operation.patch.position)

  const nextMiddle: Node = {
    ...middle,
    position: operation.patch.position!
  }

  const firstBounds = getNodeBoundsByNode(first, DEFAULT_SIZE)
  const middleBounds = getNodeBoundsByNode(nextMiddle, DEFAULT_SIZE)
  const lastBounds = getNodeBoundsByNode(last, DEFAULT_SIZE)

  assert.ok(firstBounds)
  assert.ok(middleBounds)
  assert.ok(lastBounds)

  const leftGap = middleBounds.x - (firstBounds.x + firstBounds.width)
  const rightGap = lastBounds.x - (middleBounds.x + middleBounds.width)

  assert.ok(Math.abs(leftGap - rightGap) < 1e-6)
})
