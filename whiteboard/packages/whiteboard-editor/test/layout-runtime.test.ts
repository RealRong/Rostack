import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@whiteboard/core/types'
import {
  createWhiteboardLayout,
  type LayoutBackend
} from '@whiteboard/core/layout'

const createStickyNode = (): Node => ({
  id: 'sticky-1',
  type: 'sticky',
  position: {
    x: 0,
    y: 0
  },
  size: {
    width: 180,
    height: 140
  },
  rotation: 0,
  data: {
    text: 'sticky',
    fontMode: 'auto'
  },
  style: {
    fontSize: 28
  }
})

describe('text layout preview patching', () => {
  it('does not recompute sticky auto font size during rotate preview', () => {
    const measure = vi.fn<LayoutBackend['measure']>(() => ({
      kind: 'fit',
      fontSize: 18
    }))
    const node = createStickyNode()
    const layout = createWhiteboardLayout({
      nodes: {
        sticky: 'fit'
      },
      backend: { measure }
    })

    expect(layout.runtime({
      kind: 'node.transform',
      patches: [{
        id: node.id,
        rotation: 45
      }],
      readNode: () => node,
      readRect: () => ({
        x: 0,
        y: 0,
        width: 180,
        height: 140
      })
    }).patches).toEqual([{
      id: node.id,
      rotation: 45
    }])
    expect(measure).not.toHaveBeenCalled()
  })

  it('recomputes sticky auto font size when preview size changes', () => {
    const measure = vi.fn<LayoutBackend['measure']>(() => ({
      kind: 'fit',
      fontSize: 18
    }))
    const node = createStickyNode()
    const layout = createWhiteboardLayout({
      nodes: {
        sticky: 'fit'
      },
      backend: { measure }
    })

    expect(layout.runtime({
      kind: 'node.transform',
      patches: [{
        id: node.id,
        size: {
          width: 100,
          height: 140
        }
      }],
      readNode: () => node,
      readRect: () => ({
        x: 0,
        y: 0,
        width: 180,
        height: 140
      })
    }).patches).toEqual([{
      id: node.id,
      size: {
        width: 100,
        height: 140
      },
      fontSize: 18
    }])
    expect(measure).toHaveBeenCalledTimes(1)
  })
})
