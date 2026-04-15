import { describe, expect, it } from 'vitest'
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
  it('stores and clears text sources by node id and field', () => {
    const store = createTextSourceStore()
    const element = {} as HTMLElement

    store.set('node-1', 'text', element)
    expect(store.get('node-1', 'text')).toBe(element)

    store.set('node-1', 'text', null)
    expect(store.get('node-1', 'text')).toBeUndefined()
  })
})
