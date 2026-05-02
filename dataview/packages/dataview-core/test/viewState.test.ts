import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import {
  view
} from '@dataview/core/view'

const displayFields = (
  fieldIds: readonly string[]
) => entityTable.normalize.list(
  fieldIds.map((fieldId) => ({ id: fieldId }))
)

test('view display state reuses shared collection and order semantics', () => {
  assert.deepEqual(
    view.display.replace(['a', 'b', 'a', 'c', 'b']),
    {
      fields: displayFields(['a', 'b', 'c'])
    }
  )
  assert.deepEqual(
    view.display.move({
      fields: displayFields(['a', 'b', 'c', 'd'])
    }, ['c', 'b', 'b'], 'a'),
    {
      fields: displayFields(['b', 'c', 'a', 'd'])
    }
  )
  assert.deepEqual(
    view.display.show({
      fields: displayFields(['a', 'b', 'c'])
    }, 'd', 'b'),
    {
      fields: displayFields(['a', 'd', 'b', 'c'])
    }
  )
})

test('view calc comparison is stable across object key order', () => {
  assert.equal(
    view.calc.same(
      {
        title: 'countAll',
        score: 'sum'
      },
      {
        score: 'sum',
        title: 'countAll'
      }
    ),
    true
  )
})

test('view order splice dedupes moving ids before applying splice', () => {
  assert.deepEqual(
    view.order.splice(
      ['a', 'b', 'c', 'd'],
      ['c', 'c'],
      {
        beforeRecordId: 'b'
      }
    ),
    ['a', 'c', 'b', 'd']
  )
})
