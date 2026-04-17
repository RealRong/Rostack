import assert from 'node:assert/strict'
import { test } from 'vitest'
import { TableLayoutModel } from '@dataview/react/views/table/virtual/layoutModel'

const createMockItemList = (ids: readonly string[]) => ({
  ids,
  count: ids.length,
  get: (id: string) => (
    ids.includes(id)
      ? {
          id,
          recordId: id,
          sectionKey: 'section'
        }
      : undefined
  ),
  has: (id: string) => ids.includes(id),
  indexOf: (id: string) => {
    const index = ids.indexOf(id)
    return index === -1
      ? undefined
      : index
  },
  at: (index: number) => ids[index],
  prev: (id: string) => {
    const index = ids.indexOf(id)
    return index > 0
      ? ids[index - 1]
      : undefined
  },
  next: (id: string) => {
    const index = ids.indexOf(id)
    return index >= 0
      ? ids[index + 1]
      : undefined
  },
  range: (anchor: string, focus: string) => {
    const anchorIndex = ids.indexOf(anchor)
    const focusIndex = ids.indexOf(focus)
    if (anchorIndex === -1 || focusIndex === -1) {
      return []
    }

    const start = Math.min(anchorIndex, focusIndex)
    const end = Math.max(anchorIndex, focusIndex)
    return ids.slice(start, end + 1)
  }
})

test('TableLayoutModel uses measured heights for flat table blocks and recomputes tops', () => {
  const model = TableLayoutModel.fromCurrentView({
    source: {
      grouped: false,
      items: createMockItemList(['row_1', 'row_2']),
      sections: {
        all: []
      }
    } as any,
    rowHeight: 36,
    headerHeight: 40,
    measuredHeights: new Map([
      ['column-header:flat', 52],
      ['row:row_1', 68],
      ['column-footer:flat', 64]
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

test('TableLayoutModel uses measured heights for grouped section blocks and keeps collapsed sections compact', () => {
  const model = TableLayoutModel.fromCurrentView({
    source: {
      grouped: true,
      items: createMockItemList(['row_1', 'row_2', 'row_3']),
      sections: {
        all: [
          {
            key: 'won',
            label: 'Won',
            collapsed: false,
            items: createMockItemList(['row_1', 'row_2'])
          },
          {
            key: 'lost',
            label: 'Lost',
            collapsed: true,
            items: createMockItemList(['row_3'])
          }
        ]
      }
    } as any,
    rowHeight: 36,
    headerHeight: 40,
    measuredHeights: new Map([
      ['section-header:won', 48],
      ['column-header:won', 56],
      ['row:row_2', 72],
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

test('TableLayoutModel applies measured height patches incrementally and locates rows by offset', () => {
  const model = TableLayoutModel.fromCurrentView({
    source: {
      grouped: false,
      items: createMockItemList(['row_1', 'row_2', 'row_3']),
      sections: {
        all: []
      }
    } as any,
    rowHeight: 36,
    headerHeight: 40
  })

  assert.equal(model.locateRow('row_3')?.top, 112)

  model.applyMeasuredHeightPatches({
    changedHeights: new Map([
      ['row:row_1', 60],
      ['row:row_2', 72]
    ])
  })

  assert.equal(model.locateRow('row_3')?.top, 172)
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
        key: 'row:row_1',
        top: 40,
        height: 60
      },
      {
        key: 'row:row_2',
        top: 100,
        height: 72
      },
      {
        key: 'row:row_3',
        top: 172,
        height: 36
      },
      {
        key: 'column-footer:flat',
        top: 208,
        height: 40
      }
    ]
  )
})
