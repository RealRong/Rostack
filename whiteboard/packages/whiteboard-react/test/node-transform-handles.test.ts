import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDGE_RESIZE_DIRECTIONS,
  DEFAULT_VISIBLE_RESIZE_DIRECTIONS,
  resolveNodeEdgeResizeDirections,
  resolveSelectionEdgeResizeDirections,
  resolveSelectionVisibleResizeDirections,
  resolveTransformChromeScreenSize,
  resolveTransformEdgeHitAreaStyle
} from '../src/features/node/components/NodeTransformHandles'

describe('NodeTransformHandles direction config', () => {
  it('keeps visible resize handles on the four corners only', () => {
    expect(DEFAULT_VISIBLE_RESIZE_DIRECTIONS).toEqual([
      'nw',
      'ne',
      'se',
      'sw'
    ])
  })

  it('keeps full edge resize interaction for regular nodes', () => {
    expect(resolveNodeEdgeResizeDirections('shape')).toEqual(
      DEFAULT_EDGE_RESIZE_DIRECTIONS
    )
  })

  it('limits text edge resize interaction to east and west', () => {
    expect(resolveNodeEdgeResizeDirections('text')).toEqual([
      'e',
      'w'
    ])
  })

  it('keeps multi-selection visible handles on corners only', () => {
    expect(resolveSelectionVisibleResizeDirections({
      box: {
        x: 0,
        y: 0,
        width: 100,
        height: 80
      },
      members: [],
      handles: [
        { id: 'nw', visible: true, enabled: true, family: 'scale-xy', cursor: 'nwse-resize' },
        { id: 'n', visible: true, enabled: true, family: 'resize-y', cursor: 'ns-resize' },
        { id: 'ne', visible: true, enabled: true, family: 'scale-xy', cursor: 'nesw-resize' },
        { id: 'e', visible: true, enabled: true, family: 'resize-x', cursor: 'ew-resize' },
        { id: 'se', visible: true, enabled: true, family: 'scale-xy', cursor: 'nwse-resize' },
        { id: 's', visible: true, enabled: true, family: 'resize-y', cursor: 'ns-resize' },
        { id: 'sw', visible: true, enabled: true, family: 'scale-xy', cursor: 'nesw-resize' },
        { id: 'w', visible: true, enabled: true, family: 'resize-x', cursor: 'ew-resize' }
      ]
    })).toEqual([
      'nw',
      'ne',
      'se',
      'sw'
    ])
  })

  it('keeps multi-text edge resize interaction on east and west only', () => {
    expect(resolveSelectionEdgeResizeDirections({
      box: {
        x: 0,
        y: 0,
        width: 100,
        height: 80
      },
      members: [],
      handles: [
        { id: 'nw', visible: true, enabled: true, family: 'scale-xy', cursor: 'nwse-resize' },
        { id: 'n', visible: false, enabled: false, cursor: 'ns-resize' },
        { id: 'ne', visible: true, enabled: true, family: 'scale-xy', cursor: 'nesw-resize' },
        { id: 'e', visible: true, enabled: true, family: 'resize-x', cursor: 'ew-resize' },
        { id: 'se', visible: true, enabled: true, family: 'scale-xy', cursor: 'nwse-resize' },
        { id: 's', visible: false, enabled: false, cursor: 'ns-resize' },
        { id: 'sw', visible: true, enabled: true, family: 'scale-xy', cursor: 'nesw-resize' },
        { id: 'w', visible: true, enabled: true, family: 'resize-x', cursor: 'ew-resize' }
      ]
    })).toEqual([
      'e',
      'w'
    ])
  })
})

describe('resolveTransformEdgeHitAreaStyle', () => {
  it('eases visible transform chrome with sqrt zoom and clamps extremes', () => {
    expect(resolveTransformChromeScreenSize({
      zoom: 0.25,
      base: 12,
      min: 8,
      max: 14
    })).toBe(8)

    expect(resolveTransformChromeScreenSize({
      zoom: 1,
      base: 12,
      min: 8,
      max: 14
    })).toBe(12)

    expect(resolveTransformChromeScreenSize({
      zoom: 4,
      base: 12,
      min: 8,
      max: 14
    })).toBe(14)
  })

  it('creates a top edge hit area with corner padding', () => {
    expect(resolveTransformEdgeHitAreaStyle({
      direction: 'n',
      rect: {
        width: 120,
        height: 80
      },
      zoom: 2
    })).toEqual({
      left: 6.5,
      top: -4,
      width: 107,
      height: 8
    })
  })

  it('keeps a usable hit area even for narrow bounds', () => {
    expect(resolveTransformEdgeHitAreaStyle({
      direction: 'e',
      rect: {
        width: 10,
        height: 20
      },
      zoom: 1
    })).toEqual({
      left: 2,
      top: 2,
      width: 16,
      height: 16
    })
  })
})
