import { describe, expect, it } from 'vitest'
import { geometry } from '@whiteboard/core/geometry'

describe('geometry.rect.distanceToPoint', () => {
  it('returns zero for points inside the rect', () => {
    expect(geometry.rect.distanceToPoint(
      {
        x: 12,
        y: 14
      },
      {
        x: 10,
        y: 10,
        width: 20,
        height: 20
      }
    )).toBe(0)
  })

  it('returns euclidean distance for points outside the rect', () => {
    expect(geometry.rect.distanceToPoint(
      {
        x: 40,
        y: 15
      },
      {
        x: 10,
        y: 10,
        width: 20,
        height: 20
      }
    )).toBe(10)

    expect(geometry.rect.distanceToPoint(
      {
        x: 0,
        y: 0
      },
      {
        x: 3,
        y: 4,
        width: 10,
        height: 10
      }
    )).toBe(5)
  })
})

describe('geometry.scalar winner picking', () => {
  it('prefers lower distance and breaks ties with higher order', () => {
    const current = {
      id: 'a',
      distance: 10,
      order: 1
    }
    const next = {
      id: 'b',
      distance: 10,
      order: 2
    }

    expect(geometry.scalar.pickPreferred(
      current,
      next,
      (item) => item.distance,
      (item) => item.order
    )).toBe(next)
  })

  it('uses the same tie-breaker when scanning arrays', () => {
    const items = [
      {
        id: 'a',
        distance: 8,
        order: 1
      },
      {
        id: 'b',
        distance: 8,
        order: 3
      },
      {
        id: 'c',
        distance: 12,
        order: 5
      }
    ] as const

    expect(geometry.scalar.pickNearest(
      items,
      (item) => item.distance,
      (item) => item.order
    )).toBe(items[1])
  })
})
