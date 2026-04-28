import { describe, expect, test } from 'vitest'
import { entityTable } from '@shared/core'

describe('entityTable.write.remove', () => {
  test('removes deleted entities from normalized overlays', () => {
    const table = entityTable.normalize.list([
      {
        id: 'left',
        value: 1
      },
      {
        id: 'right',
        value: 2
      }
    ])

    const removed = entityTable.write.remove(table, 'left')
    const normalized = entityTable.normalize.table(removed)

    expect(removed.ids).toEqual(['right'])
    expect(removed.byId.left).toBeUndefined()
    expect(normalized.ids).toEqual(['right'])
    expect(normalized.byId.left).toBeUndefined()
  })
})
