import assert from 'node:assert/strict'
import { test } from 'vitest'
import { selection } from '@whiteboard/core/selection'
import { node as nodeApi } from '@whiteboard/core/node'
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

  const summary = selection.derive.summary({
    target: {
      nodeIds: ['first', 'second'],
      edgeIds: []
    },
    nodes: [first, second],
    edges: [],
    readNodeRect: (node) => rectById.get(node.id),
    readEdgeBounds: () => undefined,
    resolveNodeTransformBehavior: (node) => nodeApi.transform.resolveBehavior(node, {
      role: 'content',
      resize: true
    })
  })

  assert.deepEqual(summary.box, {
    x: 40,
    y: 30,
    width: 260,
    height: 110
  })
  assert.equal(summary.transformPlan?.handles.some((handle) => handle.id === 'e' && handle.family === 'resize-x'), true)
  assert.equal(summary.transformPlan?.handles.some((handle) => handle.id === 's' && handle.family === 'resize-y'), true)
  assert.equal(summary.transformPlan?.handles.some((handle) => handle.id === 'se' && handle.family === 'scale-xy'), true)
})

test('mixed selections keep a single display box but disable resize handles', () => {
  const node = createNode('node')
  const edge = createEdge('edge')

  const summary = selection.derive.summary({
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
    resolveNodeTransformBehavior: (node) => nodeApi.transform.resolveBehavior(node, {
      role: 'content',
      resize: true
    })
  })

  const affordance = selection.derive.affordance({
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
  assert.equal(summary.transformPlan, undefined)
})

test('mixed text and shape multi-selection keeps corner scale handles only', () => {
  const textNode = createNode('text', {
    type: 'text'
  })
  const shapeNode = createNode('shape')

  const summary = selection.derive.summary({
    target: {
      nodeIds: ['text', 'shape'],
      edgeIds: []
    },
    nodes: [textNode, shapeNode],
    edges: [],
    readNodeRect: (node) => node.id === 'text'
      ? { x: 0, y: 0, width: 100, height: 40 }
      : { x: 180, y: 20, width: 120, height: 80 },
    readEdgeBounds: () => undefined,
    resolveNodeTransformBehavior: (node) => nodeApi.transform.resolveBehavior(node, {
      role: 'content',
      resize: true
    })
  })

  const visibleHandles = summary.transformPlan?.handles
    .filter((handle) => handle.visible)
    .map((handle) => handle.id)

  assert.deepEqual(visibleHandles, ['nw', 'ne', 'se', 'sw'])
})

test('pure text multi-selection keeps corner scale and horizontal edge resize only', () => {
  const firstText = createNode('text-1', {
    type: 'text'
  })
  const secondText = createNode('text-2', {
    type: 'text'
  })

  const summary = selection.derive.summary({
    target: {
      nodeIds: ['text-1', 'text-2'],
      edgeIds: []
    },
    nodes: [firstText, secondText],
    edges: [],
    readNodeRect: (node) => node.id === 'text-1'
      ? { x: 0, y: 0, width: 120, height: 48 }
      : { x: 180, y: 20, width: 140, height: 56 },
    readEdgeBounds: () => undefined,
    resolveNodeTransformBehavior: (node) => nodeApi.transform.resolveBehavior(node, {
      role: 'content',
      resize: true
    })
  })

  const visibleHandles = summary.transformPlan?.handles
    .filter((handle) => handle.visible)

  const visibleCornerHandles = visibleHandles
    ?.filter((handle) => nodeApi.transform.isCornerResizeDirection(handle.id))
    .map((handle) => handle.id)
  const visibleEdgeHandles = visibleHandles
    ?.filter((handle) => !nodeApi.transform.isCornerResizeDirection(handle.id))
    .map((handle) => handle.id)

  assert.deepEqual(visibleCornerHandles, ['nw', 'ne', 'se', 'sw'])
  assert.deepEqual(visibleEdgeHandles, ['e', 'w'])
})
