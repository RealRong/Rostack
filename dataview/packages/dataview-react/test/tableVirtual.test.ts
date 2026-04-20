import assert from 'node:assert/strict'
import { test } from 'vitest'
import { TableLayoutModel } from '@dataview/react/views/table/virtual/layoutModel'
import { createTableLayoutState } from '@dataview/react/views/table/virtual/layoutState'

test('TableLayoutModel uses measured heights for flat table blocks and recomputes tops', () => {
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
    headerHeight: 40,
    measuredHeights: new Map([
      ['column-header:root', 52],
      ['row:1', 68],
      ['column-footer:root', 64]
    ])
  })
  const blocks = model.materializeWindow({
    start: 0,
    end: 999
  }).items

  assert.deepEqual(blocks.map(block => ({
    key: block.key,
    top: block.top,
    height: block.height
  })), [
    {
      key: 'column-header:root',
      top: 0,
      height: 52
    },
    {
      key: 'row:1',
      top: 52,
      height: 68
    },
    {
      key: 'row:2',
      top: 120,
      height: 36
    },
    {
      key: 'create-record:root',
      top: 156,
      height: 36
    },
    {
      key: 'column-footer:root',
      top: 192,
      height: 64
    }
  ])
})

test('TableLayoutModel uses measured heights for grouped section blocks and keeps collapsed sections compact', () => {
  const model = TableLayoutModel.fromState({
    state: createTableLayoutState({
      grouped: true,
      sections: [
        {
          key: 'won',
          collapsed: false,
          itemIds: [1, 2]
        },
        {
          key: 'lost',
          collapsed: true,
          itemIds: [3]
        }
      ]
    }),
    rowHeight: 36,
    headerHeight: 40,
    measuredHeights: new Map([
      ['section-header:won', 48],
      ['column-header:won', 56],
      ['row:2', 72],
      ['column-footer:won', 60],
      ['section-header:lost', 44]
    ])
  })
  const blocks = model.materializeWindow({
    start: 0,
    end: 999
  }).items

  assert.deepEqual(blocks.map(block => ({
    key: block.key,
    top: block.top,
    height: block.height
  })), [
    {
      key: 'section-header:won',
      top: 0,
      height: 48
    },
    {
      key: 'column-header:won',
      top: 48,
      height: 56
    },
    {
      key: 'row:1',
      top: 104,
      height: 36
    },
    {
      key: 'row:2',
      top: 140,
      height: 72
    },
    {
      key: 'create-record:won',
      top: 212,
      height: 36
    },
    {
      key: 'column-footer:won',
      top: 248,
      height: 60
    },
    {
      key: 'section-header:lost',
      top: 308,
      height: 44
    }
  ])
})

test('TableLayoutModel applies measured height patches incrementally and locates rows by offset', () => {
  const model = TableLayoutModel.fromState({
    state: createTableLayoutState({
      grouped: false,
      sections: [{
        key: 'root',
        collapsed: false,
        itemIds: [1, 2, 3]
      }]
    }),
    rowHeight: 36,
    headerHeight: 40
  })

  assert.equal(model.locateRow(3)?.top, 112)

  model.applyMeasuredHeightPatches({
    changedHeights: new Map([
      ['row:1', 60],
      ['row:2', 72]
    ])
  })

  assert.equal(model.locateRow(3)?.top, 172)
  assert.deepEqual(
    model.materializeWindow({
      start: 100,
      end: 220
    }).items.map(block => ({
      key: block.key,
      top: block.top,
      height: block.height
    })),
    [
      {
        key: 'row:1',
        top: 40,
        height: 60
      },
      {
        key: 'row:2',
        top: 100,
        height: 72
      },
      {
        key: 'row:3',
        top: 172,
        height: 36
      },
      {
        key: 'create-record:root',
        top: 208,
        height: 36
      }
    ]
  )
})
