import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  SHAPE_DESCRIPTORS,
  containsPointInNodeOutline,
  createShapeNodeInput,
  getNodeOutline,
  isShapeKind,
  readShapeDescriptor,
  readShapeSpec
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

test('createShapeNodeInput reads defaults from the descriptor registry', () => {
  const star = createShapeNodeInput('star')
  const speechBubble = createShapeNodeInput('roundrect-bubble')
  const delay = createShapeNodeInput('delay')

  assert.deepEqual(star.size, {
    width: 190,
    height: 180
  })
  assert.equal(star.data?.text, 'Star')

  assert.deepEqual(speechBubble.size, {
    width: 240,
    height: 150
  })
  assert.equal(speechBubble.data?.text, 'Speech Bubble')

  assert.deepEqual(delay.size, {
    width: 190,
    height: 110
  })
  assert.equal(delay.style?.fill, readShapeSpec('delay').defaults.fill)
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
        x: 50,
        y: 20
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
