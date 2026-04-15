import { describe, expect, it } from 'vitest'
import { readNodeTextSourceId } from '@whiteboard/editor'
import { resolveTextLayoutStyle } from '../src/features/node/registry/default/text'
import { createTextSourceStore } from '../src/features/node/dom/textSourceStore'

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

describe('createTextSourceStore', () => {
  it('stores and clears text sources by source id', () => {
    const store = createTextSourceStore()
    const element = {} as HTMLElement
    const sourceId = readNodeTextSourceId('node-1', 'text')

    store.set(sourceId, element)
    expect(store.get(sourceId)).toBe(element)

    store.set(sourceId, null)
    expect(store.get(sourceId)).toBeUndefined()
  })
})
