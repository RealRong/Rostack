import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  SHAPE_DESCRIPTORS,
  containsPointInNodeOutline,
  getNodeBounds,
  getNodeOutline,
  isShapeKind,
  readShapeDescriptor
} from '@whiteboard/core/node'

test('shape descriptor registry exposes the new shape kinds through one source of truth', () => {
  const kinds = SHAPE_DESCRIPTORS.map((descriptor) => descriptor.kind)

  assert.ok(kinds.includes('star'))
  assert.ok(kinds.includes('roundrect-bubble'))
  assert.ok(kinds.includes('manual-input'))
  assert.ok(kinds.includes('delay'))

  for (const kind of kinds) {
    assert.equal(isShapeKind(kind), true)
    assert.ok(readShapeDescriptor(kind).visual.outer.d.length > 0)
    assert.ok(readShapeDescriptor(kind).outline.top.length > 0)
  }
})

test('new shape outlines keep hit testing aligned with the descriptor geometry', () => {
  const rect = {
    x: 0,
    y: 0,
    width: 100,
    height: 100
  }

  assert.equal(
    containsPointInNodeOutline(
      {
        type: 'shape',
        data: {
          kind: 'semicircle'
        }
      },
      rect,
      0,
      {
        x: 50,
        y: 78
      }
    ),
    true
  )

  assert.equal(
    containsPointInNodeOutline(
      {
        type: 'shape',
        data: {
          kind: 'semicircle'
        }
      },
      rect,
      0,
      {
        x: 5,
        y: 10
      }
    ),
    false
  )

  assert.equal(
    containsPointInNodeOutline(
      {
        type: 'shape',
        data: {
          kind: 'roundrect-bubble'
        }
      },
      rect,
      0,
      {
        x: 37,
        y: 88
      }
    ),
    true
  )

  const starOutline = getNodeOutline(
    {
      type: 'shape',
      data: {
        kind: 'star'
      }
    },
    rect,
    0
  )

  assert.equal(starOutline.kind, 'polygon')
  assert.ok(starOutline.points.length > 0)
})

test('basic and flowchart shapes fill the canonical rect with their outline bounds', () => {
  const rect = {
    x: 120,
    y: 80,
    width: 260,
    height: 180
  }
  const rectBoundKinds = new Set([
    'rect',
    'rounded-rect',
    'pill',
    'ellipse',
    'diamond',
    'triangle',
    'hexagon',
    'parallelogram',
    'star',
    'pentagon',
    'trapezoid',
    'semicircle',
    'cylinder',
    'document',
    'predefined-process',
    'bevel-rect',
    'delay',
    'manual-input',
    'manual-operation'
  ])

  SHAPE_DESCRIPTORS
    .filter((descriptor) => rectBoundKinds.has(descriptor.kind))
    .forEach((descriptor) => {
      const bounds = getNodeBounds(
        {
          type: 'shape',
          data: {
            kind: descriptor.kind
          }
        },
        rect,
        0
      )

      assert.deepEqual(
        bounds,
        rect,
        `${descriptor.kind} should use rect as its outline bounds`
      )
    })
})
