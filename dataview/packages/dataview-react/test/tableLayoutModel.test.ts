import assert from 'node:assert/strict'
import { test } from 'vitest'
import { TableLayoutModel } from '@dataview/react/views/table/virtual'
import { createTableLayoutState } from '@dataview/react/views/table/virtual/layoutState'

test('table layout inserts create-record block before footer in flat tables', () => {
  const model = TableLayoutModel.fromState({
    state: createTableLayoutState({
      grouped: false,
      sections: [{
        key: 'root',
        collapsed: false,
        itemIds: [1, 2]
      }]
    }),
    rowHeight: 36,
    headerHeight: 32
  })

  assert.deepEqual(
    model.materializeWindow({
      start: 0,
      end: 1000
    }).items.map(block => block.key),
    [
      'column-header:root',
      'row:1',
      'row:2',
      'create-record:root',
      'column-footer:root'
    ]
  )
})

test('table layout inserts create-record block before footer for empty grouped sections', () => {
  const model = TableLayoutModel.fromState({
    state: createTableLayoutState({
      grouped: true,
      sections: [
        {
          key: 'todo',
          collapsed: false,
          itemIds: [1]
        },
        {
          key: 'done',
          collapsed: false,
          itemIds: []
        }
      ]
    }),
    rowHeight: 36,
    headerHeight: 32
  })

  assert.deepEqual(
    model.materializeWindow({
      start: 0,
      end: 1000
    }).items.map(block => block.key),
    [
      'section-header:todo',
      'column-header:todo',
      'row:1',
      'create-record:todo',
      'column-footer:todo',
      'section-header:done',
      'column-header:done',
      'create-record:done',
      'column-footer:done'
    ]
  )
})

test('table layout removes collapsed row height so later sections move up', () => {
  const model = TableLayoutModel.fromState({
    state: createTableLayoutState({
      grouped: true,
      sections: [
        {
          key: 'todo',
          collapsed: true,
          itemIds: [1, 2, 3]
        },
        {
          key: 'done',
          collapsed: false,
          itemIds: [4]
        }
      ]
    }),
    rowHeight: 36,
    headerHeight: 40
  })

  assert.deepEqual(
    model.materializeWindow({
      start: 0,
      end: 1000
    }).items.map(block => ({
      key: block.key,
      top: block.top,
      height: block.height
    })),
    [
      {
        key: 'section-header:todo',
        top: 0,
        height: 40
      },
      {
        key: 'section-header:done',
        top: 40,
        height: 40
      },
      {
        key: 'column-header:done',
        top: 80,
        height: 40
      },
      {
        key: 'row:4',
        top: 120,
        height: 36
      },
      {
        key: 'create-record:done',
        top: 156,
        height: 36
      },
      {
        key: 'column-footer:done',
        top: 192,
        height: 40
      }
    ]
  )
})
