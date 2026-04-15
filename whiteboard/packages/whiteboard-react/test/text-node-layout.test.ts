import { describe, expect, it } from 'vitest'
import {
  resolveTextLayoutStyle,
  resolveTextMeasureInput
} from '../src/features/node/registry/default/text'

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
      minWidth: undefined,
      maxWidth: undefined,
      fontSize: 14,
      widthMode: 'auto',
      wrapWidth: undefined
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
      minWidth: 240,
      maxWidth: 240,
      fontSize: 14,
      widthMode: 'wrap',
      wrapWidth: 240
    })
  })

  it('honors explicit wrap overrides while editing auto text', () => {
    expect(resolveTextMeasureInput({
      node: {
        id: 'node-3',
        type: 'text',
        position: { x: 0, y: 0 },
        size: { width: 96, height: 24 },
        data: {
          text: 'editing'
        }
      },
      rect: {
        width: 96
      },
      placeholder: 'Text',
      fontSize: 14,
      widthMode: 'wrap',
      wrapWidth: 180
    })).toEqual({
      node: {
        id: 'node-3',
        type: 'text',
        position: { x: 0, y: 0 },
        size: { width: 96, height: 24 },
        data: {
          text: 'editing'
        }
      },
      baseWidth: 180,
      placeholder: 'Text',
      minWidth: 180,
      maxWidth: 180,
      fontSize: 14,
      widthMode: 'wrap',
      wrapWidth: 180
    })
  })
})

describe('resolveTextLayoutStyle', () => {
  it('pins width for wrap text layout', () => {
    expect(resolveTextLayoutStyle({
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
      widthMode: 'auto'
    })).toEqual({})
  })
})
