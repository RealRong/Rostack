import { describe, expect, test } from 'vitest'
import {
  createDerivedStore,
  createValueStore
} from '@shared/core'

describe('read guards', () => {
  test('throws when a derived computation calls store.get directly', () => {
    const source = createValueStore(1)
    const derived = createDerivedStore({
      get: () => source.get() + 1
    })

    expect(() => {
      derived.get()
    }).toThrow(
      'Do not call store.get() inside a derived computation. Use read(store) instead.'
    )
  })
})
