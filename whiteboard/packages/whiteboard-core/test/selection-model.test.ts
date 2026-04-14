import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  deriveSelectionAffordance,
  deriveSelectionSummary
} from '@whiteboard/core/selection'
import type {
  Edge,
  Node,
  Rect
} from '@whiteboard/core/types'

const createNode = (
  id: string,
  overrides: Partial<Node> = {}
): Node => ({
  id,
  type: 'shape',
  position: {
    x: 0,
    y: 0
  },
  size: {
    width: 100,
    height: 60
  },
  ...overrides
})

const createEdge = (
  id: string
): Edge => ({
  id,
  type: 'straight',
  source: {
    kind: 'point',
    point: {
      x: 0,
      y: 0
    }
  },
  target: {
    kind: 'point',
    point: {
      x: 200,
      y: 160
    }
  }
})

test('selection summary aggregates node canonical rects for node selections', () => {
  const first = createNode('first')
  const second = createNode('second')
  const rectById = new Map<string, Rect>([
    ['first', { x: 40, y: 30, width: 120, height: 80 }],
    ['second', { x: 200, y: 90, width: 100, height: 50 }]
  ])

  const summary = deriveSelectionSummary({
    target: {
      nodeIds: ['first', 'second'],
      edgeIds: []
    },
    nodes: [first, second],
    edges: [],
    readNodeRect: (node) => rectById.get(node.id),
    readEdgeBounds: () => undefined,
    resolveNodeTransformCapability: () => ({
      resize: true,
      rotate: true
    }),
    isNodeScalable: () => true
  })

  assert.deepEqual(summary.box, {
    x: 40,
    y: 30,
    width: 260,
    height: 110
  })
})

test('mixed selections keep a single display box but disable resize handles', () => {
  const node = createNode('node')
  const edge = createEdge('edge')

  const summary = deriveSelectionSummary({
    target: {
      nodeIds: ['node'],
      edgeIds: ['edge']
    },
    nodes: [node],
    edges: [edge],
    readNodeRect: () => ({
      x: 20,
      y: 40,
      width: 120,
      height: 80
    }),
    readEdgeBounds: () => ({
      x: 10,
      y: 25,
      width: 190,
      height: 140
    }),
    resolveNodeTransformCapability: () => ({
      resize: true,
      rotate: true
    }),
    isNodeScalable: () => true
  })

  const affordance = deriveSelectionAffordance({
    selection: summary,
    resolveNodeRole: () => 'content',
    resolveNodeTransformCapability: () => ({
      resize: true,
      rotate: true
    })
  })

  assert.deepEqual(summary.box, {
    x: 10,
    y: 25,
    width: 190,
    height: 140
  })
  assert.equal(affordance.owner, 'multi-selection')
  assert.equal(affordance.canResize, false)
  assert.equal(affordance.canRotate, false)
})
