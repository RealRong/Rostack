import { describe, expect, test } from 'vitest'
import { store } from '@shared/core'

describe('createKeyTableStore', () => {
  test('applyExact updates projected keyed reads', () => {
    const table = store.createKeyTableStore<string, {
      value: number
      label: string
    }>()
    const projected = table.project.field(entry => entry?.value)
    const values: Array<number | undefined> = []
    const unsubscribe = projected.subscribe('left', () => {
      values.push(projected.get('left'))
    })

    table.write.applyExact({
      set: [[
        'left',
        {
          value: 1,
          label: 'left'
        }
      ]]
    })
    table.write.applyExact({
      set: [[
        'left',
        {
          value: 2,
          label: 'next'
        }
      ]]
    })
    table.write.applyExact({
      remove: ['left']
    })

    expect(values).toEqual([1, 2, undefined])
    unsubscribe()
  })
})
