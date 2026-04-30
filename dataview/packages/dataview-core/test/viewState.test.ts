import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  view
} from '@dataview/core/view'

test('view display state reuses shared collection and order semantics', () => {
  assert.deepEqual(
    view.display.replace(['a', 'b', 'a', 'c', 'b']),
    {
      fields: ['a', 'b', 'c']
    }
  )
  assert.deepEqual(
    view.display.move({
      fields: ['a', 'b', 'c', 'd']
    }, ['c', 'b', 'b'], 'a'),
    {
      fields: ['b', 'c', 'a', 'd']
    }
  )
  assert.deepEqual(
    view.display.show({
      fields: ['a', 'b', 'c']
    }, 'd', 'b'),
    {
      fields: ['a', 'd', 'b', 'c']
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
