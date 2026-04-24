import { describe, expect, test } from 'vitest'
import { store } from '@shared/core'

describe('createTableStore', () => {
  test('apply updates projected keyed reads', () => {
    const table = store.createTableStore<string, {
      value: number
      label: string
    }>()
    const projected = table.project.field(entry => entry?.value)
    const values: Array<number | undefined> = []
    const unsubscribe = projected.subscribe('left', () => {
      values.push(projected.get('left'))
    })

    table.write.apply({
      set: [[
        'left',
        {
          value: 1,
          label: 'left'
        }
      ]]
    })
    table.write.apply({
      set: [[
        'left',
        {
          value: 2,
          label: 'next'
        }
      ]]
    })
    table.write.apply({
      remove: ['left']
    })

    expect(values).toEqual([1, 2, undefined])
    unsubscribe()
  })
})
