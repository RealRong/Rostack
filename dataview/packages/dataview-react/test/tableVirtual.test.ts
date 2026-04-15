import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildTableBlocks } from '@dataview/react/views/table/virtual/buildBlocks'

test('buildTableBlocks uses measured heights for flat table blocks and recomputes tops', () => {
  const blocks = buildTableBlocks({
    grouped: false,
    rowIds: ['row_1', 'row_2'],
    sections: [],
    rowHeight: 36,
    headerHeight: 40,
    blockHeights: new Map([
      ['column-header:flat', 52],
      ['row:row_1', 68],
      ['column-footer:flat', 64]
    ])
  })

  assert.deepEqual(blocks.map(block => ({
    key: block.key,
    top: block.top,
    height: block.height
  })), [
    {
      key: 'column-header:flat',
      top: 0,
      height: 52
    },
    {
      key: 'row:row_1',
      top: 52,
      height: 68
    },
    {
      key: 'row:row_2',
      top: 120,
      height: 36
    },
    {
      key: 'column-footer:flat',
      top: 156,
      height: 64
    }
  ])
})

test('buildTableBlocks uses measured heights for grouped section blocks and keeps collapsed sections compact', () => {
  const blocks = buildTableBlocks({
    grouped: true,
    rowIds: ['row_1', 'row_2', 'row_3'],
    sections: [
      {
        key: 'won',
        title: 'Won',
        collapsed: false,
        itemIds: ['row_1', 'row_2']
      },
      {
        key: 'lost',
        title: 'Lost',
        collapsed: true,
        itemIds: ['row_3']
      }
    ],
    rowHeight: 36,
    headerHeight: 40,
    blockHeights: new Map([
      ['section-header:won', 48],
      ['column-header:won', 56],
      ['row:row_2', 72],
      ['column-footer:won', 60],
      ['section-header:lost', 44]
    ])
  })

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
      key: 'row:row_1',
      top: 104,
      height: 36
    },
    {
      key: 'row:row_2',
      top: 140,
      height: 72
    },
    {
      key: 'column-footer:won',
      top: 212,
      height: 60
    },
    {
      key: 'section-header:lost',
      top: 272,
      height: 44
    }
  ])
})
