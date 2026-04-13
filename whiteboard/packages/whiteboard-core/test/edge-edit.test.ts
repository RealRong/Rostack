import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  createRoutePatchFromPathPoints,
  moveElbowRouteSegment,
  moveElbowRouteSegmentPoints,
  resolveEdgeRouteHandleTarget
} from '@whiteboard/core/edge'
import { normalizePolylinePoints } from '@whiteboard/core/geometry'

const createEdge = (overrides = {}) => ({
  id: 'edge_1',
  type: 'elbow',
  source: {
    kind: 'point',
    point: { x: 0, y: 0 }
  },
  target: {
    kind: 'point',
    point: { x: 100, y: 100 }
  },
  route: {
    kind: 'auto'
  },
  ...overrides
})

test('normalizePolylinePoints 会去重并移除正交共线中点', () => {
  assert.deepEqual(
    normalizePolylinePoints([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 0, y: 80 },
      { x: 60, y: 80 }
    ]),
    [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 60, y: 80 }
    ]
  )
})

test('resolveEdgeRouteHandleTarget 解析 anchor 与 segment handle', () => {
  const handles = [
    {
      kind: 'anchor',
      index: 1,
      point: { x: 30, y: 40 },
      mode: 'fixed'
    },
    {
      kind: 'segment',
      role: 'control',
      insertIndex: 2,
      segmentIndex: 3,
      axis: 'y',
      point: { x: 60, y: 70 }
    }
  ]

  assert.deepEqual(
    resolveEdgeRouteHandleTarget({
      edgeId: 'edge_1',
      handles,
      pick: {
        index: 1
      }
    }),
    {
      kind: 'anchor',
      edgeId: 'edge_1',
      index: 1,
      point: { x: 30, y: 40 }
    }
  )

  assert.deepEqual(
    resolveEdgeRouteHandleTarget({
      edgeId: 'edge_1',
      handles,
      pick: {
        segment: 3
      }
    }),
    {
      kind: 'segment',
      edgeId: 'edge_1',
      index: 2,
      segmentIndex: 3,
      role: 'control',
      axis: 'y',
      point: { x: 60, y: 70 }
    }
  )
})

test('createRoutePatchFromPathPoints 会把无中间 route 的 path 归一成 auto route', () => {
  assert.deepEqual(
    createRoutePatchFromPathPoints(
      createEdge(),
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 }
      ]
    ),
    {
      route: {
        kind: 'auto'
      }
    }
  )
})

test('moveElbowRouteSegmentPoints 会把两点 path 扩展为可编辑折线', () => {
  assert.deepEqual(
    moveElbowRouteSegmentPoints({
      pathPoints: [
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ],
      segmentIndex: 0,
      axis: 'y',
      delta: 20
    }),
    [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 0 }
    ]
  )
})

test('moveElbowRouteSegment 会把拖拽后的 elbow segment 转成 manual route patch', () => {
  assert.deepEqual(
    moveElbowRouteSegment({
      edge: createEdge({
        route: {
          kind: 'manual',
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 }
          ]
        }
      }),
      pathPoints: [
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 100 }
      ],
      segmentIndex: 1,
      axis: 'y',
      delta: 20
    }),
    {
      route: {
        kind: 'manual',
        points: [
          { x: 0, y: 70 },
          { x: 100, y: 70 }
        ]
      }
    }
  )
})
