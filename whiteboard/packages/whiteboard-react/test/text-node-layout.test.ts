import { describe, expect, it } from 'vitest'
import { resolveTextMeasureInput } from '../src/features/node/registry/default/text'

describe('resolveTextMeasureInput', () => {
  it('uses the current rect width for auto text', () => {
    expect(resolveTextMeasureInput({
      node: {
        id: 'node-1',
        type: 'text',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 120 },
        data: {
          text: 'hello'
        }
      },
      rect: {
        width: 200
      },
      placeholder: 'Text',
      fontSize: 14
    })).toEqual({
      node: {
        id: 'node-1',
        type: 'text',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 120 },
        data: {
          text: 'hello'
        }
      },
      baseWidth: 200,
      placeholder: 'Text',
      maxWidth: undefined,
      fontSize: 14
    })
  })

  it('pins base width and max width for wrap text', () => {
    expect(resolveTextMeasureInput({
      node: {
        id: 'node-2',
        type: 'text',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 24 },
        data: {
          text: 'wrapped',
          widthMode: 'wrap',
          wrapWidth: 240
        }
      },
      rect: {
        width: 80
      },
      placeholder: 'Text',
      fontSize: 14
    })).toEqual({
      node: {
        id: 'node-2',
        type: 'text',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 24 },
        data: {
          text: 'wrapped',
          widthMode: 'wrap',
          wrapWidth: 240
        }
      },
      baseWidth: 240,
      placeholder: 'Text',
      maxWidth: 240,
      fontSize: 14
    })
  })
})
