import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  createTableMeasurementPlan
} from '@dataview/react/views/table/virtual'
import {
  createTableLayoutState
} from '@dataview/react/views/table/virtual/layoutState'

test('table measurement plan includes grouped section headers and skips collapsed rows', () => {
  const plan = createTableMeasurementPlan({
    state: createTableLayoutState({
      grouped: true,
      sections: [
        {
          key: 'todo',
          collapsed: false,
          itemIds: [1, 2]
        },
        {
          key: 'done',
          collapsed: true,
          itemIds: [3]
        }
      ]
    })
  })

  assert.deepEqual(plan.ids, [
    'section-header:todo',
    'column-header:todo',
    'row:1',
    'row:2',
    'create-record:todo',
    'column-footer:todo',
    'section-header:done'
  ])
})

test('table measurement plan excludes flat section headers', () => {
  const plan = createTableMeasurementPlan({
    state: createTableLayoutState({
      grouped: false,
      sections: [{
        key: 'root',
        collapsed: false,
        itemIds: [1]
      }]
    })
  })

  assert.deepEqual(plan.ids, [
    'column-header:root',
    'row:1',
    'create-record:root',
    'column-footer:root'
  ])
})
