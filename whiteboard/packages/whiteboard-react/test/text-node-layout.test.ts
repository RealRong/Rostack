import { describe, expect, it } from 'vitest'
import { node as nodeApi } from '@whiteboard/core/node'
import { resolveTextLayoutStyle } from '../src/features/node/registry/default/text'
import { createTextSourceStore } from '../src/features/node/dom/textSourceStore'

describe('resolveTextLayoutStyle', () => {
  it('pins width for wrap text layout', () => {
    expect(resolveTextLayoutStyle({
      node: {
        id: 'text-1',
        type: 'text',
        position: { x: 0, y: 0 },
        data: {}
      },
      widthMode: 'wrap',
      wrapWidth: 220
    })).toEqual({
      width: 220,
      minWidth: 220,
      maxWidth: 220
    })
  })

  it('leaves auto text unconstrained', () => {
    expect(resolveTextLayoutStyle({
      node: {
        id: 'text-1',
        type: 'text',
        position: { x: 0, y: 0 },
        data: {}
      },
      widthMode: 'auto'
    })).toEqual({})
  })

  it('uses content-box width for framed wrap text', () => {
    expect(resolveTextLayoutStyle({
      node: {
        id: 'text-1',
        type: 'text',
        position: { x: 0, y: 0 },
        data: {},
        style: {
          paddingX: 18,
          paddingY: 10,
          strokeWidth: 2,
          frameKind: 'ellipse'
        }
      },
      widthMode: 'wrap',
      wrapWidth: 144
    })).toEqual({
      width: 104,
      minWidth: 104,
      maxWidth: 104
    })
  })
})

describe('createTextSourceStore', () => {
  it('stores and clears text sources by source id', () => {
    const store = createTextSourceStore()
    const element = {} as HTMLElement
    const source = {
      kind: 'node' as const,
      nodeId: 'node-1',
      field: 'text' as const
    }

    store.set(source, element)
    expect(store.get(source)).toBe(element)

    store.set(source, null)
    expect(store.get(source)).toBeUndefined()
  })
})

describe('text frame metrics', () => {
  it('derives content-box size from framed text border-box metrics', () => {
    const frame = nodeApi.text.frameMetrics({
      node: {
        type: 'text',
        style: {
          paddingX: 18,
          paddingY: 10,
          strokeWidth: 2,
          frameKind: 'ellipse'
        }
      },
      width: 144,
      height: 44
    })

    expect(nodeApi.text.contentBox(frame)).toEqual({
      width: 104,
      height: 18
    })
  })
})
