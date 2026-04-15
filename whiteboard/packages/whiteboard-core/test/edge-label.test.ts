import { describe, expect, it } from 'vitest'
import type { EdgePathResult } from '@whiteboard/core/types/edge'
import {
  projectPointToEdgeLabelPlacement,
  resolveEdgeLabelPlacement
} from '../src/edge/label'

const createHorizontalPath = (): EdgePathResult => ({
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 }
  ],
  segments: [{
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
    role: 'path'
  }],
  svgPath: 'M 0 0 L 100 0',
  label: { x: 50, y: 0 }
})

const createVerticalPath = (): EdgePathResult => ({
  points: [
    { x: 0, y: 0 },
    { x: 0, y: 100 }
  ],
  segments: [{
    from: { x: 0, y: 0 },
    to: { x: 0, y: 100 },
    role: 'path'
  }],
  svgPath: 'M 0 0 L 0 100',
  label: { x: 0, y: 50 }
})

const createDiagonalPath = (): EdgePathResult => ({
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 100 }
  ],
  segments: [{
    from: { x: 0, y: 0 },
    to: { x: 100, y: 100 },
    role: 'path'
  }],
  svgPath: 'M 0 0 L 100 100',
  label: { x: 50, y: 50 }
})

describe('projectPointToEdgeLabelPlacement', () => {
  it('snaps tangent labels to the center rail when the pointer stays within center tolerance', () => {
    const placement = projectPointToEdgeLabelPlacement({
      path: createHorizontalPath(),
      point: {
        x: 40,
        y: 6
      },
      maxOffset: 24,
      centerTolerance: 8,
      textMode: 'tangent',
      labelSize: {
        width: 60,
        height: 20
      },
      sideGap: 8
    })

    expect(placement).toMatchObject({
      t: 0.4,
      offset: 0,
      point: {
        x: 40,
        y: 0
      }
    })
  })

  it('snaps tangent labels to the positive side rail and keeps the top/bottom gap fixed', () => {
    const placement = projectPointToEdgeLabelPlacement({
      path: createHorizontalPath(),
      point: {
        x: 40,
        y: 12
      },
      maxOffset: 24,
      centerTolerance: 8,
      textMode: 'tangent',
      labelSize: {
        width: 60,
        height: 20
      },
      sideGap: 8
    })

    expect(placement).toMatchObject({
      t: 0.4,
      offset: 24,
      point: {
        x: 40,
        y: 18
      }
    })
  })

  it('snaps horizontal labels to the left side rail on a vertical edge', () => {
    const placement = projectPointToEdgeLabelPlacement({
      path: createVerticalPath(),
      point: {
        x: -12,
        y: 40
      },
      maxOffset: 24,
      centerTolerance: 8,
      textMode: 'horizontal',
      labelSize: {
        width: 60,
        height: 20
      },
      sideGap: 8
    })

    expect(placement).toMatchObject({
      t: 0.4,
      offset: -24,
      point: {
        x: -38,
        y: 40
      }
    })
  })

  it('snaps horizontal labels to the right side rail on the opposite side of a vertical edge', () => {
    const placement = projectPointToEdgeLabelPlacement({
      path: createVerticalPath(),
      point: {
        x: 12,
        y: 40
      },
      maxOffset: 24,
      centerTolerance: 8,
      textMode: 'horizontal',
      labelSize: {
        width: 60,
        height: 20
      },
      sideGap: 8
    })

    expect(placement).toMatchObject({
      t: 0.4,
      offset: 24,
      point: {
        x: 38,
        y: 40
      }
    })
  })

  it('uses the edge distance for horizontal center-rail tolerance instead of only x alignment', () => {
    const placement = projectPointToEdgeLabelPlacement({
      path: createHorizontalPath(),
      point: {
        x: 40,
        y: 12
      },
      maxOffset: 24,
      centerTolerance: 8,
      textMode: 'horizontal',
      labelSize: {
        width: 60,
        height: 20
      },
      sideGap: 8
    })

    expect(placement?.t).toBeCloseTo(0.4, 4)
    expect(placement?.offset).toBe(24)
    expect(placement?.point.x).toBeCloseTo(78, 4)
    expect(placement?.point.y).toBeCloseTo(10, 4)
  })

  it('keeps horizontal labels near the side rail and only adds the normal push needed to clear the edge', () => {
    const placement = resolveEdgeLabelPlacement({
      path: createDiagonalPath(),
      t: 0.6,
      offset: 24,
      textMode: 'horizontal',
      labelSize: {
        width: 200,
        height: 20
      },
      sideGap: 8
    })

    expect(placement?.point.x).toBeCloseTo(169, 3)
    expect(placement?.point.y).toBeCloseTo(59, 3)
  })
})
