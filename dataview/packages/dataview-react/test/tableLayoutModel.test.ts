import assert from 'node:assert/strict'
import { test } from 'vitest'
import type {
  ItemList,
  Section,
  SectionList
} from '@dataview/engine'
import { TableLayoutModel } from '@dataview/react/views/table/virtual'

const createItemListStub = (entries: readonly {
  id: number
  recordId: string
  sectionKey: string
}[]): ItemList => {
  const ids = entries.map(entry => entry.id)
  const byId = new Map(entries.map(entry => [entry.id, entry] as const))

  return {
    ids,
    count: ids.length,
    get: id => {
      const entry = byId.get(id)
      return entry
        ? {
            id: entry.id,
            recordId: entry.recordId,
            sectionKey: entry.sectionKey
          }
        : undefined
    },
    has: id => byId.has(id),
    indexOf: id => {
      const index = ids.indexOf(id)
      return index === -1
        ? undefined
        : index
    },
    at: index => ids[index],
    prev: id => {
      const index = ids.indexOf(id)
      return index > 0
        ? ids[index - 1]
        : undefined
    },
    next: id => {
      const index = ids.indexOf(id)
      return index >= 0
        ? ids[index + 1]
        : undefined
    },
    range: (anchor, focus) => {
      const anchorIndex = ids.indexOf(anchor)
      const focusIndex = ids.indexOf(focus)
      if (anchorIndex === -1 || focusIndex === -1) {
        return []
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    }
  }
}

const createSectionsStub = (
  sections: readonly Section[]
): SectionList => {
  const ids = sections.map(section => section.key)
  const byKey = new Map(sections.map(section => [section.key, section] as const))

  return {
    ids,
    all: sections,
    get: key => byKey.get(key),
    has: key => byKey.has(key),
    indexOf: key => {
      const index = ids.indexOf(key)
      return index === -1
        ? undefined
        : index
    },
    at: index => ids[index]
  }
}

test('table layout inserts create-record block before footer in flat tables', () => {
  const items = createItemListStub([
    { id: 1, recordId: 'record_1', sectionKey: 'root' },
    { id: 2, recordId: 'record_2', sectionKey: 'root' }
  ])
  const sections = createSectionsStub([
    {
      key: 'root',
      label: 'All',
      collapsed: false,
      recordIds: ['record_1', 'record_2'],
      items
    }
  ])

  const model = TableLayoutModel.fromCurrentView({
    source: {
      grouped: false,
      items,
      sections
    },
    rowHeight: 36,
    headerHeight: 32
  })

  assert.deepEqual(
    model.materializeWindow({
      start: 0,
      end: 1000
    }).items.map(block => block.key),
    [
      'column-header:flat',
      'row:1',
      'row:2',
      'create-record:flat',
      'column-footer:flat'
    ]
  )
})

test('table layout inserts create-record block before footer for empty grouped sections', () => {
  const todoItems = createItemListStub([
    { id: 1, recordId: 'record_1', sectionKey: 'todo' }
  ])
  const emptyItems = createItemListStub([])
  const sections = createSectionsStub([
    {
      key: 'todo',
      label: 'Todo',
      collapsed: false,
      recordIds: ['record_1'],
      items: todoItems
    },
    {
      key: 'done',
      label: 'Done',
      collapsed: false,
      recordIds: [],
      items: emptyItems
    }
  ])
  const allItems = createItemListStub([
    { id: 1, recordId: 'record_1', sectionKey: 'todo' }
  ])

  const model = TableLayoutModel.fromCurrentView({
    source: {
      grouped: true,
      items: allItems,
      sections
    },
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
